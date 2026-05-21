import { createServer } from "node:http";
import { createClient } from "@libsql/client";
import {
  buildGmailClient,
  ensureProcessedLabel,
  fetchUnprocessedEmails,
  markAsProcessed,
} from "./gmail-poller.mjs";
import { buildSheetsClient, appendSalidas, ensureHeader } from "./sheets-writer.mjs";
import { parseEmail } from "./parser.mjs";

const PORT = Number(process.env.PORT || 3002);
const POLL_INTERVAL_MS = Math.max(60_000, Number(process.env.GMAIL_POLL_INTERVAL_MS || 120_000));
const PROCESSED_LABEL = process.env.GMAIL_PROCESSED_LABEL || "cvb-procesado";
const ALLOWED_SENDERS = (process.env.ALLOWED_SENDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const VALID_MEMBERS_CSV = process.env.VALID_MEMBERS || "";
const MEMBERS_SOURCE_TAB = process.env.MEMBERS_SOURCE_TAB || "Salidas";
const MEMBERS_SOURCE_RANGE = process.env.MEMBERS_SOURCE_RANGE || "A3:A300";
const LIBSQL_URL = process.env.LIBSQL_URL || "";
const LIBSQL_AUTH_TOKEN = process.env.LIBSQL_AUTH_TOKEN || "";

const db = LIBSQL_URL && LIBSQL_AUTH_TOKEN
  ? createClient({ url: LIBSQL_URL, authToken: LIBSQL_AUTH_TOKEN })
  : null;

let stats = { processed: 0, errors: 0, lastPoll: null, lastError: null };
let triggerPoll = null;
let pollRunning = false;

// ── HTTP server (health + status) ────────────────────────────────────────────

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && req.url === "/api/status") {
    return json(res, 200, { ...stats, pollIntervalMs: POLL_INTERVAL_MS });
  }
  if (req.method === "POST" && url.pathname === "/api/poll-now") {
    if (!triggerPoll) {
      return json(res, 503, { ok: false, error: "poll_not_ready" });
    }
    triggerPoll("manual").then((result) => json(res, 200, { ok: true, ...result }));
    return;
  }
  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`cvb-salidas escuchando en :${PORT}`));

// ── DB init ───────────────────────────────────────────────────────────────────

async function initDb() {
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS salidas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha       TEXT NOT NULL,
      socio       INTEGER NOT NULL,
      registrado  TEXT NOT NULL,
      remitente   TEXT NOT NULL
    )
  `);
}

// ── Polling loop ──────────────────────────────────────────────────────────────

async function poll(gmail, sheets, processedLabelId, validMembers) {
  if (pollRunning) return { skipped: true, reason: "already_running" };
  pollRunning = true;
  try {
    stats.lastPoll = new Date().toISOString();
    const beforeProcessed = stats.processed;
    const beforeErrors = stats.errors;

    let emails;
    try {
      emails = await fetchUnprocessedEmails(gmail, processedLabelId, ALLOWED_SENDERS);
    } catch (err) {
      stats.errors++;
      stats.lastError = err.message;
      console.error("Error al leer Gmail:", err.message);
      return { skipped: false, reason: "gmail_read_error" };
    }

    for (const { id, body, sender, subject, receivedAt } of emails) {
      const parsed = parseEmail(body, subject, receivedAt);

      if (!parsed) {
        console.warn(`Email ${id} de ${sender}: no se pudo parsear. Ignorado.`);
        await markAsProcessed(gmail, id, processedLabelId);
        continue;
      }

      const matchedMembers = parsed.members.filter((m) => validMembers.has(m));
      if (matchedMembers.length === 0) {
        console.warn(`Email ${id} de ${sender}: sin socios válidos. Ignorado.`);
        await markAsProcessed(gmail, id, processedLabelId);
        continue;
      }

      const { date } = parsed;
      console.log(`Email ${id} → ${date} | socios válidos: ${matchedMembers.join(", ")}`);

      try {
        const count = await appendSalidas(sheets, { date, members: matchedMembers, recordedBy: sender });
        stats.processed += count;

        if (db) {
          for (const socio of matchedMembers) {
            await db.execute({
              sql: "INSERT INTO salidas (fecha, socio, registrado, remitente) VALUES (?, ?, ?, ?)",
              args: [date, socio, new Date().toISOString(), sender],
            });
          }
        }

        await markAsProcessed(gmail, id, processedLabelId);
        console.log(`✓ ${count} salidas registradas (${date})`);
      } catch (err) {
        stats.errors++;
        stats.lastError = err.message;
        console.error(`Error al guardar salidas del email ${id}:`, err.message);
      }
    }

    return {
      skipped: false,
      checkedEmails: emails.length,
      addedRows: stats.processed - beforeProcessed,
      newErrors: stats.errors - beforeErrors,
    };
  } finally {
    pollRunning = false;
  }
}

// ── Arranque ──────────────────────────────────────────────────────────────────

async function main() {
  await initDb();

  const gmail = buildGmailClient();
  const sheets = buildSheetsClient();

  let processedLabelId;
  let validMembers;
  try {
    processedLabelId = await ensureProcessedLabel(gmail, PROCESSED_LABEL);
    await ensureHeader(sheets);
    validMembers = await loadValidMembers(sheets);
    if (validMembers.size === 0) {
      throw new Error("No se han podido cargar socios válidos");
    }
    console.log("Gmail y Sheets listos. Iniciando polling cada", POLL_INTERVAL_MS / 1000, "s");
  } catch (err) {
    console.error("Error en la inicialización:", err.message);
    process.exit(1);
  }

  const run = () => poll(gmail, sheets, processedLabelId, validMembers);
  triggerPoll = run;

  await run();
  setInterval(run, POLL_INTERVAL_MS);
}

main();

async function loadValidMembers(sheets) {
  const byEnv = VALID_MEMBERS_CSV
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (byEnv.length > 0) {
    return new Set(byEnv);
  }

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEETS_ID,
    range: `${MEMBERS_SOURCE_TAB}!${MEMBERS_SOURCE_RANGE}`,
  });

  const values = data.values || [];
  const parsed = values
    .flat()
    .map((v) => Number(String(v).replace(/\D/g, "")))
    .filter((n) => Number.isInteger(n) && n > 0);

  return new Set(parsed);
}
