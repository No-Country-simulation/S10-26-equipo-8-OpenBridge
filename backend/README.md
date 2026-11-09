# OB-42 · Registros Estructurados y Verificación de Estado

Este componente implementa el registro de logs estructurados en formato JSON y un endpoint de verificación de salud (`/health`) para el diagnóstico rápido de problemas y la medición de tiempos de respuesta en el PMV.

## 📋 Descripción de la Historia de Usuario

> **Como** integrante del equipo,  
> **quiero** registros en formato JSON con identificador de consulta y tiempo de respuesta, más un servicio `/health`,  
> **para** diagnosticar problemas rápido y medir los tiempos del PMV.

### Detalles de la Tarea

- **Prioridad:** Importante
- **Estimación:** 2 Puntos
- **Responsable:** Servidor (Backend)
- **Dependencias:** OB-41

---

## 🚀 Criterios de Aceptación

### Escenario 1: Logs Estructurados de Consultas

- **Dado que:** Se recibe cualquier consulta HTTP en el servidor.
- **Cuando:** La consulta es procesada por el sistema.
- **Entonces:** Se genera un registro en la consola en formato **JSON** que incluye obligatoriamente:
  - Identificador único de la consulta (`requestId`).
  - Método HTTP (`method`).
  - Ruta o URI de la petición (`path`).
  - Código de estado de la respuesta (`statusCode`).
  - Duración o tiempo de respuesta en milisegundos (`durationMs`).

### Escenario 2: Verificación de Estado (/health) - Éxito

- **Dado que:** Se realiza una consulta `GET /health`.
- **Cuando:** La base de datos está accesible y conectada correctamente.
- **Entonces:** El servidor responde con un código de estado **200 OK**.

### Escenario 3: Verificación de Estado (/health) - Fallo

- **Dado que:** Se realiza una consulta `GET /health`.
- **Cuando:** La base de datos **no** está accesible o se encuentra caída.
- **Entonces:** El servidor responde con un código de estado **503 Service Unavailable**.

---

## 🛠️ Guía de Implementación de Referencia

### 1. Formato de Log JSON Esperado

Cada petición debe generar una línea de log estructurada similar a la siguiente:

```json
{
  "requestId": "c4b3a210-9f8d-4e7c-b6a5-123456789abc",
  "method": "GET",
  "path": "/health",
  "statusCode": 200,
  "durationMs": 2.4
}
```

El identificador también se devuelve en la cabecera `X-Request-Id`. La duración se mide en milisegundos con decimales.

### 2. Endpoint `/health`

`GET /health` ejecuta `SELECT 1` contra PostgreSQL. Responde `200` con `{"status":"ok"}` si la consulta tiene éxito y `503` con `{"status":"error"}` si falla o falta `DATABASE_URL`. Los fallos se registran como logs JSON de error.

---

## 🧪 Pruebas y Verificación

### Verificar logs en consola

Realiza cualquier petición a la API y confirma que la terminal imprima el objeto JSON con las propiedades requeridas.

### Verificar estado saludable (Base de datos UP)

```bash
curl -i http://localhost:4000/health
# Debe retornar HTTP/1.1 200 OK
```

### Verificar estado crítico (Base de datos DOWN)

1. Detén temporalmente el contenedor o servicio de tu base de datos.
2. Ejecuta la consulta:

```bash
curl -i http://localhost:4000/health
# Debe retornar HTTP/1.1 503 Service Unavailable
```
