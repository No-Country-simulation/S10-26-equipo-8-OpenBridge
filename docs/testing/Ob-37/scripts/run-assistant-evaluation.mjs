#!/usr/bin/env node
/**
 * Ejecuta el dataset contra POST /api/v1/assistant/capabilities.
 * Uso: ASSISTANT_API_URL=http://localhost:4000/api/v1/assistant/capabilities node scripts/run-assistant-evaluation.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const datasetPath = path.join(root, 'data/assistant-evaluation.json');
const outputPath = path.join(root, 'results/actual-results.json');
const endpoint = process.env.ASSISTANT_API_URL;
const minHealth = Number(process.env.MIN_HEALTH ?? 60);
if (!endpoint) {
  console.error('Falta ASSISTANT_API_URL. Ejemplo: http://localhost:4000/api/v1/assistant/capabilities');
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const results = [];
for (const item of dataset) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: item.business_description, constraints: { minHealth } }),
      signal: AbortSignal.timeout(35000)
    });
    const rawText = await response.text();
    let body;
    try { body = rawText ? JSON.parse(rawText) : null; }
    catch { body = { raw: rawText }; }
    results.push({ id: item.id, http_status: response.status, duration_ms: Date.now() - started, response: body });
    console.log(`${item.id}: HTTP ${response.status} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ id: item.id, http_status: null, duration_ms: Date.now() - started, transport_error: error.message, response: null });
    console.error(`${item.id}: ERROR ${error.message}`);
  }
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\nRespuestas guardadas en ${outputPath}`);
console.log('Ahora ejecutá: node scripts/evaluate-assistant.mjs results/actual-results.json');
