import { google } from "googleapis";

const MONTHS_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

export function buildSheetsClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth });
}

/**
 * Añade filas a la hoja de salidas.
 * Una fila por socio: [Fecha, Nº Socio, Registrado el, Registrado por]
 */
export async function appendSalidas(sheets, { date, members, recordedBy }) {
  const sheetsId = process.env.SHEETS_ID;
  const tab = process.env.SHEETS_TAB || "Salidas";
  const recordedAt = new Date().toISOString();

  const rows = members.map((member) => [date, member, recordedAt, recordedBy]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetsId,
    range: `${tab}!A:D`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });

  await markMatrixChecks(sheets, { date, members });

  return rows.length;
}

/**
 * Asegura que la cabecera existe en la primera fila de la hoja.
 * Solo escribe si la celda A1 está vacía.
 */
export async function ensureHeader(sheets) {
  const sheetsId = process.env.SHEETS_ID;
  const tab = process.env.SHEETS_TAB || "Salidas";

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsId,
    range: `${tab}!A1`,
  });

  const isEmpty = !data.values || !data.values[0]?.[0];
  if (!isEmpty) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsId,
    range: `${tab}!A1:D1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["Fecha", "Nº Socio", "Registrado el", "Registrado por"]] },
  });
}

async function markMatrixChecks(sheets, { date, members }) {
  const matrixTab = process.env.MATRIX_TAB || "Salidas";
  const sheetsId = process.env.SHEETS_ID;
  const parsed = parseISODate(date);
  if (!parsed) return;

  const monthName = MONTHS_ES[parsed.month - 1];
  if (!monthName) return;

  const [monthDayToColumn, socioToRow] = await Promise.all([
    loadMonthDayToColumnMap(sheets, sheetsId, matrixTab),
    loadSocioRowMap(sheets, sheetsId, matrixTab),
  ]);

  const colIndex = monthDayToColumn.get(`${monthName}-${parsed.day}`);
  if (!colIndex) return;

  const data = [];
  for (const socio of members) {
    const row = socioToRow.get(socio);
    if (!row) continue;
    const a1 = `${matrixTab}!${columnToA1(colIndex)}${row}`;
    data.push({ range: a1, values: [["TRUE"]] });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetsId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

async function loadMonthDayToColumnMap(sheets, spreadsheetId, tab) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:NR2`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const row1 = data.values?.[0] || [];
  const row2 = data.values?.[1] || [];

  const map = new Map();
  let currentMonth = "";
  for (let i = 0; i < row2.length; i++) {
    const monthCandidate = normalizeMonth(row1[i]);
    if (monthCandidate) currentMonth = monthCandidate;
    if (!currentMonth) continue;

    const day = Number(row2[i]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;

    map.set(`${currentMonth}-${day}`, i + 1); // i is 0-based; A1 cols start at 1
  }

  return map;
}

async function loadSocioRowMap(sheets, spreadsheetId, tab) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A3:A300`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = data.values || [];
  const map = new Map();
  for (let i = 0; i < values.length; i++) {
    const socio = Number(values[i]?.[0]);
    if (!Number.isInteger(socio) || socio <= 0) continue;
    map.set(socio, i + 3); // starts at row 3
  }
  return map;
}

function parseISODate(date) {
  const m = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

function normalizeMonth(v) {
  const s = String(v || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return MONTHS_ES.includes(s) ? s : "";
}

function columnToA1(col) {
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
