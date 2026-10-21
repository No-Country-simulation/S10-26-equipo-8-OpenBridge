# OpenBridge

Catálogo inteligente de herramientas open source con asistente RAG que recomienda stacks según el negocio.

Simulación Laboral NoCountry — S10-26, equipo 8.

## Stack

- **Frontend:** Next.js + React + Tailwind CSS
- **Backend:** Node.js + Express (TypeScript), Zod
- **Datos:** PostgreSQL + pgvector, Drizzle ORM (Docker en local, Neon en producción)
- **IA:** LangChain.js + OpenAI
- **Ingesta:** GitHub GraphQL API + GitHub Actions (cron diario)

## Requisitos

- Node.js 22 o superior (`nvm use` toma la versión de `.nvmrc`)
- npm 10 o superior
- Docker con Docker Compose (para la base de datos local)

## Puesta en marcha

```bash
git clone <url-del-repo>
cd S10-26-equipo-8-OpenBridge
npm install   # instala frontend y backend (npm workspaces)
npm run dev   # levanta ambos en paralelo
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000/health → `{"status":"ok"}`

Variables de entorno del backend: copiá `backend/.env.example` a `backend/.env` si necesitás cambiar el puerto.

## Base de datos local

PostgreSQL 17 con pgvector (imagen `pgvector/pgvector`), equivalente a Neon en producción.

```bash
cp .env.example .env   # opcional; en cmd: copy .env.example .env
npm run db:up          # espera a que Postgres esté listo
```

Sin `.env`, Compose usa los mismos valores por defecto (`openbridge`).

Verificar que la extensión `vector` está habilitada:

```bash
npm run db:psql
# dentro de psql:
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

- Los datos persisten en el volumen `pgdata`: `npm run db:down` los conserva.
- Los scripts de `docker/postgres/init/` solo corren con el volumen vacío. Para reiniciar la base desde cero: `docker compose down -v`.

## Scripts (desde la raíz)

| Script                 | Qué hace                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Frontend y backend en paralelo (`web` / `api`)                      |
| `npm run build`        | Compila frontend y backend                                          |
| `npm run lint`         | ESLint + Prettier (`--check`) en ambos; ESLint indica archivo:línea |
| `npm test`             | Tests de los workspaces (backend: Vitest + supertest)               |
| `npm run format`       | Formatea todo el repo con Prettier                                  |
| `npm run format:check` | Verifica el formato sin modificar archivos                          |
| `npm run db:up`        | Levanta Postgres + pgvector en segundo plano                        |
| `npm run db:down`      | Detiene la base (los datos se conservan)                            |
| `npm run db:logs`      | Sigue los logs del contenedor `db`                                  |
| `npm run db:psql`      | Abre `psql` dentro del contenedor                                   |

Cada workspace también se puede ejecutar solo: `npm run dev -w backend`.

## Estructura

```
.
├── frontend/          # Next.js (App Router) + Tailwind
│   └── src/app/
├── backend/           # Express + TypeScript
│   ├── src/           # app.ts (app), server.ts (listen)
│   └── test/          # Vitest + supertest
├── docker/postgres/init/  # scripts de inicialización (extensión vector)
├── docker-compose.yml # Postgres + pgvector local
├── .env.example       # variables de Docker Compose
├── .editorconfig
├── .prettierrc
├── .nvmrc
└── package.json       # workspaces + scripts comunes
```

## Ramas

- `main`: producción, solo recibe merges desde `dev` o desde `hotfix/`.
- `dev`: integración; las ramas de trabajo salen de acá y vuelven por PR.
- Formato de las ramas de trabajo: `tipo/OB-XX-descripcion-corta`
  - Prefijos: `feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`, `test/`
  - Ejemplo: `feature/OB-12-busqueda-herramientas`

## Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/): `tipo(alcance): descripción`, en inglés y en imperativo.

- **Tipos:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`
- **Alcances:** `web`, `api`, `db`, `ingest`, `rag`, `ci`

```
feat(api): add tool search endpoint
fix(web): fix category filter in catalog
```
