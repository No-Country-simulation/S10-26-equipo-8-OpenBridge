# Módulo de Sincronización Automatizada (OB-13)

Este módulo ejecuta el pipeline del catálogo de forma programada o manual: extrae métricas desde GitHub, recalcula la salud de los repositorios, genera embeddings y registra cada ejecución en `sync_run`.

## 📋 Tabla de Contenidos

1. [Flujo del Proceso](#-flujo-del-proceso)
2. [Estructura de Datos (sync_run)](#-estructura-de-datos-sync_run)
3. [Arquitectura del Código](#-arquitectura-del-código)
4. [Estrategia de Orquestación](#-estrategia-de-orquestación)
5. [Guía de Uso y Pruebas](#-guía-de-uso-y-pruebas)

---

## 🔄 Flujo del Proceso

1. **Extraer y recalcular salud:** `syncRepos` consulta el inventario de `seed/repos.yaml` en GitHub GraphQL, calcula el puntaje de salud con las métricas actuales y persiste cada repositorio por lote.
2. **Generar vectores:** terminada la extracción, el pipeline construye contenido semántico con los datos del repositorio y genera embeddings mediante Ollama y `nomic-embed-text`.
3. **Cerrar el registro:** si ambas etapas terminan, el estado pasa a `COMPLETED`. Los repositorios no encontrados o con errores por alias se cuentan como fallidos. Si una etapa crítica falla, la ejecución queda `FAILED` con su error.

Los cambios de GitHub se guardan por lote, así que un fallo posterior al extraer no revierte métricas ya persistidas. La ejecución fallida se puede relanzar: el proceso retoma repositorios pendientes y vuelve a generar los embeddings.

## 🗃️ Estructura de Datos (sync_run)

`sync_run` conserva el estado y el progreso de cada ejecución:

| Campo                                         | Descripción                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| `status`                                      | `RUNNING`, `COMPLETED` o `FAILED`                    |
| `started_at`, `finished_at`                   | Inicio y cierre de la ejecución                      |
| `repos_total`                                 | Repositorios incluidos                               |
| `repos_ok`, `repos_failed`                    | Repositorios sincronizados correctamente y fallidos  |
| `rate_limit_used`                             | Puntos de GitHub GraphQL consumidos                  |
| `rate_limit_remaining`, `rate_limit_reset_at` | Saldo y hora de reinicio informados por GitHub       |
| `error`                                       | Motivo de fallo de una etapa crítica, si corresponde |

La duración se calcula con `finished_at - started_at`. Los contadores se actualizan por lote. Si algunos repositorios fallan, se conserva su conteo aunque el pipeline complete; el comando devuelve un código de error para que Actions reporte la ejecución parcial.

## 🧩 Arquitectura del Código

- `src/ingest/sync-cli.ts`: carga el inventario y conecta sincronización, vectores y base de datos.
- `src/ingest/sync-run.ts`: crea o retoma el registro, guarda los contadores por lote y cierra la ejecución.
- `src/ingest/github.ts`: consulta GitHub, calcula salud y persiste métricas del repositorio.
- `src/ingest/embeddings.ts`: crea el texto semántico, solicita vectores a Ollama en lotes y los guarda.
- `src/db/embeddings.ts`: persiste un embedding por entidad y reemplaza el vector al regenerarlo.
- `.github/workflows/daily-sync.yml`: define los disparadores automáticos y manuales.

La sincronización genera embeddings para repositorios. El esquema también admite embeddings de ideas de integración, pero esta tarea no los regenera.

## ⏱️ Estrategia de Orquestación

GitHub Actions ejecuta el workflow a las **03:00 UTC** todos los días (`0 3 * * *`). Para forzar una ejecución, usa **Actions → Daily catalog sync → Run workflow**. Ambos disparadores llaman al mismo comando, `npm run db:sync -w backend`.

El workflow evita ejecuciones concurrentes y realiza estos pasos:

1. Instala dependencias con `npm ci`.
2. Inicia Ollama y descarga `nomic-embed-text`.
3. Aplica las migraciones de la base configurada.
4. Ejecuta la sincronización.

Configura en **Settings → Secrets and variables → Actions**:

- `DATABASE_URL`: URL de PostgreSQL con pgvector.
- `CATALOG_GITHUB_TOKEN`: token de GitHub con acceso de lectura a los repositorios públicos consultados.

Actions entrega el token al proceso como `GITHUB_TOKEN`. Los secretos nunca se guardan en el repositorio.

## 🧪 Guía de Uso y Pruebas

Para ejecutarlo localmente, configura `backend/.env` con `DATABASE_URL` y `GITHUB_TOKEN`, inicia PostgreSQL con pgvector y Ollama, y ejecuta desde la raíz:

```powershell
npm run db:up
npm run db:migrate -w backend
ollama pull nomic-embed-text
npm run db:sync -w backend
```

Ollama usa `http://127.0.0.1:11434` por defecto. Puedes configurar `OLLAMA_BASE_URL` y `OLLAMA_EMBEDDING_MODEL`; el modelo debe generar vectores de 768 dimensiones.

Validación del backend:

```powershell
npm run build -w backend
npm run lint -w backend
npm run test -w backend
```

Los tests de base de datos requieren Docker/PostgreSQL local, ya que crean bases temporales.
