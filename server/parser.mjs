const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Parsea un email de salidas.
 *
 * Reglas:
 * - La fecha se extrae del asunto.
 * - El asunto debe contener la palabra "salidas" (no sensible a mayúsculas).
 * - La fecha debe incluir año y debe ser del año en curso.
 *
 * Variantes de fecha en asunto admitidas:
 *   "salidas 10 junio 2026"
 *   "Salidas 10 de junio de 2026"
 *   "salidas 10/06/2026"
 *   "salidas 10-06-2026"
 *
 * El cuerpo contiene números de socio separados por comas, espacios o saltos de línea.
 */
export function parseEmail(bodyText, subjectText = "") {
  const date = parseDateFromSubject(subjectText);
  if (!date) return null;

  const memberText = normalizeBodyForMembers(bodyText || "");
  const members = memberText
    .split(/[\s,;]+/)
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean)
    .map(Number)
    .filter((n) => n > 0 && n < 10000)
    .filter((n, i, arr) => arr.indexOf(n) === i);

  if (members.length === 0) return null;

  return { date, members };
}

function parseDateFromSubject(rawSubject) {
  const subject = normalize(rawSubject);
  if (!subject.includes("salidas")) return null;

  const currentYear = new Date().getFullYear();

  // "10 junio 2026" | "10 de junio de 2026"
  const textMatch = subject.match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4})/i);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const month = MESES[textMatch[2].toLowerCase()];
    const year = parseInt(textMatch[3], 10);
    if (month && year === currentYear) return toISO(year, month, day);
    return null;
  }

  // "10/06/2026" | "10-06-2026"
  const numMatch = subject.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10);
    const year = parseInt(numMatch[3], 10);
    if (year === currentYear) return toISO(year, month, day);
    return null;
  }

  return null;
}

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeBodyForMembers(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");

  const cleaned = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) continue; // texto citado de respuestas/reenvíos
    if (line === "--" || line === "-- ") break; // separador típico de firma

    const normalized = normalize(line);
    if (
      normalized.includes("enviado desde mi") ||
      normalized.includes("este mensaje") ||
      normalized.includes("confidencial") ||
      normalized.includes("aviso legal")
    ) {
      continue;
    }

    cleaned.push(line);
  }

  return cleaned.join(" ");
}

function toISO(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
