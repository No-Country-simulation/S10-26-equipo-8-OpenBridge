// Despierta la API antes de compilar. El build prerenderiza páginas que llaman a la API
// (categorías, catálogo, pie de página); con el plan gratuito de Render el servidor se duerme y
// tarda en responder, y esa primera llamada agotaba el tiempo y rompía el despliegue.
//
// Nunca falla: si la API no responde a tiempo, sigue y deja que el build decida.

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const maxWaitMs = Number(process.env.WAIT_API_MS ?? 120_000);
const everyMs = 5_000;

if (!apiUrl) {
  console.log('[wait-for-api] NEXT_PUBLIC_API_URL no está definida: se usan datos de prueba.');
  process.exit(0);
}

// /health vive en la raíz del servidor, sin el prefijo /api/v1.
const origin = apiUrl.replace(/\/api\/v1$/, '');
const started = Date.now();

for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(everyMs * 2) });
    if (res.ok) {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`[wait-for-api] ${origin} responde (${seconds} s, intento ${attempt}).`);
      break;
    }
    console.log(`[wait-for-api] intento ${attempt}: HTTP ${res.status}`);
  } catch (error) {
    console.log(`[wait-for-api] intento ${attempt}: ${error.name}`);
  }

  if (Date.now() - started >= maxWaitMs) {
    console.log('[wait-for-api] la API no respondió a tiempo; se compila de todos modos.');
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, everyMs));
}
