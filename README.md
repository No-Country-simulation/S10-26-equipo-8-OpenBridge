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

## Scripts (desde la raíz)

| Script                 | Qué hace                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Frontend y backend en paralelo (`web` / `api`)                      |
| `npm run build`        | Compila frontend y backend                                          |
| `npm run lint`         | ESLint + Prettier (`--check`) en ambos; ESLint indica archivo:línea |
| `npm test`             | Tests de los workspaces (backend: Vitest + supertest)               |
| `npm run format`       | Formatea todo el repo con Prettier                                  |
| `npm run format:check` | Verifica el formato sin modificar archivos                          |

Cada workspace también se puede ejecutar solo: `npm run dev -w backend`.

## Estructura

```
.
├── frontend/          # Next.js (App Router) + Tailwind
│   └── src/app/
├── backend/           # Express + TypeScript
│   ├── src/           # app.ts (app), server.ts (listen)
│   └── test/          # Vitest + supertest
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
