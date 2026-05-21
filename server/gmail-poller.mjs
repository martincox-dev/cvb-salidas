import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
];

export function buildGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

/**
 * Asegura que existe la etiqueta de procesado y devuelve su ID.
 */
export async function ensureProcessedLabel(gmail, labelName) {
  const { data } = await gmail.users.labels.list({ userId: "me" });
  const existing = data.labels.find((l) => l.name === labelName);
  if (existing) return existing.id;

  const { data: created } = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: labelName, labelListVisibility: "labelHide", messageListVisibility: "hide" },
  });
  return created.id;
}

/**
 * Devuelve los emails no procesados de remitentes autorizados.
 * "No procesado" = no tiene la etiqueta GMAIL_PROCESSED_LABEL.
 */
export async function fetchUnprocessedEmails(gmail, processedLabelId, allowedSenders) {
  const senderFilter = allowedSenders.length
    ? allowedSenders.map((s) => `from:${s}`).join(" OR ")
    : "";

  const q = [
    `-label:${process.env.GMAIL_PROCESSED_LABEL || "cvb-salidas-procesado"}`,
    senderFilter,
  ].filter(Boolean).join(" ");

  const { data } = await gmail.users.messages.list({ userId: "me", q, maxResults: 50 });
  const messages = data.messages || [];

  const results = [];
  for (const { id } of messages) {
    const { data: msg } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const body = extractBody(msg);
    const sender = extractHeader(msg, "From");
    const subject = extractHeader(msg, "Subject");
    const receivedAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null;
    results.push({ id, body, sender, subject, receivedAt });
  }

  return results;
}

/**
 * Marca un email como procesado añadiéndole la etiqueta y quitándolo de la bandeja de entrada.
 */
export async function markAsProcessed(gmail, messageId, processedLabelId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [processedLabelId],
      removeLabelIds: ["INBOX"],
    },
  });
}

function extractBody(msg) {
  const parts = msg.payload.parts || [msg.payload];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
  }
  // fallback: body directo
  if (msg.payload.body?.data) {
    return Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
  }
  return "";
}

function extractHeader(msg, name) {
  const header = (msg.payload.headers || []).find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
}
