<div align="center">

# 🌉 OpenBridge

**Catálogo inteligente de herramientas open source con un asistente de IA que arma el stack según tu negocio.**

[![CI](https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge/actions/workflows/ci.yml)
[![Daily catalog sync](https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge/actions/workflows/daily-sync.yml/badge.svg)](https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge/actions/workflows/daily-sync.yml)

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.9-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17_%2B_pgvector-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black)
![Ollama](https://img.shields.io/badge/Ollama-qwen2.5%3A7b_%C2%B7_bge--m3-000000?logo=ollama&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-~300_tests-6E9F18?logo=vitest&logoColor=white)

Simulación Laboral **NoCountry** · Cohorte S10-26 · **Equipo 8**

[Funcionalidades](#-funcionalidades) · [Arquitectura](#%EF%B8%8F-arquitectura) · [API](#-api-apiv1) · [Inicio rápido](#-inicio-rápido) · [Deploy](#%EF%B8%8F-deploy) · [Equipo](#-equipo)

</div>

---

## 💡 El problema

Un arquitecto o líder técnico pierde **entre 15 y 20 horas por proyecto** investigando herramientas open source a mano. La información está dispersa entre GitHub, listas "Awesome" y foros, y encontrar una herramienta es la parte fácil: lo difícil es saber **si sirve para tu negocio**, **si sigue mantenida**, **si la licencia te complica** y **cómo encaja con el resto**.

## ✨ La propuesta

OpenBridge reúne un catálogo curado de **136 repositorios en 6 categorías** y le suma tres cosas que un buscador común no te da:

| Pregunta                    | Cómo la responde OpenBridge                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| _¿Dónde busco?_             | Un catálogo único: Autenticación, Base de Datos, Pagos, IA, Analítica y Búsqueda                                |
| _¿Esta librería está viva?_ | **Puntaje de salud 0–100** y nivel de mantenimiento, recalculados **todos los días** desde GitHub               |
| _¿Qué uso para MI negocio?_ | Un **asistente** que descompone tu negocio en capacidades y arma un **mapa de arquitectura** justificado        |
| _¿Cómo lo integro?_         | **Ideas de integración estructuradas** (REST, Docker, SDK, Webhook, CLI) con disparadores, snippet y dificultad |

> De 20 horas de investigación a minutos: no solo **qué** usar, sino si es **seguro** usarlo y **cómo** encaja.

---

## 🚀 Funcionalidades

- 📚 **Catálogo con filtros**: categoría, lenguaje, licencia, nivel de mantenimiento y estrellas mínimas; orden por salud, estrellas, actualización o relevancia.
- 🔎 **Búsqueda por texto**: full-text de PostgreSQL en inglés y español (los repos se indexan en inglés y las categorías en español).
- 🧠 **Búsqueda por significado**: embeddings `bge-m3` de **1024 dimensiones** con índice **HNSW** (similitud coseno) en pgvector, dentro del mismo Postgres.
- 🩺 **Puntaje de salud**: pondera último commit, commits recientes, resolución de issues, estrellas, releases y contribuidores activos.
- 🤖 **Asistente de arquitectura**: `qwen2.5:7b` descompone el negocio en 3 a 8 capacidades (salida JSON forzada y validada con Zod), la búsqueda vectorial elige candidatos del catálogo real y un **ranking explicable** arma la propuesta.
- 📡 **Streaming en vivo (SSE)**: la interfaz muestra las etapas _Analizando → Buscando → Armando_ mientras el servidor trabaja.
- 🗺️ **Mapa de arquitectura interactivo**: React Flow, ajustes en lenguaje natural ("cambiá X por algo más liviano") y exportación a PNG o Markdown.
- 💡 **Ideas de integración con curaduría humana**: las genera un LLM como borrador y **no se publican hasta que una persona las aprueba**.
- 🔄 **Sincronización diaria**: GitHub Actions actualiza métricas, salud y vectores a las 03:00 UTC, de forma incremental y reanudable.

<details>
<summary><b>📐 Cómo se calcula el puntaje de salud</b></summary>

<br>

| Factor                         | Peso | Cálculo                            |
| ------------------------------ | ---: | ---------------------------------- |
| Antigüedad del último commit   |   30 | `1 − días / 365`                   |
| Commits en los últimos 90 días |   20 | `commits / 10` (tope 1)            |
| Resolución de issues           |   15 | `cerradas / (abiertas + cerradas)` |
| Estrellas                      |   15 | Escala logarítmica hasta 100.000   |
| Release en el último año       |   10 | 1 o 0                              |
| Contribuidores activos         |   10 | `contribuidores / 5` (tope 1)      |

**Niveles:** ≥ 70 `ACTIVE` · ≥ 40 `MODERATE` · resto `AT_RISK` · `ARCHIVED` si GitHub lo marca. Si el último commit tiene más de un año, el puntaje queda en 39 como máximo.

El cálculo vive en [`backend/src/ingest/health.ts`](backend/src/ingest/health.ts).

</details>

<details>
<summary><b>⚖️ Cómo elige el asistente cada componente</b></summary>

<br>

```text
puntaje = 0.6 × similitud + 0.25 × salud + 0.15 × popularidad
```

- Solo entran candidatos con salud de al menos `max(40, constraints.minHealth)` y, si se piden, con las licencias de `constraints.licenses`.
- Si ninguna opción del catálogo es madura, la capacidad va a **`gaps`** en lugar de inventar una herramienta.
- Las conexiones entre componentes salen de las ideas `APPROVED` del catálogo o, si no hay, de las dependencias que sugirió el modelo.
- Si la descripción es vaga, responde **`422 INSUFFICIENT_CONTEXT`** con hasta 3 preguntas: prefiere preguntar antes que alucinar.

Pesos en [`backend/src/assistant/compose.ts`](backend/src/assistant/compose.ts). Las instrucciones del modelo están versionadas como código en [`backend/prompts/`](backend/prompts/) (`assistant/capabilities/v1`–`v4`, `ideas/v1`–`v2`).

</details>

---

## 🏗️ Arquitectura

```mermaid
flowchart LR
    user(["👤 Usuario"])

    subgraph vercel["▲ Vercel"]
        web["Next.js 16<br/>App Router · React 19"]
    end

    subgraph render["☁️ Render"]
        api["Express 5 API<br/>TypeScript · Zod"]
    end

    subgraph neon["🐘 Neon"]
        db[("PostgreSQL 17<br/>+ pgvector (HNSW)")]
    end

    subgraph gpu["🖥️ Máquina del equipo (GPU)"]
        proxy["Caddy<br/>Bearer OLLAMA_API_KEY"]
        ollama["Ollama<br/>qwen2.5:7b · bge-m3"]
    end

    subgraph gha["⚙️ GitHub Actions"]
        cron["daily-sync<br/>03:00 UTC"]
    end

    gh[("GitHub<br/>GraphQL API")]

    user --> web
    web -- "HTTP / SSE<br/>/api/v1" --> api
    api -- "Drizzle ORM" --> db
    api -- "túnel HTTPS" --> proxy --> ollama
    cron -- "métricas" --> gh
    cron -- "salud + embeddings" --> db
```

<details>
<summary><b>🔁 Flujo del asistente (<code>POST /api/v1/assistant/proposals</code>)</b></summary>

<br>

```mermaid
sequenceDiagram
    autonumber
    participant W as Next.js
    participant A as Express API
    participant L as Ollama (qwen2.5:7b)
    participant E as Ollama (bge-m3)
    participant P as Postgres + pgvector

    W->>A: descripción del negocio + restricciones
    A-->>W: event: progress (ANALYZING)
    A->>L: descomponer en capacidades (JSON schema)
    L-->>A: 3 a 8 capacidades (validadas con Zod)
    A-->>W: event: progress (RETRIEVING)
    loop por cada capacidad
        A->>E: vectorizar la capacidad
        A->>P: búsqueda por similitud coseno (HNSW)
    end
    A-->>W: event: progress (COMPOSING)
    A->>A: ranking 0.6 sim + 0.25 salud + 0.15 popularidad
    A-->>W: event: result (componentes, conexiones, gaps)
```

</details>

### Estructura del monorepo

```text
.
├── frontend/                 # Next.js (App Router): /, /catalogo, /repositorios/[id], /asistente
├── backend/
│   ├── src/
│   │   ├── catalog/          # repositorios, filtros y categorías
│   │   ├── search/           # búsqueda por significado
│   │   ├── assistant/        # capacidades, ranking y propuestas (SSE)
│   │   ├── ideas/            # generador de ideas de integración con IA
│   │   ├── ingest/           # carga inicial, sincronización, salud y embeddings
│   │   └── db/               # esquema Drizzle, migraciones y semilla
│   ├── drizzle/              # migraciones SQL versionadas
│   ├── prompts/              # instrucciones del LLM, versionadas
│   └── test/                 # Vitest + supertest
├── seed/repos.yaml           # los 136 repositorios curados
├── docker/postgres/init/     # habilita la extensión vector
├── docs/                     # deploy, Ollama local y estrategia de pruebas
├── docker-compose.yml        # Postgres 17 + pgvector local
└── render.yaml               # Blueprint de Render
```

---

## 🧰 Stack

| Capa                 | Tecnología                                                      | Versión             |
| -------------------- | --------------------------------------------------------------- | ------------------- |
| Monorepo             | npm workspaces (`frontend`, `backend`)                          | Node ≥ 22.9         |
| Frontend             | Next.js · React · Tailwind CSS · TypeScript                     | 16.4 · 19.3 · 4 · 5 |
| UI                   | shadcn · Base UI · lucide-react                                 | 4.22 · 1.9 · 1.61   |
| Mapa de arquitectura | @xyflow/react (React Flow) · html-to-image                      | 12.12 · 1.11        |
| Backend              | Express · TypeScript (ESM) · Zod                                | 5.3 · 7.0 · 4.6     |
| ORM y migraciones    | Drizzle ORM · drizzle-kit                                       | 0.45 · 0.31         |
| Base de datos        | PostgreSQL + pgvector (`pgvector/pgvector:pg17`)                | 17                  |
| IA                   | LangChain.js (`@langchain/core`, `@langchain/ollama`) · Ollama  | 1.3                 |
| Modelos              | `qwen2.5:7b` (generación) · `bge-m3` (embeddings, 1024 dim)     | —                   |
| Fuente de datos      | GitHub GraphQL API                                              | —                   |
| Tests                | Vitest · Supertest                                              | 5.0 · 7.3           |
| Calidad              | ESLint (0 warnings) · Prettier                                  | 10 · 3              |
| CI/CD                | GitHub Actions · Render (API) · Vercel (interfaz) · Neon (base) | —                   |

---

## 🗃️ Modelo de datos

```mermaid
erDiagram
    category ||--o{ repository_category : agrupa
    repository ||--o{ repository_category : pertenece
    repository ||--o{ integration_idea : tiene
    repository ||--o| embedding : "se vectoriza (REPOSITORY)"
    integration_idea ||--o| embedding : "se vectoriza (INTEGRATION_IDEA)"

    category {
        uuid id PK
        text slug UK
        text name
        text description
    }
    repository {
        uuid id PK
        bigint github_id UK
        text full_name
        text license_spdx
        int stars
        smallint health_score "0 a 100"
        enum maintenance_level "ACTIVE MODERATE AT_RISK ARCHIVED"
        bool active_maintainer
        timestamptz last_synced_at
    }
    repository_category {
        uuid repository_id PK, FK
        uuid category_id PK, FK
    }
    integration_idea {
        uuid id PK
        uuid repository_id FK
        enum integration_type "REST_API DOCKER SDK WEBHOOK CLI"
        enum difficulty "LOW MEDIUM HIGH"
        enum status "DRAFT APPROVED REJECTED"
        enum source "LLM HUMAN"
        jsonb triggers
        jsonb snippet
    }
    embedding {
        uuid id PK
        enum entity_type "REPOSITORY INTEGRATION_IDEA"
        uuid entity_id
        vector vector "1024 dim, HNSW coseno"
        text content_hash "sha256 modelo + texto"
    }
    sync_run {
        uuid id PK
        enum status "RUNNING COMPLETED FAILED"
        int repos_total
        int repos_ok
        int repos_failed
        int rate_limit_remaining
    }
```

- **Muchos a muchos** entre repositorio y categoría: Supabase, por ejemplo, es Base de Datos y Autenticación a la vez.
- `embedding.entity_id` es **polimórfico** (repositorio o idea), por eso no tiene FK.
- `sync_run` registra cada corrida diaria y permite **retomarla** si se corta.

El esquema completo está en [`backend/src/db/schema.ts`](backend/src/db/schema.ts) y las migraciones en [`backend/drizzle/`](backend/drizzle/).

---

## 🔌 API (`/api/v1`)

Producción: `https://openbridge-api-utri.onrender.com` · Local: `http://localhost:4000`

| Método | Ruta                             | Para qué                                                          |
| :----: | -------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/health`                        | Estado del servidor y la base (**fuera** del prefijo `/api/v1`)   |
| `GET`  | `/api/v1/openapi.json`           | Contrato OpenAPI completo                                         |
| `GET`  | `/api/v1/repositories`           | Listado con filtros, búsqueda por texto, orden y paginación       |
| `GET`  | `/api/v1/repositories/:id`       | Ficha técnica con sus ideas aprobadas                             |
| `GET`  | `/api/v1/filters`                | Opciones de filtros con su cantidad de repos y rango de estrellas |
| `GET`  | `/api/v1/categories`             | Categorías con cantidad de repos                                  |
| `POST` | `/api/v1/search`                 | Búsqueda por significado (vectorial)                              |
| `POST` | `/api/v1/assistant/capabilities` | Capacidades del negocio y candidatos (JSON)                       |
| `POST` | `/api/v1/assistant/proposals`    | Propuesta de arquitectura (stream SSE)                            |

<details>
<summary><b>Parámetros de <code>GET /repositories</code></b></summary>

<br>

| Parámetro      | Ejemplo             | Qué hace                                                                          |
| -------------- | ------------------- | --------------------------------------------------------------------------------- |
| `category`     | `auth`              | Slug: `auth`, `database`, `payments`, `ai`, `analytics` o `search`                |
| `language`     | `Python`            | Lenguaje principal (sin distinguir mayúsculas)                                    |
| `license`      | `MIT`               | Licencia SPDX (sin distinguir mayúsculas)                                         |
| `maintenance`  | `ACTIVE,MODERATE`   | Uno o más niveles de mantenimiento, separados por coma                            |
| `minStars`     | `50000`             | Estrellas mínimas                                                                 |
| `q`            | `motor de búsqueda` | Texto libre (mínimo 2 caracteres) sobre nombre, descripción, temas y categoría    |
| `sort`         | `stars`             | `health` (por defecto), `stars`, `updated` o `relevance` (por defecto si hay `q`) |
| `page`, `size` | `2`, `20`           | Paginación                                                                        |

</details>

<details>
<summary><b>Ejemplos con <code>curl</code></b></summary>

<br>

```bash
API=https://openbridge-api-utri.onrender.com

curl $API/health                                                   # {"status":"ok"}
curl "$API/api/v1/repositories?language=TypeScript&license=MIT&sort=health"

curl -X POST $API/api/v1/search -H "Content-Type: application/json" \
  -d '{"query":"login único para empresas","limit":5,"categories":["auth"],"minHealth":60}'

curl -X POST $API/api/v1/assistant/capabilities -H "Content-Type: application/json" \
  -d '{"description":"Estoy construyendo un e-commerce B2B de logística"}'
```

</details>

<details>
<summary><b>Errores</b></summary>

<br>

Todas las respuestas de error tienen la forma `{ "error": { "code", "message", "details" } }`.

| Código                   | HTTP | Cuándo                                                    |
| ------------------------ | :--: | --------------------------------------------------------- |
| `INVALID_QUERY`          | 400  | Parámetros o cuerpo inválidos (incluido JSON mal formado) |
| `ORIGIN_NOT_ALLOWED`     | 403  | El origen del navegador no está en `CORS_ORIGINS`         |
| `NOT_FOUND`              | 404  | Ruta o repositorio inexistente                            |
| `INSUFFICIENT_CONTEXT`   | 422  | La descripción del negocio es vaga: trae las preguntas    |
| `MODEL_INVALID_RESPONSE` | 502  | El modelo devolvió algo que no cumple el esquema          |
| `EMBEDDINGS_UNAVAILABLE` | 503  | `/search` no pudo vectorizar la consulta (Ollama caído)   |
| `UPSTREAM_UNAVAILABLE`   | 503  | El asistente no pudo llegar al modelo                     |
| `UPSTREAM_TIMEOUT`       | 504  | El modelo o las búsquedas no terminaron a tiempo (~27 s)  |

Cada petición genera un log JSON con `requestId`, `method`, `path`, `statusCode` y `durationMs`, y devuelve el encabezado `X-Request-Id`.

</details>

---

## ⚡ Inicio rápido

### Requisitos

- **Node.js 22.9 o superior** (`nvm use` toma la versión de [`.nvmrc`](.nvmrc)) y npm 10+
- **Docker** con Docker Compose, para la base local
- **[Ollama](https://ollama.com)** nativo (no en Docker: en Windows y macOS Docker no usa la GPU), para la búsqueda por significado, el asistente y las ideas
- Un **token de GitHub** con lectura de repositorios públicos, para cargar el catálogo

### 1. Instalar dependencias

```bash
git clone https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge.git
cd S10-26-equipo-8-OpenBridge
npm install            # instala frontend y backend (npm workspaces)
```

### 2. Levantar Postgres + pgvector

```bash
npm run db:up          # docker compose up -d --wait
```

Sin `.env` en la raíz, Compose usa `openbridge` como usuario, contraseña y base, en el puerto `5432`. Los datos persisten en el volumen `pgdata`; para empezar de cero: `docker compose down -v`.

### 3. Configurar el backend y aplicar migraciones

Creá `backend/.env` (podés partir de `backend/.env.example`):

```bash
DATABASE_URL=postgresql://openbridge:openbridge@localhost:5432/openbridge
GITHUB_TOKEN=ghp_...   # tu token personal: nunca lo subas al repo
```

```bash
npm run db:migrate -w backend   # crea las tablas y la extensión vector
npm run db:seed -w backend      # carga las 6 categorías (idempotente)
```

### 4. Preparar Ollama

```bash
ollama pull qwen2.5:7b          # ~4,7 GB: asistente e ideas
ollama pull bge-m3              # embeddings de 1024 dimensiones
```

¿Problemas con la GPU o el servicio? Seguí [`docs/ia/ollama-local.md`](docs/ia/ollama-local.md).

### 5. Cargar el catálogo

```bash
npm run db:load-initial -w backend      # los 136 repos de seed/repos.yaml, con salud
npm run db:generate-ideas -w backend -- --limit 5   # ideas en borrador (opcional)
npm run db:embed -w backend             # vectores de repos e ideas aprobadas
```

### 6. Correr la aplicación

```bash
npm run dev            # frontend y backend en paralelo
```

| Servicio | Dirección                                        |
| -------- | ------------------------------------------------ |
| Frontend | http://localhost:3000                            |
| Backend  | http://localhost:4000/health → `{"status":"ok"}` |
| OpenAPI  | http://localhost:4000/api/v1/openapi.json        |

Para que la interfaz use tu API local, definí `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` en el frontend. **Sin esa variable, la interfaz usa datos simulados.**

<details>
<summary><b>📜 Todos los scripts</b></summary>

<br>

**Desde la raíz**

| Script                 | Qué hace                                          |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Frontend y backend en paralelo (`web` / `api`)    |
| `npm run build`        | Compila frontend y backend                        |
| `npm run lint`         | ESLint + Prettier (`--check`) en ambos workspaces |
| `npm test`             | Tests de los workspaces                           |
| `npm run format`       | Formatea todo el repo con Prettier                |
| `npm run format:check` | Verifica el formato sin modificar archivos        |
| `npm run db:up`        | Levanta Postgres + pgvector en segundo plano      |
| `npm run db:down`      | Detiene la base (los datos se conservan)          |
| `npm run db:logs`      | Sigue los logs del contenedor `db`                |
| `npm run db:psql`      | Abre `psql` dentro del contenedor                 |

**Backend** (`npm run <script> -w backend`)

| Script              | Qué hace                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| `db:generate`       | Genera una migración SQL a partir de los cambios en `schema.ts`               |
| `db:migrate`        | Aplica las migraciones pendientes                                             |
| `db:seed`           | Carga las categorías base                                                     |
| `db:load-initial`   | Carga inicial desde `seed/repos.yaml` (exige cargar al menos el 98 %)         |
| `db:generate-ideas` | Genera ideas en borrador con el LLM (`--limit`, `--repo`, `--prompt`)         |
| `db:embed`          | Genera solo los vectores (incremental por hash)                               |
| `db:sync`           | Pipeline diario completo: GitHub → salud → vectores, registrado en `sync_run` |
| `db:search`         | Prueba la búsqueda por significado desde la terminal                          |

</details>

<details>
<summary><b>🧩 Cambiar el esquema de la base</b></summary>

<br>

1. Editá [`backend/src/db/schema.ts`](backend/src/db/schema.ts).
2. Corré `npm run db:generate -w backend`.
3. Subí el SQL generado en [`backend/drizzle/`](backend/drizzle/) en el mismo PR.

drizzle-kit no genera migraciones de reversa: un cambio se deshace con una migración nueva.

</details>

---

## 🔐 Variables de entorno

### Backend (`backend/.env` en local, panel de Render en producción)

| Variable                 | Obligatoria             | Por defecto              | Para qué                                                     |
| ------------------------ | ----------------------- | ------------------------ | ------------------------------------------------------------ |
| `DATABASE_URL`           | ✅                      | —                        | Conexión a Postgres con pgvector                             |
| `PORT`                   |                         | `4000`                   | Puerto de la API                                             |
| `CORS_ORIGINS`           | En producción           | `http://localhost:3000`  | Orígenes permitidos, separados por coma                      |
| `GITHUB_TOKEN`           | Para la ingesta e ideas | —                        | Token con lectura de repos públicos                          |
| `OLLAMA_BASE_URL`        |                         | `http://localhost:11434` | Dirección de Ollama (o del proxy del equipo)                 |
| `OLLAMA_API_KEY`         | Con el proxy            | —                        | Se envía como `Authorization: Bearer …`                      |
| `OLLAMA_MODEL`           |                         | `qwen2.5:7b`             | Modelo de generación                                         |
| `OLLAMA_EMBEDDING_MODEL` |                         | `bge-m3`                 | Modelo de embeddings (cambiarlo exige migración y regenerar) |

### Frontend (Vercel)

| Variable              | Ejemplo                                           | Para qué                                                          |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://openbridge-api-utri.onrender.com/api/v1` | Dirección de la API **con** el prefijo. Sin ella, datos simulados |

### Docker Compose (`.env` en la raíz, opcional)

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (todas `openbridge` por defecto) y `POSTGRES_PORT` (`5432`).

> 🔒 Ningún secreto va en el repositorio: los `.env` están en `.gitignore`.

---

## 🧪 Testing

```bash
npm run db:up            # los tests usan un Postgres real
npm test -w backend      # ~300 tests con Vitest + supertest
```

- Cada archivo de test crea **su propia base temporal** y le aplica las migraciones ([`backend/test/helpers/test-db.ts`](backend/test/helpers/test-db.ts)).
- Ollama se reemplaza por **dobles de prueba**: los tests no necesitan GPU ni red.
- La [integración continua](.github/workflows/ci.yml) corre en cada PR y push a `dev` y `main` con tres jobs obligatorios: **`format`**, **`backend`** (lint, build y tests contra `pgvector/pgvector:pg17`) y **`frontend`** (lint y build).

La estrategia de pruebas y la Definition of Done están en [`docs/testing/estrategia-de-pruebas.md`](docs/testing/estrategia-de-pruebas.md).

---

## ☁️ Deploy

```mermaid
flowchart LR
    main["Merge a main"] --> rb["Render<br/>build + migraciones + /health"]
    main --> vb["Vercel<br/>espera a la API y compila"]
    cron["GitHub Actions<br/>03:00 UTC"] --> sync["db:migrate + db:sync"]
    rb --> neon[("Neon")]
    sync --> neon
```

| Pieza                        | Dónde                                                | Qué hace                                                                                                    |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 🐘 **Neon**                  | US West (Oregon)                                     | Postgres con pgvector; la extensión la crea la migración `0001_add_embedding.sql`                           |
| ☁️ **Render**                | [`render.yaml`](render.yaml) (Blueprint)             | Compila solo el backend, aplica las migraciones al arrancar y abre el puerto si `/health` responde          |
| ▲ **Vercel**                 | Panel de Vercel                                      | Despierta la API antes de compilar ([`wait-for-api.mjs`](frontend/scripts/wait-for-api.mjs)) y prerenderiza |
| 🖥️ **Ollama del equipo**     | Máquina con GPU                                      | Render no tiene GPU: Ollama va detrás de **Caddy** con clave y un **túnel HTTPS** (Cloudflare Tunnel)       |
| ⚙️ **Sincronización diaria** | [`daily-sync.yml`](.github/workflows/daily-sync.yml) | Migra y sincroniza métricas, salud y vectores con un Ollama efímero en el runner                            |

<details>
<summary><b>⚠️ A tener en cuenta</b></summary>

<br>

- **Plan free de Render:** el servicio se duerme a los 15 minutos sin uso y tarda unos 50 s en despertar. Antes de una demo, abrí `/health`.
- **Ollama sin autenticación:** nunca lo expongas directo. El proxy solo deja pasar `/api/chat`, `/api/embed` y `/api/version` con `Bearer OLLAMA_API_KEY`.
- **Si la máquina con GPU está apagada**, el catálogo sigue andando: `/search` responde `503 EMBEDDINGS_UNAVAILABLE` y el asistente `503 UPSTREAM_UNAVAILABLE`.
- **CORS:** no uses comodines con `vercel.app`, que es un dominio compartido.
- **Datos iniciales:** el deploy crea las tablas pero no carga datos; la carga inicial se corre una vez desde una máquina con Ollama.

</details>

La guía paso a paso, con el `Caddyfile`, el túnel y la verificación, está en [`docs/deploy.md`](docs/deploy.md).

---

## 🤝 Cómo contribuir

- **Ramas:** `main` es producción y solo recibe merges desde `dev` o `hotfix/`. `dev` es integración: las ramas de trabajo salen de ahí y vuelven por PR.
- **Formato de rama:** `tipo/OB-XX-descripcion-corta` (`feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`, `test/`).
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/es/), en inglés y en imperativo: `tipo(alcance): descripción`.
  - Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`
  - Alcances: `web`, `api`, `db`, `ingest`, `rag`, `ci`

```text
feat(api): add tool search endpoint
fix(web): fix category filter in catalog
```

---

## 👥 Equipo

Equipo 8 de la Simulación Laboral **NoCountry S10-26**. Contribuidores del repositorio:

<table>
  <tr>
    <td align="center"><a href="https://github.com/agtelo"><img src="https://github.com/agtelo.png?size=100" width="80" alt="agtelo"/><br/><sub><b>agtelo</b></sub></a></td>
    <td align="center"><a href="https://github.com/aconrado562-blip"><img src="https://github.com/aconrado562-blip.png?size=100" width="80" alt="aconrado562-blip"/><br/><sub><b>aconrado562-blip</b></sub></a></td>
    <td align="center"><a href="https://github.com/MarcosAVZ"><img src="https://github.com/MarcosAVZ.png?size=100" width="80" alt="MarcosAVZ"/><br/><sub><b>MarcosAVZ</b></sub></a></td>
    <td align="center"><a href="https://github.com/DarkEngelBlood"><img src="https://github.com/DarkEngelBlood.png?size=100" width="80" alt="DarkEngelBlood"/><br/><sub><b>DarkEngelBlood</b></sub></a></td>
    <td align="center"><a href="https://github.com/Maxwellqa"><img src="https://github.com/Maxwellqa.png?size=100" width="80" alt="Maxwellqa"/><br/><sub><b>Maxwellqa</b></sub></a></td>
    <td align="center"><a href="https://github.com/pablomorales12345"><img src="https://github.com/pablomorales12345.png?size=100" width="80" alt="pablomorales12345"/><br/><sub><b>pablomorales12345</b></sub></a></td>
  </tr>
</table>

<div align="center">
<br>

Hecho con ☕ y modelos abiertos por el **Equipo 8** · [NoCountry](https://www.nocountry.tech)

</div>
