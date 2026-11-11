#!/usr/bin/env node
/** Compara respuestas capturadas de OB-33 con el oráculo definido por QA. */
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const dataset = JSON.parse(
  fs.readFileSync(path.join(root, 'data/assistant-evaluation.json'), 'utf8'),
);
const input = process.argv[2] || 'results/actual-results.json';
if (!fs.existsSync(path.resolve(root, input))) {
  console.error(`No existe ${input}. Primero ejecutá scripts/run-assistant-evaluation.mjs.`);
  process.exit(1);
}
const actual = JSON.parse(fs.readFileSync(path.resolve(root, input), 'utf8'));
if (
  !Array.isArray(dataset) ||
  !Array.isArray(actual) ||
  dataset.length < 10 ||
  dataset.length > 15
) {
  console.error('Dataset/resultados inválidos o cantidad de escenarios fuera del rango 10–15.');
  process.exit(1);
}
const byId = new Map(actual.map((x) => [x.id, x]));
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
const findCode = (body) =>
  body?.error?.code ?? body?.code ?? body?.errorCode ?? body?.error?.errorCode;
const rows = dataset.map((expected) => {
  const got = byId.get(expected.id);
  if (!got || got.http_status == null)
    return {
      id: expected.id,
      title: expected.title,
      status: 'SIN_RESULTADO',
      capabilities_covered_percent: null,
      components_covered_percent: null,
      notes: got?.transport_error ?? 'No se ejecutó este escenario',
    };
  const code = findCode(got.response);
  if (expected.expected_behavior === 'ask_for_context') {
    const passed = got.http_status === 422 && code === 'INSUFFICIENT_CONTEXT';
    return {
      id: expected.id,
      title: expected.title,
      status: passed ? 'PASS' : 'FAIL',
      capabilities_covered_percent: null,
      components_covered_percent: null,
      asks_for_context: got.http_status === 422,
      http_status: got.http_status,
      error_code: code ?? null,
    };
  }
  const capabilities = got.response?.data?.capabilities;
  if (got.http_status !== 200 || !Array.isArray(capabilities))
    return {
      id: expected.id,
      title: expected.title,
      status: 'ERROR_API',
      capabilities_covered_percent: null,
      components_covered_percent: null,
      http_status: got.http_status,
      error_code: code ?? null,
    };
  const foundKeys = new Set(capabilities.map((c) => norm(c.key)).filter(Boolean));
  const capHits = expected.expected_capabilities.filter((k) => foundKeys.has(norm(k)));
  const capPct = expected.expected_capabilities.length
    ? +((capHits.length / expected.expected_capabilities.length) * 100).toFixed(2)
    : null;
  let componentHits = 0;
  const componentDetails = expected.expected_components.map((group) => {
    const capability = capabilities.find((c) => norm(c.key) === norm(group.capability));
    const candidates = (capability?.candidates ?? []).map((c) => norm(c.title));
    const accepted = group.acceptable_repositories.map(norm);
    const matched = accepted.find((repo) =>
      candidates.some(
        (candidate) =>
          candidate === repo || candidate.endsWith('/' + repo) || repo.endsWith('/' + candidate),
      ),
    );
    if (matched) componentHits++;
    return {
      capability: group.capability,
      matched: Boolean(matched),
      matched_repository: matched ?? null,
    };
  });
  const compPct = expected.expected_components.length
    ? +((componentHits / expected.expected_components.length) * 100).toFixed(2)
    : null;
  const status = capPct === 100 && (compPct === null || compPct === 100) ? 'PASS' : 'REVISAR';
  return {
    id: expected.id,
    title: expected.title,
    status,
    capabilities_covered_percent: capPct,
    components_covered_percent: compPct,
    detected_capabilities: [...foundKeys],
    component_details: componentDetails,
    http_status: got.http_status,
  };
});
const average = (vals) => {
  const v = vals.filter((x) => typeof x === 'number');
  return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
};
const summary = {
  executed_at: new Date().toISOString(),
  endpoint: process.env.ASSISTANT_API_URL ?? 'No registrado',
  total_cases: dataset.length,
  cases_with_result: rows.filter((r) => !['SIN_RESULTADO', 'ERROR_API'].includes(r.status)).length,
  average_capabilities_covered_percent: average(rows.map((r) => r.capabilities_covered_percent)),
  average_expected_components_recommended_percent: average(
    rows.map((r) => r.components_covered_percent),
  ),
  cases: rows,
};
const historyDir = path.join(root, 'results/history');
fs.mkdirSync(historyDir, { recursive: true });
const latestPath = path.join(historyDir, 'latest.json');
if (fs.existsSync(latestPath)) {
  const previous = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  const delta = (a, b) =>
    typeof a === 'number' && typeof b === 'number' ? +(a - b).toFixed(2) : null;
  summary.comparison = {
    previous_run: previous.executed_at,
    capabilities_delta: delta(
      summary.average_capabilities_covered_percent,
      previous.average_capabilities_covered_percent,
    ),
    components_delta: delta(
      summary.average_expected_components_recommended_percent,
      previous.average_expected_components_recommended_percent,
    ),
  };
} else summary.comparison = { note: 'Primera corrida: se establece la línea base.' };
const runPath = path.join(historyDir, `run-${Date.now()}.json`);
fs.writeFileSync(runPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2));
console.table(
  rows.map(({ id, title, status, capabilities_covered_percent, components_covered_percent }) => ({
    id,
    title,
    status,
    capacidades: capabilities_covered_percent,
    componentes: components_covered_percent,
  })),
);
console.log(
  '\nPromedio de capacidades:',
  summary.average_capabilities_covered_percent ?? 'N/D',
  '%',
);
console.log(
  'Promedio de componentes:',
  summary.average_expected_components_recommended_percent ?? 'N/D',
  '%',
);
console.log('Reporte:', runPath);
if (summary.comparison?.capabilities_delta != null || summary.comparison?.components_delta != null)
  console.log('Comparación con corrida anterior:', summary.comparison);
