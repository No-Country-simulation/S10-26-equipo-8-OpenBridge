# OB-37 — Conjunto de evaluación del asistente (adaptado a OB-33)

## Objetivo

Evaluar de forma repetible la descomposición de descripciones de negocio en capacidades técnicas y la recomendación de repositorios candidatos del catálogo, mediante `POST /api/v1/assistant/capabilities`.

## Contenido

- `data/assistant-evaluation.json`: 12 escenarios (11 con contexto suficiente y 1 escenario vago).
- `scripts/run-assistant-evaluation.mjs`: ejecuta los escenarios contra el endpoint real y guarda las respuestas HTTP sin inventar resultados.
- `scripts/evaluate-assistant.mjs`: calcula cobertura de capacidades y de componentes esperados por caso, promedios y diferencias contra la corrida anterior.
- `results/`: se completa al ejecutar la evaluación. No incluye resultados simulados.

## Contrato utilizado

Request:

```json
{
  "description": "Estoy construyendo un e-commerce B2B de logística",
  "constraints": { "minHealth": 60 }
}
```

Endpoint: `POST /api/v1/assistant/capabilities`.

Para escenarios exitosos el evaluador lee `response.data.capabilities[]`, compara `key` con `expected_capabilities` y busca los repositorios esperados dentro de `capability.candidates[].title`.
Para el caso vago espera HTTP `422` y código `INSUFFICIENT_CONTEXT`.

Las claves de capacidades contemplan categorías del catálogo indicadas por OB-33 (`auth`, `database`, `payments`, `search`, `analytics`) y capacidades cuya categoría puede no estar cubierta por el catálogo (por ejemplo `video` o `notifications`). OB-33 documenta que, si el catálogo no cubre una categoría, `category` puede ser `null` y la búsqueda se realiza contra el catálogo completo.

## Requisitos

- Node.js 18 o superior (se recomienda la misma versión del proyecto).
- Backend de OpenBridge levantado.
- Ollama disponible y modelo `qwen2.5:7b` descargado, además del modelo de embeddings requerido por el proyecto.
- Catálogo y base de datos accesibles para el backend.

## Ejecución paso a paso

1. Levantar los servicios siguiendo el README principal del repositorio.
2. Si Ollama está recién iniciado, precargar el modelo para evitar el timeout de la primera petición:
   ```bash
   ollama run qwen2.5:7b ""
   ```
3. Desde esta carpeta (`docs/testing/Ob-37`, porque los scripts leen `data/` y escriben `results/` relativos a la carpeta actual), configurar la URL real del backend y ejecutar:
   ```powershell
   # PowerShell
   cd docs/testing/Ob-37
   $env:ASSISTANT_API_URL="http://localhost:4000/api/v1/assistant/capabilities"
   node scripts/run-assistant-evaluation.mjs
   ```
   ```bash
   # bash
   cd docs/testing/Ob-37
   ASSISTANT_API_URL=http://localhost:4000/api/v1/assistant/capabilities node scripts/run-assistant-evaluation.mjs
   ```
   Si el backend usa otro puerto/base URL, reemplazar la URL por la que indique su configuración.
4. Evaluar las respuestas guardadas:
   ```bash
   node scripts/evaluate-assistant.mjs results/actual-results.json
   ```
5. Repetir después de modificar prompt/modelo. El evaluador guarda cada corrida en `results/history/run-<timestamp>.json` y actualiza `results/history/latest.json` para comparar con la anterior.

## Qué mide

- **Cobertura de capacidades:** cantidad de claves esperadas detectadas / cantidad de claves esperadas × 100.
- **Cobertura de componentes:** grupos de componentes esperados encontrados en los candidatos de la capacidad correspondiente / grupos esperados × 100. Cada grupo acepta alternativas para no penalizar implementaciones equivalentes.
- **Caso sin contexto:** PASS solamente si la API responde HTTP 422 con `INSUFFICIENT_CONTEXT`.
- **Sin respuesta o error HTTP:** se informa como `SIN_RESULTADO` o `ERROR_API`; no se transforma en 0% ni en PASS.

## Importante antes de tomar la primera corrida como línea base

Los identificadores de repositorio de `acceptable_repositories` son referencias esperadas iniciales basadas en las herramientas open source consideradas por el proyecto. QA debe contrastarlos con los `title` exactos presentes en el catálogo de la rama `dev`. Si el catálogo utiliza otro identificador, actualizar ese valor en el dataset antes de ejecutar la línea base. No agregar repositorios que no existan en el catálogo.

El evaluador mide cobertura del oráculo definido por QA, no una precisión semántica absoluta. Una recomendación alternativa válida puede requerir revisión humana y ajuste del conjunto de aceptaciones.

## Criterios de aceptación OB-37 cubiertos

- 12 escenarios, dentro del rango de 10 a 15.
- Cada escenario contiene descripción, capacidades esperadas, componentes esperados y comportamiento esperado.
- Se incluye un caso de contexto insuficiente.
- Se ejecuta el endpoint real de OB-33 y se conservan sus respuestas.
- Se informa cobertura de capacidades y componentes por escenario y promedio general.
- Se conserva historial y se compara con la ejecución anterior.
