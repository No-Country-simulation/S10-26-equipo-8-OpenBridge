# Carga inicial del catálogo (OB-17)

La carga importa los repositorios de `seed/repos.yaml`, consulta
sus métricas actuales en GitHub y guarda cada repositorio con su puntaje de
salud y categoría. La lista tiene 136 repositorios; el proceso debe cargar al
menos el 98 % (134 repositorios) para considerarse exitoso.
La licencia SPDX se toma del campo `license` del YAML, que prevalece sobre la
licencia detectada por GitHub.
El indicador `active_maintainer` se infiere a partir de PRs mergeados en los
últimos 90 días. Los proyectos que gestionan su actividad fuera de PRs (por
ejemplo, Postgres mediante listas de correo) aparecerán como `false` aunque
sigan activos.

## Requisitos

- Docker en ejecución.
- `backend/.env` configurado con `DATABASE_URL` y `GITHUB_TOKEN`. Puedes copiar
  `backend/.env.example` como punto de partida. El token necesita acceso de
  lectura a repositorios públicos; no lo compartas ni lo subas al repositorio.

## Ejecutar

Desde la raíz del proyecto:

```powershell
npm run db:up
npm run db:migrate -w backend
npm run db:load-initial -w backend
```

La carga es idempotente: puedes volver a ejecutarla para actualizar los datos.
Si GitHub rechaza un lote, el proceso lo divide y reintenta con grupos menores.
Al finalizar, genera `backend/reports/initial-load-report.json` con el resultado
y el detalle de cada repositorio que no pudo cargarse. El comando termina con
error si no se alcanza el 98 %.

# Sincronización diaria (OB-13)

`npm run db:sync -w backend` ejecuta el pipeline completo y deja el registro en
`sync_run`:

1. **Extraer y recalcular salud:** `syncRepos` consulta en GitHub los
   repositorios de `seed/repos.yaml`, recalcula su salud y los guarda por lote.
2. **Generar vectores:** pide a Ollama (`bge-m3`, 1024 dimensiones) los
   embeddings de cada repositorio y de cada idea aprobada. Ver
   [Vectores semánticos](#vectores-semánticos-ob-12).
3. **Cerrar el registro:** la ejecución queda `COMPLETED`, o `FAILED` con el
   error si falla una etapa. Las métricas ya guardadas no se revierten, y al
   relanzar se retoman los repositorios pendientes.

La duración es `finished_at - started_at`. El comando termina con error si algún
repositorio falla, para que Actions marque la ejecución parcial.

## Ejecución programada y manual

`.github/workflows/daily-sync.yml` corre todos los días a las **03:00 UTC**. Para
forzarla: **Actions → Daily catalog sync → Run workflow**. Ambos disparadores
ejecutan el mismo comando y nunca corren dos a la vez.

Secrets requeridos en **Settings → Secrets and variables → Actions**:

- `DATABASE_URL`: PostgreSQL con pgvector.
- `CATALOG_GITHUB_TOKEN`: token con lectura de repositorios públicos (llega al
  proceso como `GITHUB_TOKEN`).

## Ejecutar en local

```powershell
npm run db:up
npm run db:migrate -w backend
ollama pull bge-m3
npm run db:sync -w backend
```

Ollama se usa en `http://127.0.0.1:11434` por defecto; se puede cambiar con
`OLLAMA_BASE_URL` y `OLLAMA_EMBEDDING_MODEL`.

# Vectores semánticos (OB-12)

`npm run db:embed -w backend` corre solo la etapa de vectores, sin consultar
GitHub (por ejemplo, después de aprobar ideas). `db:sync` la corre al final.

- **Qué se vectoriza:** el perfil de cada repo (nombre, descripción, categorías,
  temas, lenguaje y hasta 5 ideas aprobadas) y cada idea `APPROVED`. Las ideas en
  borrador o rechazadas no; si una idea deja de estar aprobada o se borra un
  repo, su vector se elimina.
- **Modelo:** `bge-m3`, multilingüe (las consultas llegan en español y los
  README están en inglés). Documentos y consultas (`embedQuery`, para la
  búsqueda de OB-32) se envían sin prefijo. Las categorías entran con su nombre
  y descripción en español.
- **Incremental:** `embedding.content_hash` guarda el sha256 del modelo y el
  texto enviado. Si no cambió, el vector no se recalcula; cambiar de modelo
  regenera todo.
- **Errores:** cada lote se reintenta una vez. Si vuelve a fallar, se informa en
  la consola y la corrida sigue con el lote siguiente; el comando termina con
  error para que Actions lo marque.

## Logs estructurados y estado del servicio (OB-42)

Cada petición HTTP genera un log JSON con `requestId`, `method`, `path`,
`statusCode` y `durationMs`. El `requestId` también se devuelve en el header
`X-Request-Id`; `path` no incluye la query string.

`GET /health` ejecuta `SELECT 1` contra la misma base de datos que usa la
aplicación. Responde `200` con `{"status":"ok"}` si está disponible y `503` con
`{"status":"error"}` si la consulta falla.
