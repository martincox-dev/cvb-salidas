/**
 * Ejecutar UNA VEZ para obtener el refresh_token de Google OAuth2.
 *
 * Pasos:
 *   1. Crea un proyecto en https://console.cloud.google.com
 *   2. Habilita Gmail API + Google Sheets API
 *   3. Crea credenciales OAuth 2.0 → tipo "Aplicación de escritorio"
 *   4. Descarga el JSON y copia client_id y client_secret al .env
 *   5. Ejecuta: node server/gmail-auth.mjs
 *   6. Abre la URL que aparece, autoriza la cuenta cvbenicasim@gmail.com
 *   7. Pega el código que te redirige aquí
 *   8. Copia el refresh_token al .env como GOOGLE_REFRESH_TOKEN
 */

import { createInterface } from "node:readline";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/spreadsheets",
];

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob",
);

const url = auth.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });

console.log("\nAbre esta URL en el navegador con la cuenta cvbenicasim@gmail.com:\n");
console.log(url);
console.log();

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Pega aquí el código de autorización: ", async (code) => {
  rl.close();
  const { tokens } = await auth.getToken(code.trim());
  console.log("\n✓ Tokens obtenidos. Añade esto a tu .env:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
});
