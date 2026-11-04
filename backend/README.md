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
