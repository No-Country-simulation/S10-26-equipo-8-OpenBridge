import type { RequestHandler } from 'express';
import { apiError } from './catalog/schema.js';

// Sin CORS_ORIGINS (desarrollo), solo la interfaz local.
const DEFAULT_ORIGINS = ['http://localhost:3000'];

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Accept';
// Sin esto, el navegador le oculta Retry-After a la interfaz (ver
// frontend/src/lib/assistant.ts).
const EXPOSED_HEADERS = 'Retry-After';
// Cuánto cachea el navegador la verificación previa.
const PREFLIGHT_MAX_AGE_S = '600';

// CORS_ORIGINS: orígenes separados por comas. Un `*` reemplaza un tramo de
// letras, números y guiones dentro del dominio; no cruza puntos, barras ni el
// protocolo. Usalo solo en dominios propios: en uno compartido como
// vercel.app, cualquiera puede crear un proyecto que coincida con el patrón.
export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_ORIGINS;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function originMatcher(allowedOrigins: string[]): (origin: string) => boolean {
  const exact = new Set(allowedOrigins.filter((origin) => !origin.includes('*')));
  const patterns = allowedOrigins
    .filter((origin) => origin.includes('*'))
    .map(
      (origin) => new RegExp(`^${origin.split('*').map(escapeRegExp).join('[a-z0-9-]+')}$`, 'i'),
    );
  return (origin) => exact.has(origin) || patterns.some((pattern) => pattern.test(origin));
}

// Solo la interfaz puede usar la API desde un navegador. Un origen que no está
// en la lista recibe 403: el navegador ya bloquearía la respuesta, pero así la
// consulta ni siquiera llega a la base ni al modelo. Las consultas sin Origin
// (health check de Render, curl, GitHub Actions) no vienen de un navegador y
// pasan.
export function corsMiddleware(allowedOrigins: string[]): RequestHandler {
  const isAllowed = originMatcher(allowedOrigins);

  return (req, res, next) => {
    // La respuesta depende del origen: un caché no la puede reutilizar para otro.
    res.vary('Origin');
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    if (!isAllowed(origin)) {
      res
        .status(403)
        .json(apiError('ORIGIN_NOT_ALLOWED', `El origen ${origin} no tiene permitido usar la API`));
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_S);
      res.status(204).end();
      return;
    }
    next();
  };
}
