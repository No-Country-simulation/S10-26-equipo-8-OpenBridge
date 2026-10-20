# OpenBridge

Catálogo inteligente de herramientas open source con asistente RAG que recomienda stacks según el negocio.

Simulación Laboral NoCountry — S10-26, equipo 8.

## Stack

- **Frontend:** Next.js + React + Tailwind CSS
- **Backend:** Node.js + Express (TypeScript), Zod
- **Datos:** PostgreSQL + pgvector, Drizzle ORM (Docker en local, Neon en producción)
- **IA:** LangChain.js + OpenAI
- **Ingesta:** GitHub GraphQL API + GitHub Actions (cron diario)

## Ramas

- `main`: producción, solo recibe merges desde `dev`.
- `dev`: integración; las ramas de trabajo salen de acá y vuelven por PR.
