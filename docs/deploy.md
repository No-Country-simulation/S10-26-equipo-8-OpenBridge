# Despliegue del servidor

El servidor Express corre en **Render** con la base en **Neon** (Postgres con pgvector). La IA corre en un **Ollama del equipo**, porque Render no tiene GPU. La ingesta diaria corre en **GitHub Actions**.

```text
Interfaz (Vercel) ──► Render: openbridge-api ──► Neon (Postgres + pgvector)
                              │
                              └──► Proxy con clave ──► Ollama del equipo (GPU)

GitHub Actions (daily-sync, 03:00 UTC) ──► Neon
```

| Pieza                  | Dónde se configura                        | Qué cubre                                                                       |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `render.yaml`          | Repositorio                               | Build, migraciones al arrancar, health check y deploy con cada commit en `main` |
| Secretos del servidor  | Panel de Render                           | `DATABASE_URL`, `CORS_ORIGINS`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`             |
| Secretos de la ingesta | GitHub → Settings → Secrets → Actions     | `DATABASE_URL`, `CATALOG_GITHUB_TOKEN`                                          |
| Dirección de la API    | Vercel → Settings → Environment Variables | `NEXT_PUBLIC_API_URL`                                                           |

> Ningún secreto va en el repositorio. Los `.env` locales están en `.gitignore`.

## 1. Base de datos en Neon

1. Creá un proyecto en [Neon](https://neon.tech). Elegí **US West (Oregon)**, la misma región que fija `render.yaml`.
2. Copiá la **connection string directa** (sin `-pooler` en el host). Ya trae `sslmode=require`.
3. No hace falta habilitar pgvector a mano: lo crea la migración `0001_add_embedding.sql`.

## 2. Servidor en Render

1. En Render: **New → Blueprint**, elegí este repositorio. Render lee `render.yaml` y crea `openbridge-api`.
2. Completá los secretos que pide (solo se piden al crear el Blueprint, después se editan en **Environment**):

| Variable          | Ejemplo                                                                       | Para qué                                                   |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`    | `postgresql://…@ep-xxx.us-west-2.aws.neon.tech/neondb?sslmode=require`        | La base de Neon                                            |
| `CORS_ORIGINS`    | `https://openbridge.vercel.app,https://openbridge-git-dev-equipo8.vercel.app` | Orígenes exactos que pueden usar la API desde un navegador |
| `OLLAMA_BASE_URL` | `https://ollama-equipo8.example.com`                                          | El proxy del Ollama del equipo (paso 4)                    |
| `OLLAMA_API_KEY`  | (clave larga al azar)                                                         | La clave que exige el proxy                                |

3. En cada fusión a `main`, Render compila, aplica las migraciones pendientes (`npm run start:prod`) y recién después abre el puerto. Si una migración falla, el deploy falla y queda la versión anterior.

**Comodines en `CORS_ORIGINS`:** `*` reemplaza un tramo del dominio (`https://*.openbridge.dev`). No lo uses con `vercel.app`: es un dominio compartido y cualquiera puede crear un proyecto que coincida con el patrón. Para las direcciones de prueba de Vercel, listá las que use Calidad o usá un dominio propio.

**Integración continua:** hoy Render despliega con cada commit en `main` (`autoDeployTrigger: commit`). Cuando exista la integración continua (OB-02), cambiá a `checksPass` para que despliegue solo si pasan los checks.

**Una sola instancia:** las migraciones corren al arrancar porque el plan free no tiene `preDeployCommand`. Antes de escalar a más instancias, pasalas a `preDeployCommand`: Drizzle no bloquea dos migraciones simultáneas.

**Plan free:** el servicio se duerme a los 15 minutos sin uso, y la primera consulta después tarda unos 50 s en despertarlo. Para la demo, abrí `/health` un rato antes.

## 3. Datos iniciales

El deploy crea las tablas, pero no carga datos. Hay que cargarlos una vez, desde tu máquina, apuntando a Neon (necesita Ollama local con `qwen2.5:7b` y `bge-m3`):

```bash
cd backend
export DATABASE_URL="postgresql://…neon…?sslmode=require"
export GITHUB_TOKEN="ghp_…"   # tu token personal, no lo pegues en ningún archivo
npm run db:seed
npm run db:load-initial
npm run db:generate-ideas
npm run db:embed
```

## 3b. Interfaz en Vercel

En Vercel, `NEXT_PUBLIC_API_URL` apunta a la API **con el prefijo** `/api/v1`: `https://openbridge-api-utri.onrender.com/api/v1`. Sin esa variable, la interfaz usa datos simulados y nunca llama a Render. El origen de la interfaz tiene que estar en `CORS_ORIGINS`.

Después, la ingesta diaria (`.github/workflows/daily-sync.yml`) mantiene el catálogo al día con los secretos de GitHub Actions.

## 4. Ollama del equipo, expuesto con clave

Ollama **no tiene autenticación**: expuesto tal cual, cualquiera con la dirección usa la GPU y puede bajar o borrar modelos. Va detrás de un proxy que exige `Authorization: Bearer <OLLAMA_API_KEY>`, el encabezado que manda el servidor, y que solo deja pasar las rutas que usa la API.

En la máquina con GPU:

1. Ollama con los modelos cargados y en memoria (evita el 504 por carga en frío):
   ```bash
   OLLAMA_KEEP_ALIVE=-1 ollama serve
   ollama pull qwen2.5:7b && ollama pull bge-m3
   ```
2. [Caddy](https://caddyserver.com) como proxy, con este `Caddyfile`:
   ```caddyfile
   :8080 {
       @api {
           header Authorization "Bearer {env.OLLAMA_API_KEY}"
           path /api/chat /api/embed /api/version
       }
       handle @api {
           # Ollama rechaza los Host que no son locales.
           reverse_proxy 127.0.0.1:11434 {
               header_up Host 127.0.0.1:11434
           }
       }
       respond 401
   }
   ```
   ```bash
   OLLAMA_API_KEY="la-misma-clave-que-en-render" caddy run
   ```
   Arrancalo siempre con la variable definida: sin ella, la clave que exige el proxy queda en `Bearer ` y no protege nada.
3. Un túnel HTTPS hasta el puerto 8080, por ejemplo con [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   El túnel rápido cambia de dirección cada vez que se reinicia y no tiene garantía de servicio. Para una dirección fija, usá un túnel con nombre. La dirección va en `OLLAMA_BASE_URL`.
4. Probá el proxy antes de cargar la dirección en Render:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<tunel>/api/version   # 401
   curl -s -H "Authorization: Bearer $OLLAMA_API_KEY" https://<tunel>/api/version   # {"version":…}
   curl -s -H "Authorization: Bearer $OLLAMA_API_KEY" https://<tunel>/api/embed -d '{"model":"bge-m3","input":"hola"}' | head -c 80
   ```

Si la máquina está apagada, el catálogo sigue andando. `/search` responde `503 EMBEDDINGS_UNAVAILABLE` y el asistente `503 UPSTREAM_UNAVAILABLE`.

## 5. Verificar

```bash
API=https://openbridge-api-utri.onrender.com
curl $API/health                                                  # {"status":"ok"}
curl "$API/api/v1/repositories?category=auth&size=1"              # datos de Neon
curl -i -H "Origin: https://evil.example" $API/api/v1/filters     # 403 ORIGIN_NOT_ALLOWED
```
