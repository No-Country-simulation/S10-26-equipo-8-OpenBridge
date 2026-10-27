# OpenBridge — Estrategia de Pruebas y Definition of Done (DoD)

- **Versión:** 1.0
- **Proyecto:** OpenBridge — Acelerador de Integraciones Open Source
- **Etapa:** Desarrollo en curso — Iteración 1
- **Responsable de elaboración:** Calidad (QA)
- **Estado:** Propuesta para revisión y aprobación del equipo

## 1. Objetivo

Establecer una estrategia de pruebas común para OpenBridge, definiendo los niveles de testing, las herramientas, los datos de prueba, los responsables y los criterios que deben cumplirse para considerar una tarea terminada.

El objetivo es detectar defectos tempranamente, reducir regresiones y asegurar que cada funcionalidad cumpla sus criterios de aceptación antes de integrarse a la versión entregable.

## 2. Pirámide de pruebas

Se propone priorizar las pruebas unitarias, complementarlas con pruebas de integración y reservar las pruebas end-to-end para los flujos críticos del negocio.

### Nivel 1 — Pruebas unitarias

**Objetivo:** validar componentes y funciones de manera aislada

- Frontend: Next.js + React + Tailwind CSS
- Backend: Node.js + Express (TypeScript), Zod
- Datos: PostgreSQL + pgvector, Drizzle ORM (Docker en local, Neon en producción)
- IA: LangChain.js + OpenAI
- Ingesta: GitHub GraphQL API + GitHub Actions (cron diario)

**Ejemplos en OpenBridge:**

- Cálculo del health score de un repositorio.
- Validación de filtros por categoría y licencia.
- Validación de campos obligatorios de una idea de integración.

**Responsable:** Desarrollo, con criterios y seguimiento de QA.

### Nivel 2 — Pruebas de integración y API

**Objetivo:** comprobar que los componentes y servicios se comuniquen correctamente.

- Pytest para endpoints y servicios del backend.
- HTTPX o el cliente de pruebas correspondiente para FastAPI.
- Postman para exploración manual y validación de contratos HTTP.
- Pruebas de persistencia y consultas contra una base de datos de prueba.

**Ejemplos en OpenBridge:**

- Consultar y filtrar repositorios mediante la API.
- Verificar la persistencia de metadatos obtenidos desde GitHub.
- Validar la estructura de las ideas de integración.
- Comprobar el tratamiento de errores de API, límites de tasa y respuestas incompletas.

**Responsable:** Desarrollo implementa las pruebas técnicas; QA verifica los escenarios funcionales, resultados y evidencias.

### Nivel 3 — Pruebas end-to-end (E2E)

**Objetivo:** validar los flujos principales desde la perspectiva del usuario.

- Playwright para automatizar recorridos completos por la interfaz web.
- Ejecución en un entorno de pruebas controlado.

**Flujos prioritarios:**

1. Navegar por el catálogo y acceder a una ficha técnica.
2. Buscar repositorios aplicando filtros.
3. Consultar una recomendación mediante el asistente RAG.
4. Verificar la presentación de resultados y los estados de error.

**Responsable:** QA define los escenarios y valida los resultados; Desarrollo colabora en la automatización y resolución de defectos.

**Criterio general:** priorizar pruebas rápidas y estables en los niveles inferiores y mantener un conjunto reducido de E2E para los recorridos críticos.

## 3. Alcance de las pruebas

| Módulo               | Validaciones prioritarias                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Catálogo             | Navegación, categorías, listado y acceso a fichas.                                                |
| Ficha técnica        | Nombre, descripción, licencia, lenguaje, métricas y consistencia de datos.                        |
| Buscador avanzado    | Filtros combinados, resultados, ausencia de resultados y valores inválidos.                       |
| Ideas de integración | Tipo de integración, compatibilidad, dificultad, snippets y webhooks.                             |
| Asistente RAG        | Entrada del usuario, pertinencia de recomendaciones, estructura de respuesta y manejo de errores. |
| Pipeline GitHub      | Actualización de metadatos, tratamiento de errores, rate limits y persistencia.                   |
| Base de datos        | Integridad, duplicados, campos obligatorios y consistencia de registros.                          |
| Interfaz responsiva  | Visualización y navegación en diferentes tamaños de pantalla.                                     |

