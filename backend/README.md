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
- Un token de GitHub con permiso para consultar los repositorios que se van a
  leer. El token se pasa al cliente; el módulo no lo carga automáticamente desde
  el entorno.
- El ID de una categoría existente en la tabla `category`, porque el modelo
  requiere `categoryId` para guardar cada repositorio.

Para levantar PostgreSQL con Docker desde la raíz del proyecto:

```powershell
npm run db:up
npm run db:migrate -w backend
npm run db:seed -w backend
```

## Uso desde el backend

Ejemplo de integración con una categoría ya existente:

```ts
import { eq } from 'drizzle-orm';
import { createDb } from './db/client.js';
import { category } from './db/schema.js';
import { syncRepoBatch } from './ingest/github.js';

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('Falta GITHUB_TOKEN');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL');

const { db, pool } = createDb(databaseUrl);

try {
  const [authCategory] = await db
    .select()
    .from(category)
    .where(eq(category.slug, 'auth'))
    .limit(1);

  if (!authCategory) throw new Error('No existe la categoría auth');

  const results = await syncRepoBatch(
    db,
    [
      { owner: 'vercel', name: 'next.js' },
      { owner: 'facebook', name: 'react' },
    ],
    token,
    authCategory.id,
  );

  console.log(results);
} finally {
  await pool.end();
}
```

`syncRepoBatch()` recibe la conexión Drizzle, una lista de `{ owner, name }`, el
token y el ID de categoría. La consulta serializa `owner` y `name` para evitar
romper el documento GraphQL si contienen caracteres especiales.

### Resultados

Cada entrada conserva la referencia solicitada y tiene uno de estos estados:

- `ok`: incluye `renamed`, los datos del repositorio y `savedId` (el ID interno
  de la fila) si se llamó a `syncRepoBatch()`.
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

| Señal | Peso | Escala inicial |
| --- | ---: | --- |
| Antigüedad del último commit | 30 | Desciende linealmente a 0 en 365 días |
| Commits en los últimos 90 días | 20 | Puntaje completo con 10 commits |
| Incidencias cerradas / total de incidencias | 15 | Proporción cerradas; 0 si no hay incidencias |
| Estrellas | 15 | Logarítmica; puntaje completo en 100 000 estrellas |
| Release en los últimos 12 meses | 10 | Puntaje completo si está dentro del período |
| Colaboradores activos en 90 días | 10 | Puntaje completo con 5 autores distintos |

El resultado se redondea al entero más cercano. Si el último commit tiene más
de 365 días, el puntaje se limita a 39 y el nivel es `AT_RISK`. En otro caso, el
nivel es `ACTIVE` (70–100), `MODERATE` (40–69) o `AT_RISK` (0–39). Un repositorio
archivado siempre tiene nivel `ARCHIVED`, sin cambiar su puntaje. Para
`active_maintainer`, esta primera versión considera activo al propietario del
repositorio si aparece como autor de un commit en los últimos 90 días.

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
