# OB-37 — Conjunto de evaluación del asistente (OB-33 y OB-34)

## Objetivo

Evaluar de forma repetible la descomposición de descripciones de negocio en capacidades técnicas y la recomendación de repositorios del catálogo. Dos modos:

- `capabilities` (OB-33): `POST /api/v1/assistant/capabilities`, respuesta JSON.
- `proposals` (OB-34): `POST /api/v1/assistant/proposals`, respuesta SSE con la propuesta completa.

## Contenido

- `data/assistant-evaluation.json`: 12 escenarios (11 con contexto suficiente y 1 vago).
- `scripts/run-assistant-evaluation.mjs`: ejecuta los escenarios contra el endpoint real y guarda las respuestas sin inventar resultados.
- `scripts/evaluate-assistant.mjs`: calcula cobertura de capacidades y componentes por caso, promedios, estado según umbral y diferencia contra la corrida anterior del mismo modo.
- `results/`: se completa al ejecutar la evaluación. No incluye resultados simulados.

Los scripts no tienen dependencias: solo módulos nativos de Node y `fetch` global.

## Contratos utilizados

Request (ambos modos):

```json
{
  "description": "Estoy construyendo un e-commerce B2B de logística",
  "constraints": { "minHealth": 40 }
}
```

**capabilities.** Respuesta `response.data.capabilities[]`; los repositorios esperados se buscan en `capability.candidates[].title`. El caso vago devuelve HTTP `422` con código `INSUFFICIENT_CONTEXT`.

**proposals.** Respuesta `text/event-stream`:

- `event: progress`, data `{ "stage": "ANALYZING" | "RETRIEVING" | "COMPOSING" }`.
- `event: result`, data `{ "data": Proposal }`.
- `event: error`, data `{ "error": { code, message, details } }`.
- Los bloques sin `data:` (por ejemplo el keep-alive `: ping`) se ignoran.
- Los errores de validación llegan ANTES del stream como JSON plano con HTTP 400/413.
- Un caso vago llega como evento `error` con `INSUFFICIENT_CONTEXT` y HTTP 200 (a diferencia de `capabilities`, que usa 422).

Las claves de capacidades contemplan categorías del catálogo (`auth`, `database`, `payments`, `search`, `analytics`) y otras que el catálogo puede no cubrir (`video`, `notifications`). Si no hay cobertura, OB-33 devuelve `category: null` y busca en todo el catálogo; OB-34 la informa en `gaps`.

## Requisitos

- Node.js 18 o superior (se recomienda la versión del proyecto, 22).
- Backend de OpenBridge levantado, con Ollama (`qwen2.5:7b` y el modelo de embeddings del proyecto) y catálogo accesibles.

## Variables de entorno

| Variable             | Default                        | Uso                                                                       |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `ASSISTANT_MODE`     | `capabilities`                 | `capabilities` o `proposals`.                                             |
| `ASSISTANT_API_BASE` | `http://localhost:4000/api/v1` | Base de la API. El endpoint es `<base>/assistant/<mode>`.                 |
| `ASSISTANT_API_URL`  | derivado de modo + base        | Endpoint completo; si se define, pisa al derivado.                        |
| `MIN_HEALTH`         | `40`                           | `constraints.minHealth` enviado (umbral de madurez de OB-34).             |
| `PASS_THRESHOLD`     | `80`                           | Evaluador: % mínimo de cobertura (capacidades y componentes) para `PASS`. |

## Ejecución paso a paso

1. Levantar los servicios siguiendo el README principal. Si Ollama está recién iniciado, precargar el modelo para evitar el timeout de la primera petición:
   ```bash
   ollama run qwen2.5:7b ""
   ```
2. Desde esta carpeta (`docs/testing/Ob-37`: los scripts leen `data/` y escriben `results/` relativos a la carpeta actual), ejecutar el modo deseado.

   PowerShell:

   ```powershell
   cd docs/testing/Ob-37

   # OB-33 (capabilities, modo por defecto)
   node scripts/run-assistant-evaluation.mjs

   # OB-34 (proposals)
   $env:ASSISTANT_MODE="proposals"
   node scripts/run-assistant-evaluation.mjs

   # Otra API / umbral distinto
   $env:ASSISTANT_API_BASE="http://localhost:4001/api/v1"
   $env:PASS_THRESHOLD="90"
   ```

   bash:

   ```bash
   cd docs/testing/Ob-37

   # OB-33 (capabilities, modo por defecto)
   node scripts/run-assistant-evaluation.mjs

   # OB-34 (proposals)
   ASSISTANT_MODE=proposals node scripts/run-assistant-evaluation.mjs

   # Otra API / umbral distinto
   ASSISTANT_MODE=proposals ASSISTANT_API_BASE=http://localhost:4001/api/v1 node scripts/run-assistant-evaluation.mjs
   ```

