// Cliente HTTP de la API (contrato v1). Es el único lugar que conoce la URL del servidor.
//
// NEXT_PUBLIC_API_URL apunta a la API con el prefijo, por ejemplo
// https://openbridge-api.onrender.com/api/v1 (ver docs/deploy.md). Sin esa variable la interfaz
// sigue con datos simulados y nunca llama al servidor.

const API_PREFIX = '/api/v1';

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || undefined;

export const isApiEnabled = API_URL !== undefined;

// El plan gratuito de Render duerme el servidor y la primera respuesta puede tardar.
const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | (string & {});

// Error del contrato v1: `{ error: { code, message } }`. `status` es 0 si no hubo respuesta.
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | readonly string[] | null | undefined>;

type ApiFetchOptions = {
  method?: 'GET' | 'POST';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  // Opciones de caché de Next para los pedidos que se hacen desde el servidor.
  next?: NextFetchRequestConfig;
};

// Arma `?a=1&b=x,y` sin parámetros vacíos; los arreglos viajan separados por coma.
export function buildQuery(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    const text = typeof value === 'object' ? value.join(',') : String(value);
    if (text !== '') params.set(key, text);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function request(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    // Un corte pedido por quien llama (por ejemplo, al salir de la pantalla) no es un fallo.
    if (signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new ApiError(0, 'TIMEOUT', 'El servidor tardó demasiado en responder');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor');
  }
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: { code?: string; message?: string } };
    if (data.error?.code) {
      return new ApiError(
        response.status,
        data.error.code,
        data.error.message ?? response.statusText,
      );
    }
  } catch {
    // La respuesta de error no era JSON del contrato: se informa solo el estado HTTP.
  }
  return new ApiError(response.status, 'HTTP_ERROR', `El servidor respondió ${response.status}`);
}

// Pide `path` (relativo a /api/v1) y devuelve el JSON. Lanza ApiError si algo falla.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  if (API_URL === undefined) {
    throw new ApiError(0, 'NETWORK_ERROR', 'NEXT_PUBLIC_API_URL no está configurada');
  }

  const { method = 'GET', query, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, next } = options;
  const response = await request(
    `${API_URL}${path}${buildQuery(query)}`,
    {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      next,
    },
    timeoutMs,
    signal,
  );

  if (!response.ok) throw await readError(response);

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'La respuesta del servidor no es JSON');
  }
}

// `/health` vive en la raíz del servidor, fuera del prefijo /api/v1.
export async function checkHealth(options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
  if (API_URL === undefined) {
    throw new ApiError(0, 'NETWORK_ERROR', 'NEXT_PUBLIC_API_URL no está configurada');
  }

  const origin = API_URL.endsWith(API_PREFIX) ? API_URL.slice(0, -API_PREFIX.length) : API_URL;
  const response = await request(
    `${origin}/health`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
  );
  if (!response.ok) throw await readError(response);
  return (await response.json()) as { status: 'ok' };
}
