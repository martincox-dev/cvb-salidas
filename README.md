# cvb-salidas

Bot de registro de salidas del Club de Vela Benicàssim.
Recibe emails en `salidas@cvbenicasim.com` (reenviado a `cvbenicasim@gmail.com`), parsea las salidas y las escribe en Google Sheets.

---

## Desarrollo local

```bash
npm install
cp .env.example .env    # completar variables (ver sección Variables)
node server/gmail-auth.mjs   # solo la primera vez — obtiene el refresh_token
set -a; source .env; set +a; npm run dev
```

Nota: `runtime.mjs` no carga `.env` automáticamente; en local conviene arrancar exportando variables como en el comando anterior.

---

## Producción — Bunny Magic Container

### Startup command (panel MC → Entrypoint)

```sh
/bin/sh -c "apk add --no-cache git \
  && rm -rf /srv/app \
  && git clone --depth=1 https://github.com/martincox-dev/cvb-salidas.git /srv/app \
  && cd /srv/app && npm ci --omit=dev \
  && node server/runtime.mjs"
```

### Health checks (panel MC → Monitoring)

| Tipo      | Protocolo | Puerto | Path      |
|-----------|-----------|--------|-----------|
| Startup   | HTTP      | 3002   | /health   |
| Readiness | HTTP      | 3002   | /health   |
| Liveness  | HTTP      | 3002   | /health   |

### Variables de entorno (panel MC → Environment)

| Variable | Descripción |
|---|---|
| `PORT` | `3002` |
| `NODE_ENV` | `production` |
| `GOOGLE_CLIENT_ID` | OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token (obtenido con `npm run auth`) |
| `GMAIL_INBOX` | `cvbenicasim@gmail.com` |
| `ALLOWED_SENDERS` | Emails autorizados, separados por coma (usar remitentes reales de `From`) |
| `SHEETS_ID` | ID de la hoja de Google Sheets |
| `SHEETS_TAB` | Nombre de la pestaña (por defecto `Registro`) |
| `LIBSQL_URL` | Opcional — BunnyDB para log de auditoría |
| `LIBSQL_AUTH_TOKEN` | Opcional — token BunnyDB |

Valores operativos actuales:
- `SHEETS_ID=1st0IC8WVbfQmgMXO-3_SQehqiQFXWClS-mWW7Ygm_fU` (`CVB Salidas`)
- `SHEETS_TAB=Registro`

---

## Formato de email aceptado

**Asunto:** cualquiera (p.ej. `Salidas 19 junio`)

**Cuerpo:**
```
19 de junio
121, 310, 54, 32, 199
```

Formatos de fecha válidos: `19 de junio`, `19/06`, `19/06/2025`, `19-06`
Los números de socio pueden ir separados por comas, espacios o saltos de línea.

---

## Estructura de Google Sheets

La hoja tiene cuatro columnas:

| Fecha | Nº Socio | Registrado el | Registrado por |
|---|---|---|---|
| 2025-06-19 | 121 | 2025-06-19T10:32:00Z | marinero@cvb.com |

Una fila por socio por email. Para el recuento anual basta con filtrar por año en "Fecha".

---

## Scripts

| Script | Uso |
|---|---|
| `npm run dev` | Inicia el servidor en local |
| `npm run start` | Producción |
| `npm run auth` | Obtiene el refresh_token de Google (una vez) |

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check para Bunny MC |
| GET | `/api/status` | Estado del bot (emails procesados, errores, último poll) |