3. Evaluar las respuestas guardadas (el modo se lee de `results/actual-results.json`):
   ```bash
   node scripts/evaluate-assistant.mjs results/actual-results.json
   # con otro umbral: PASS_THRESHOLD=90 node scripts/evaluate-assistant.mjs
   ```
4. Repetir después de modificar prompt/modelo.

`results/actual-results.json` tiene la forma `{ mode, endpoint, executed_at, results: [...] }`. El evaluador sigue aceptando el formato anterior (array plano) y lo trata como `capabilities`.

Cada resultado en modo `proposals` incluye `http_status`, `stages` (etapas vistas), y `proposal` (data de `result`) o `error` (data de `error`); si no hubo respuesta, `transport_error`.

## Historial por modo

El evaluador guarda cada corrida en `results/history/<mode>/run-<timestamp>.json` y actualiza `results/history/<mode>/latest.json`. Una corrida solo se compara con la anterior del MISMO modo.

## Qué mide

- **Cobertura de capacidades:** claves esperadas detectadas / claves esperadas × 100. Se leen de `capabilities[].key` (OB-33) o `proposal.capabilities[].key` (OB-34).
- **Cobertura de componentes:** grupos esperados encontrados / grupos esperados × 100. Cada grupo acepta alternativas para no penalizar implementaciones equivalentes.
  - `capabilities`: algún `candidates[].title` de la capacidad coincide con un repositorio aceptado.
  - `proposals`: el componente de esa capacidad (`components[].capability`) tiene `repository.fullName` O `alternative.fullName` dentro de los repositorios aceptados.
  - La comparación normaliza (minúsculas, sin URL de GitHub ni `.git`) y acepta coincidencia exacta o por sufijo `owner/repo`.
- **Grupos en `gaps` (solo `proposals`):** por caso, cuántos grupos esperados terminaron en `proposal.gaps` (columna `gaps` como `n/total`). Es informativo, no altera el estado.
- **Estado por caso:** `PASS` si la cobertura de capacidades y la de componentes (o `null` si no hay grupos esperados) son ≥ `PASS_THRESHOLD`; si no, `REVISAR`. El umbral se imprime en el resumen y se guarda en el reporte (`pass_threshold_percent`).
- **Caso sin contexto:** `PASS` si es un evento `error` con `INSUFFICIENT_CONTEXT` (`proposals`) o HTTP 422 con ese código (`capabilities`); si no, `FAIL`.
- **Sin respuesta o error HTTP:** `SIN_RESULTADO` (error de transporte / no ejecutado) o `ERROR_API` (HTTP no exitoso o sin propuesta); nunca se transforman en 0 % ni en `PASS`.

## Importante antes de tomar la primera corrida como línea base

Los identificadores de `acceptable_repositories` deben existir en el catálogo de `dev` (`seed/repos.yaml`). Si el catálogo usa otro identificador, actualizar el dataset antes de la línea base. No agregar repositorios que no existan en el catálogo.

El evaluador mide cobertura del oráculo definido por QA, no precisión semántica absoluta. Una recomendación alternativa válida puede requerir revisión humana y ajuste del conjunto de aceptaciones.

El caso `EVAL-012` envía únicamente `"Quiero hacer una app."` al modelo; su explicación está en el campo `notes`, que el runner no envía.

## Criterios de aceptación OB-37 cubiertos

- 12 escenarios, dentro del rango de 10 a 15.
- Cada escenario contiene descripción, capacidades esperadas, componentes esperados y comportamiento esperado.
- Se incluye un caso de contexto insuficiente.
- Se ejecutan los endpoints reales de OB-33 y OB-34 y se conservan sus respuestas.
- Se informa cobertura de capacidades y componentes por escenario y promedio general.
- Se conserva historial por modo y se compara con la ejecución anterior del mismo modo.
