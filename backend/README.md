# Cliente de ingesta GraphQL de GitHub

Este módulo consulta repositorios mediante la API GraphQL de GitHub y sincroniza
sus datos con la tabla `repository` del esquema Drizzle de OpenBridge. La
implementación está en [`src/ingest/github.ts`](./src/ingest/github.ts).

## Qué hace

- Envía los repositorios de un lote en una sola consulta GraphQL a
  `https://api.github.com/graphql`, usando un alias por repositorio.
- Si un repositorio fue renombrado o transferido, compara el nombre solicitado
  con `nameWithOwner` y guarda el nombre actual que devuelve GitHub.
- Obtiene el `databaseId`, estrellas, forks, issues abiertos, lenguaje, temas,
  estado de archivo, licencia SPDX, fecha del último commit y fecha del último
  release, commits y autores activos en los últimos 90 días, e incidencias
  cerradas.
- Calcula y persiste el puntaje de salud (0–100), el nivel de mantenimiento y
  `active_maintainer`.
- Persiste cada resultado exitoso mediante `upsertRepository()`, que actualiza
  por `github_id` en lugar de insertar duplicados.
- Devuelve el resultado de cada repositorio individualmente para que un error
  asociado a un alias no interrumpa el procesamiento de los demás.

El cliente no expone una ruta HTTP ni un comando CLI por sí solo. Se invoca desde
otro módulo del backend o desde un proceso de ingesta.

## Requisitos

- Node.js y las dependencias del monorepo instaladas (`npm install` desde la raíz).
- PostgreSQL local disponible si se va a persistir o ejecutar los tests de
  integración.
- Un token de GitHub para consultar los repositorios. Puedes pasarlo mediante
  `GithubClientOptions.token` o definir `GITHUB_TOKEN` en el entorno.
- PostgreSQL y un `DATABASE_URL` válido si vas a sincronizar con `syncRepos()`.

Para levantar PostgreSQL con Docker desde la raíz del proyecto:

```powershell
npm run db:up
npm run db:migrate -w backend
npm run db:seed -w backend
```

## Uso desde el backend

Ejemplo de integración con una categoría ya existente:

```ts
import { createDb } from './db/client.js';
import { syncRepos } from './ingest/github.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL');

const { db, pool } = createDb(databaseUrl);

try {
  const results = await syncRepos(
    db,
    [
      { owner: 'vercel', name: 'next.js' },
      { owner: 'facebook', name: 'react' },
    ],
    {
      categoryIds: [categoryId],
      batchSize: 50,
    },
  );

  console.log(results);
} finally {
  await pool.end();
}
```

`syncRepos()` recibe la conexión Drizzle, una lista de `{ owner, name }` y
opciones `GithubClientOptions`. `categoryIds` reemplaza las categorías M:N
asociadas a los repositorios; si se omite, conserva las existentes. La consulta
serializa `owner` y `name` para evitar romper el documento GraphQL si contienen
caracteres especiales.

### Resultados

Cada entrada conserva la referencia solicitada y tiene uno de estos estados:

- `ok`: incluye `renamed`, los datos del repositorio y `savedId` (el ID interno
  de la fila) si se llamó a `syncRepos()`.
- `not_found`: GitHub no encontró el repositorio.
- `error`: GitHub devolvió un error GraphQL para ese alias, los datos recibidos
  eran incompletos o falló el upsert de ese repositorio.

Los errores HTTP, de red, JSON inválido o errores GraphQL sin alias asociado
rechazan la llamada completa. Los errores asociados a un alias y los errores de
upsert se devuelven en el resultado de ese repositorio; el resto del lote sigue.

## Puntaje de salud

El puntaje se calcula como suma ponderada de seis señales (pesos iniciales
ajustables en `DEFAULT_HEALTH_SCORE_CONFIG` de
[`src/ingest/health.ts`](./src/ingest/health.ts)):

| Señal                                       | Peso | Escala inicial                                      |
| ------------------------------------------- | ---: | --------------------------------------------------- |
| Antigüedad del último commit                |   30 | Desciende linealmente a 0 en 365 días               |
| Commits en los últimos 90 días              |   20 | Puntaje completo con 10 commits                     |
| Incidencias cerradas / total de incidencias |   15 | Proporción cerradas; completa si no hay incidencias |
| Estrellas                                   |   15 | Logarítmica; puntaje completo en 100 000 estrellas  |
| Release en los últimos 12 meses             |   10 | Puntaje completo si está dentro del período         |
| Colaboradores activos en 90 días            |   10 | Puntaje completo con 5 autores distintos            |

```text
puntaje = round(100 × Σ(peso × señal_normalizada) / Σ(pesos))
```

El resultado se redondea al entero más cercano. Si el último commit tiene más
de 365 días, el puntaje se limita a 39. Los niveles son `ACTIVE` (70–100),
`MODERATE` (40–69) y `AT_RISK` (0–39); un repositorio archivado siempre tiene
nivel `ARCHIVED`, sin cambiar su puntaje.

Los colaboradores activos son los autores distintos de los commits devueltos
por GitHub en los últimos 90 días. La consulta limita esa historia a los 100
commits más recientes, por lo que en repositorios muy activos puede subestimar
el número de colaboradores. Para `active_maintainer`, se considera activa una
persona que haya contribuido en ese período y sea mencionable en el repositorio
(o cuyo login coincida con el owner). En repositorios de organizaciones,
`mentionableUsers` es una aproximación y no garantiza que la persona tenga
permiso de escritura.

## Tests

Los tests simulan `fetch` y no realizan peticiones reales a GitHub. Necesitan
PostgreSQL local porque verifican la persistencia aplicando las migraciones a
una base temporal.

Desde la raíz del monorepo:

```powershell
npm run db:up
npm run test -w backend -- test/ingest/github.test.ts test/ingest/health.test.ts
```

Los casos cubren el uso del endpoint GraphQL, errores parciales por alias,
escape de nombres, persistencia de fechas y SPDX, y actualización del nombre
renombrado mediante upsert, además de los límites del cálculo del puntaje y del
nivel de mantenimiento.
