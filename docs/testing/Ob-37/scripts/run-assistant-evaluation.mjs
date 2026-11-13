#!/usr/bin/env node
/**
 * Ejecuta el dataset contra el asistente y guarda las respuestas crudas.
 *
 * Variables de entorno:
 *   ASSISTANT_MODE      capabilities (default, OB-33) | proposals (OB-34, SSE)
 *   ASSISTANT_API_BASE  default http://localhost:4000/api/v1
 *   ASSISTANT_API_URL   endpoint completo; pisa al derivado de modo + base
 *   MIN_HEALTH          default 40 (umbral de madurez de OB-34)
 *
 * Uso (desde docs/testing/Ob-37):
 *   ASSISTANT_MODE=proposals node scripts/run-assistant-evaluation.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const MODES = ['capabilities', 'proposals'];
const root = process.cwd();
const datasetPath = path.join(root, 'data/assistant-evaluation.json');
const outputPath = path.join(root, 'results/actual-results.json');

const mode = process.env.ASSISTANT_MODE ?? 'capabilities';
if (!MODES.includes(mode)) {
  console.error(`ASSISTANT_MODE inválido: "${mode}". Valores: ${MODES.join(' | ')}.`);
  process.exit(1);
}
const apiBase = (process.env.ASSISTANT_API_BASE ?? 'http://localhost:4000/api/v1').replace(
  /\/+$/,
  '',
);
const endpoint = process.env.ASSISTANT_API_URL ?? `${apiBase}/assistant/${mode}`;
const minHealth = Number(process.env.MIN_HEALTH ?? 40);
if (!Number.isFinite(minHealth)) {
  console.error('MIN_HEALTH debe ser numérico.');
  process.exit(1);
}
// El servidor corta a los 30 s (UPSTREAM_TIMEOUT); el cliente espera un poco más.
const TIMEOUT_MS = 35000;

/** Parsea un cuerpo text/event-stream completo. Ignora bloques sin `data:` (p. ej. `: ping`). */
function parseSse(text) {
  const messages = [];
  const normalized = text.replace(/\r\n/g, '\n');
  for (const block of normalized.split('\n\n')) {
    const lines = block.split('\n');
    const event =
      lines
        .find((l) => l.startsWith('event:'))
        ?.slice(6)
        .trim() ?? 'message';
    const data = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      messages.push({ event, payload: JSON.parse(data) });
    } catch {
      messages.push({ event, payload: { raw: data } });
    }
  }
  return messages;
}

const tryJson = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
};

async function runCapabilities(item) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: item.business_description, constraints: { minHealth } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { http_status: response.status, response: tryJson(await response.text()) };
}

async function runProposals(item) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ description: item.business_description, constraints: { minHealth } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text(); // lee el stream hasta el cierre
  const record = { http_status: response.status, stages: [], proposal: null, error: null };
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream')) {
    // Validación (400/413) u otro fallo previo al stream: JSON plano.
    const body = tryJson(text);
    record.error = body?.error ?? body;
    return record;
  }
  for (const { event, payload } of parseSse(text)) {
    if (event === 'progress' && payload.stage) record.stages.push(payload.stage);
    else if (event === 'result') record.proposal = payload.data ?? payload;
    else if (event === 'error') record.error = payload.error ?? payload;
  }
  return record;
}

const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
console.log(`Modo: ${mode} | Endpoint: ${endpoint} | minHealth: ${minHealth}\n`);
const results = [];
for (const item of dataset) {
  const started = Date.now();
  try {
    const out = mode === 'proposals' ? await runProposals(item) : await runCapabilities(item);
    const duration_ms = Date.now() - started;
    results.push({ id: item.id, ...out, duration_ms });
    console.log(`${item.id}: HTTP ${out.http_status} (${duration_ms} ms)`);
  } catch (error) {
    results.push({
      id: item.id,
      http_status: null,
      duration_ms: Date.now() - started,
      transport_error: error.message,
      ...(mode === 'capabilities' ? { response: null } : {}),
    });
    console.error(`${item.id}: ERROR ${error.message}`);
  }
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({ mode, endpoint, executed_at: new Date().toISOString(), results }, null, 2),
);
console.log(`\nRespuestas guardadas en ${outputPath}`);
console.log('Ahora ejecutá: node scripts/evaluate-assistant.mjs results/actual-results.json');
