#!/usr/bin/env node
/**
 * Compara respuestas capturadas (OB-33 capabilities / OB-34 proposals) con el oráculo de QA.
 *
 * Uso: node scripts/evaluate-assistant.mjs [results/actual-results.json]
 * Variables: PASS_THRESHOLD (default 80) = % mínimo de cobertura para marcar PASS.
 */
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
const raw = JSON.parse(fs.readFileSync(path.resolve(root, input), 'utf8'));
// Formato viejo: array plano de OB-33. Nuevo: { mode, endpoint, executed_at, results }.
const actualFile = Array.isArray(raw) ? { mode: 'capabilities', results: raw } : raw;
const mode = actualFile.mode ?? 'capabilities';
const actual = actualFile.results;
if (!['capabilities', 'proposals'].includes(mode)) {
  console.error(`Modo desconocido en ${input}: "${mode}".`);
  process.exit(1);
}
if (
  !Array.isArray(dataset) ||
  !Array.isArray(actual) ||
  dataset.length < 10 ||
  dataset.length > 15
) {
  console.error('Dataset/resultados inválidos o cantidad de escenarios fuera del rango 10–15.');
  process.exit(1);
}
const passThreshold = Number(process.env.PASS_THRESHOLD ?? 80);
if (!Number.isFinite(passThreshold) || passThreshold < 0 || passThreshold > 100) {
  console.error('PASS_THRESHOLD debe ser un número entre 0 y 100.');
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
const pct = (hits, total) => (total ? +((hits / total) * 100).toFixed(2) : null);
const meets = (value) => value === null || value >= passThreshold;
const sameRepo = (candidate, repo) =>
  candidate === repo || candidate.endsWith('/' + repo) || repo.endsWith('/' + candidate);

/** Devuelve el primer repositorio aceptado que coincide con algún candidato, o undefined. */
const firstMatch = (group, candidateNames) => {
  const candidates = candidateNames.map(norm);
  return group.acceptable_repositories
    .map(norm)
    .find((repo) => candidates.some((c) => sameRepo(c, repo)));
};

const base = (expected) => ({ id: expected.id, title: expected.title });
const empty = { capabilities_covered_percent: null, components_covered_percent: null };

// Extrae, según el modo, lo necesario para puntuar un caso con respuesta exitosa.
function extract(got) {
  if (mode === 'proposals') {
    const p = got.proposal;
    if (got.http_status !== 200 || !p || !Array.isArray(p.capabilities)) return null;
    const components = Array.isArray(p.components) ? p.components : [];
    const gaps = new Set((Array.isArray(p.gaps) ? p.gaps : []).map((g) => norm(g.capability)));
    return {
      keys: p.capabilities.map((c) => c.key),
      namesFor: (capability) =>
        components
          .filter((c) => norm(c.capability) === norm(capability))
          .flatMap((c) => [c.repository?.fullName, c.alternative?.fullName])
          .filter(Boolean),
      isGap: (capability) => gaps.has(norm(capability)),
    };
  }
  const capabilities = got.response?.data?.capabilities;
  if (got.http_status !== 200 || !Array.isArray(capabilities)) return null;
  return {
    keys: capabilities.map((c) => c.key),
    namesFor: (capability) =>
      (capabilities.find((c) => norm(c.key) === norm(capability))?.candidates ?? []).map(
        (c) => c.title,
      ),
    isGap: () => false,
  };
}

const rows = dataset.map((expected) => {
  const got = byId.get(expected.id);
  if (!got || got.http_status == null)
    return {
      ...base(expected),
      status: 'SIN_RESULTADO',
      ...empty,
      notes: got?.transport_error ?? 'No se ejecutó este escenario',
    };

  const errorBody = mode === 'proposals' ? got.error : got.response;
  const code =
    mode === 'proposals' ? (got.error?.code ?? findCode(got.error)) : findCode(errorBody);

  if (expected.expected_behavior === 'ask_for_context') {
    // OB-34 responde con un evento SSE `error` (HTTP 200); OB-33 con HTTP 422.
    const passed =
      mode === 'proposals'
        ? got.http_status === 200 && code === 'INSUFFICIENT_CONTEXT'
        : got.http_status === 422 && code === 'INSUFFICIENT_CONTEXT';
    return {
      ...base(expected),
      status: passed ? 'PASS' : 'FAIL',
      ...empty,
      asks_for_context: code === 'INSUFFICIENT_CONTEXT',
      http_status: got.http_status,
      error_code: code ?? null,
    };
  }

  const data = extract(got);
  if (!data)
    return {
      ...base(expected),
      status: 'ERROR_API',
      ...empty,
      http_status: got.http_status,
      error_code: code ?? null,
    };

  const foundKeys = new Set(data.keys.map(norm).filter(Boolean));
  const capHits = expected.expected_capabilities.filter((k) => foundKeys.has(norm(k)));
  const capPct = pct(capHits.length, expected.expected_capabilities.length);

  let componentHits = 0;
  let gapGroups = 0;
  const componentDetails = expected.expected_components.map((group) => {
    const matched = firstMatch(group, data.namesFor(group.capability));
    const gap = data.isGap(group.capability);
    if (matched) componentHits++;
    if (gap) gapGroups++;
    return {
      capability: group.capability,
      matched: Boolean(matched),
      matched_repository: matched ?? null,
      ...(mode === 'proposals' ? { in_gaps: gap } : {}),
    };
  });
  const compPct = pct(componentHits, expected.expected_components.length);
  const status = meets(capPct) && meets(compPct) ? 'PASS' : 'REVISAR';
  return {
    ...base(expected),
    status,
    capabilities_covered_percent: capPct,
    components_covered_percent: compPct,
    ...(mode === 'proposals'
      ? { expected_groups_in_gaps: gapGroups, expected_groups_total: componentDetails.length }
      : {}),
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
  mode,
  executed_at: new Date().toISOString(),
  endpoint: actualFile.endpoint ?? process.env.ASSISTANT_API_URL ?? 'No registrado',
  pass_threshold_percent: passThreshold,
  total_cases: dataset.length,
  cases_with_result: rows.filter((r) => !['SIN_RESULTADO', 'ERROR_API'].includes(r.status)).length,
  average_capabilities_covered_percent: average(rows.map((r) => r.capabilities_covered_percent)),
  average_expected_components_recommended_percent: average(
    rows.map((r) => r.components_covered_percent),
  ),
  cases: rows,
};

// Historial separado por modo: una corrida solo se compara con la anterior del mismo modo.
const historyDir = path.join(root, 'results/history', mode);
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

console.log(`Modo: ${mode}`);
console.table(
  rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    capacidades: r.capabilities_covered_percent,
    componentes: r.components_covered_percent,
    ...(mode === 'proposals'
      ? {
          gaps:
            r.expected_groups_total != null
              ? `${r.expected_groups_in_gaps}/${r.expected_groups_total}`
              : null,
        }
      : {}),
  })),
);
console.log(`\nUmbral PASS: ${passThreshold} %`);
console.log('Promedio de capacidades:', summary.average_capabilities_covered_percent ?? 'N/D', '%');
console.log(
  'Promedio de componentes:',
  summary.average_expected_components_recommended_percent ?? 'N/D',
  '%',
);
console.log('Reporte:', runPath);
if (summary.comparison?.capabilities_delta != null || summary.comparison?.components_delta != null)
  console.log('Comparación con corrida anterior del mismo modo:', summary.comparison);
