import { google } from "googleapis";

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