El alcance inicial se concentrará en las funcionalidades que entren efectivamente en la Iteración 1. No se considerará que todos estos módulos deben probarse de manera exhaustiva en los primeros dos días.

## 4. Datos de prueba

Se utilizarán datos controlados y reproducibles para evitar que las pruebas dependan de cambios externos.

- **Datos válidos:** repositorios con diferentes lenguajes, licencias, categorías y niveles de actividad.
- **Datos inválidos:** campos obligatorios ausentes, licencias desconocidas y formatos incorrectos.
- **Casos límite:** cero resultados, repositorios sin actividad reciente, valores nulos y listas vacías.
- **Integración con GitHub:** utilizar mocks o respuestas simuladas para reproducir errores HTTP, respuestas 429 y fallos temporales.
- **Asistente RAG:** conjunto inicial de consultas representativas de distintos negocios y respuestas esperadas a nivel de relevancia.
- **Datos sensibles:** no incluir credenciales, tokens ni información real confidencial en los repositorios de pruebas.

Los datos y resultados esperados deberán documentarse y mantenerse separados de los datos productivos.

## 5. Responsabilidades

- **QA / Calidad:** definir la estrategia, priorizar escenarios, revisar criterios de aceptación, ejecutar pruebas funcionales, registrar defectos y verificar correcciones.
- **Desarrollo Backend:** implementar y mantener pruebas unitarias, de API, integración y persistencia.
- **Desarrollo Frontend:** implementar pruebas unitarias de interfaz y colaborar con las pruebas E2E.
- **Producto:** aclarar reglas de negocio, validar criterios de aceptación y participar en la aceptación funcional.
- **Equipo:** revisar y aprobar la Definition of Done y aplicarla durante la planificación y ejecución de las tareas.

Las responsabilidades definitivas deberán acordarse según la composición real del equipo.

## 6. Definition of Done (DoD)

Una tarea o funcionalidad se considera terminada cuando cumple los siguientes criterios aplicables:

- Los criterios de aceptación están definidos y se cumplen.
- El código fue revisado según el proceso acordado por el equipo.
- Las pruebas unitarias correspondientes fueron ejecutadas y pasan.
- Las pruebas de integración o API aplicables fueron ejecutadas y pasan.
- Se ejecutaron las pruebas funcionales previstas para la tarea.
- Los flujos E2E críticos afectados fueron verificados cuando corresponde.
- No existen defectos críticos o bloqueantes conocidos sin resolver.
- Los defectos detectados están documentados y priorizados.
- Se actualizaron la documentación y las evidencias necesarias.
- Los cambios están integrados en la rama acordada y los controles automáticos establecidos pasan.
- Producto o el responsable designado validó los criterios de aceptación cuando corresponde.

**Regla:** si un criterio aplicable no se cumple, la tarea no se considera terminada. Las excepciones deben ser explícitas, justificadas y aceptadas por los responsables correspondientes.

## 7. Implementación durante la Iteración 1

**Día 1**

- Confirmar con Desarrollo el stack y las herramientas efectivamente elegidas.
- Identificar las funcionalidades previstas para la iteración.
- Acordar los responsables y el flujo de reporte de defectos.

**Día 2**

- Publicar esta estrategia, ajustada a las decisiones reales del equipo.
- Presentar la Definition of Done para su revisión.
- Identificar los primeros escenarios y datos de prueba prioritarios.

**Día 3**

**Planificación del equipo**

- Revisar y validar la DoD.
- Registrar los acuerdos y responsables.
- Incorporar la versión aprobada en el README del repositorio.

**Nota:** este documento constituye una propuesta inicial. Los nombres de herramientas, responsables y criterios técnicos deben confirmarse con el equipo antes de presentarlos como decisiones definitivas.
