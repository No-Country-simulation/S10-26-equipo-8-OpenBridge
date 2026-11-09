# Ollama + `qwen2.5:7b` en local

Guía para preparar el modelo que usa el generador de ideas (`npm run db:generate-ideas`, OB-18).

**Requisitos:** 16 GB de RAM (con 8 GB funciona, pero lento). Con una GPU de 8 GB o más, o una Mac con Apple Silicon, va mucho más rápido: unos 10 s por repo, contra varios minutos en CPU.

## 1. Instalar Ollama

| Sistema | Comando |
|---|---|
| **Windows** | `winget install --id Ollama.Ollama` (o el instalador de [ollama.com/download](https://ollama.com/download)) |
| **macOS** | `brew install --cask ollama` (o la app de [ollama.com/download](https://ollama.com/download)) |
| **Linux** | `curl -fsSL https://ollama.com/install.sh \| sh` |

Al terminar, **cerrá y volvé a abrir la terminal**. Ollama queda corriendo como servicio en `http://localhost:11434`.

> Instalalo **nativo, no en Docker**. En Windows y macOS, Docker no usa la GPU por defecto.

## 2. Bajar el modelo (unos 4,7 GB, una sola vez)

```bash
ollama pull qwen2.5:7b
```

## 3. Verificar que funcione y use la GPU

```bash
ollama run qwen2.5:7b "Decí hola en una palabra"
```

La primera vez puede tardar 1 o 2 minutos, porque carga el modelo en memoria. Después:

```bash
ollama ps
```

En la columna `PROCESSOR` tiene que aparecer **`100% GPU`**. Si dice `CPU`, mirá [Si algo falla](#si-algo-falla).

## 4. Correr el generador del proyecto

Con Postgres levantado (`npm run db:up`) y tu `GITHUB_TOKEN` en `backend/.env`:

```bash
npm run db:generate-ideas -w backend -- --limit 3
```

No hace falta configurar nada más: por defecto usa `http://localhost:11434` y `qwen2.5:7b`. Si tenés Ollama en otra máquina o querés probar otro modelo, agregá en `backend/.env`:

```bash
OLLAMA_BASE_URL=http://otra-maquina:11434
OLLAMA_MODEL=qwen2.5:7b
```

El resultado de cada corrida queda en `backend/reports/ideas-report.json`.

## Si algo falla

| Síntoma | Solución |
|---|---|
| `llama-server binary not found` | La instalación quedó incompleta. Cerrá Ollama desde la bandeja y reinstalá: `winget install --id Ollama.Ollama --force`. Los modelos ya bajados se conservan. |
| `ollama ps` dice `CPU` | Actualizá el driver de la GPU: NVIDIA (531 o más nuevo) o AMD (última versión de Adrenalin). Reiniciá Ollama. |
| `fetch failed` o el generador queda colgado | Una generación anterior quedó trabada dentro de Ollama, que atiende de a una solicitud. Cerrá Ollama desde la bandeja (*Quit*) y volvé a abrirlo. |
| `ECONNREFUSED 11434` | Ollama no está corriendo: abrí la app o corré `ollama serve`. |
| `ollama` no se reconoce como comando | Cerrá y volvé a abrir la terminal (el `PATH` se actualiza al instalar). |
