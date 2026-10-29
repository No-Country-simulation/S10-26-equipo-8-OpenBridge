## Puntaje de Salud (Health Score) y Nivel de Mantenimiento

El sistema evalúa el estado y la vitalidad de cada repositorio utilizando una fórmula ponderada basada en seis señales métricas. Los pesos iniciales son ajustables en la constante `DEFAULT_HEALTH_SCORE_CONFIG` dentro de [`src/ingest/health.ts`](./src/ingest/health.ts).

### 📊 Matriz de Criterios y Ponderación

| Señal                                  | Peso | Criterio de Escala e Inferencia                                                        |
| :------------------------------------- | :--: | :------------------------------------------------------------------------------------- |
| **Antigüedad del último commit**       |  30  | Desciende linealmente hasta 0 puntos a los 365 días.                                   |
| **Frecuencia de commits (90 días)**    |  20  | Otorga el puntaje completo al alcanzar 10 commits.                                     |
| **Resolución de incidencias (Issues)** |  15  | Proporción de cerradas vs. totales. Si no hay incidencias, otorga el puntaje completo. |
| **Popularidad (Estrellas)**            |  15  | Escala logarítmica; puntaje completo al alcanzar 100,000 estrellas.                    |
| **Recencia de Releases (12 meses)**    |  10  | Puntaje completo si existe al menos una publicación en el período.                     |
| **Colaboradores activos (90 días)**    |  10  | Puntaje completo al detectar 5 o más autores distintos.                                |

### 🏷️ Niveles de Mantenimiento

Basado en el puntaje obtenido, el repositorio se clasifica en uno de los siguientes niveles:

- 🟢 **`ACTIVE` (70 – 100):** Repositorio saludable, con actividad constante y comunidad activa.
- 🟡 **`MODERATE` (40 – 69):** Mantenimiento estable pero de baja frecuencia, o con respuestas lentas a incidencias.
- 🔴 **`AT_RISK` (0 – 39):** Repositorio desatendido o estancado.
- 📁 **`ARCHIVED` (Especial):** Si el repositorio está archivado en GitHub, se le asigna este nivel de forma fija **sin alterar su puntaje numérico recalculado**.

---

### 🔍 Consideraciones del MVP y Limitaciones Técnicas

- **Subestimación en Repositorios de Alta Actividad:** La consulta de colaboradores activos evalúa los autores distintos dentro de los **últimos 100 commits más recientes** (en una ventana de 90 días). En proyectos con un volumen extremo de contribuciones, esta métrica podría subestimar el número real de colaboradores.
- **Identificación de Mantenedores (`active_maintainer`):** Se marca como verdadero si una persona ha contribuido en los últimos 90 días y su cuenta coincide con el dueño (`owner`) o forma parte de la lista `mentionableUsers`. En organizaciones, `mentionableUsers` actúa como una aproximación cercana y no representa estrictamente una verificación de permisos de escritura directos.

---

### 🧪 Ejecución de Pruebas Unitarias y de Integración

Los tests utilizan mocks para simular las respuestas de la API de GitHub (`fetch`), evitando llamadas reales a la red. Sin embargo, **requieren una instancia local de PostgreSQL** ya que aplican las migraciones sobre una base de datos temporal para validar la persistencia real de los datos.
Para levantar el entorno y ejecutar los tests específicos de la ingesta desde la raíz del monorepo, corre:

```powershell
# Levantar el contenedor de la base de datos local
npm run db:up
# Ejecutar las suites de prueba de salud y GitHub en el workspace del backend
npm run test -w backend -- test/ingest/github.test.ts test/ingest/health.test.ts
```

### 📥 Carga inicial del catálogo

La carga inicial toma los 153 repositorios únicos de
`docs/testing/Repositorios.yaml` (algunos tienen más de una categoría),
consulta sus métricas actuales en GitHub, calcula el puntaje de salud y asigna
la categoría curada. Es idempotente: volver a ejecutarla actualiza los registros
por `github_id`.

Requiere Docker, `DATABASE_URL` y un `GITHUB_TOKEN` con acceso de lectura a
repositorios públicos:

```powershell
npm run db:up
npm run db:migrate -w backend
npm run db:load-initial -w backend
```

El comando realiza hasta 50 consultas por lote, continúa si un lote o un
repositorio falla y escribe el detalle de los fallos en
`backend/reports/initial-load-report.json`. Termina con error si no se carga al
menos el 98 % del inventario; un informe también se genera cuando no se alcanza
ese umbral.
