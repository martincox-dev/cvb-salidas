# Runbook — CVB Salidas

## Operación normal
- El bot corre en Bunny MC `cvb-salidas`.
- Revisa Gmail en `GMAIL_INBOX` según `GMAIL_POLL_INTERVAL_MS`.
- Escribe en `Registro` y marca checks en `Salidas`.

## Comprobación rápida
1. `GET /health` debe devolver `{"ok":true}`.
2. `GET /api/status` debe devolver estado y `lastPoll` reciente.
3. En logs deben verse líneas tipo `Gmail y Sheets listos`.

## Forzar ejecución manual
- `POST /api/poll-now`
- Ejemplo:
  ```bash
  curl -X POST "https://<endpoint>/api/poll-now"
  ```

## Formato de email válido
- Asunto: contiene `salidas` + fecha (`19 mayo`, `19 de mayo`, `19/05`, `19-05`, con año opcional).
- Cuerpo: lista de socios (comas/espacios/saltos de línea/`;`).

## Incidencias típicas
1. No registra nada:
- Verificar que el email llegó a `cvbenicasim@gmail.com`.
- Revisar `api/status` y logs del MC.
- Ejecutar `POST /api/poll-now`.

2. Entra ruido de correos no relacionados:
- Revisar formato del asunto/cuerpo.
- Opcional: usar `ALLOWED_SENDERS` si se quiere restringir remitentes.

3. Etiquetas de Gmail:
- Revisar `GMAIL_PROCESSED_LABEL` (recomendado `cvb-salidas-procesado`).
- El bot archiva (`INBOX` off) y etiqueta correos procesados/ignorados.

4. No arranca container:
- Revisar startup command (`git clone + npm ci + node`).
- Revisar variables `GOOGLE_*`, `SHEETS_ID`, `SHEETS_TAB`, `GMAIL_INBOX`.

## Valores recomendados
- `GMAIL_PROCESSED_LABEL=cvb-salidas-procesado`
- `GMAIL_POLL_INTERVAL_MS=86400000` (1 vez al día)
- `ALLOWED_SENDERS=` (vacío para aceptar todos)
