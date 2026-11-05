import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDb } from '../db/client.js';
import { generateIdeas, selectRepositoriesWithoutIdeas } from './generator.js';
import { createOllamaIdeaModel } from './model.js';
import { ideasJsonSchema, loadIdeaPrompt } from './prompt.js';
import { cleanReadme, fetchReadme } from './readme.js';

// npm run db:generate-ideas -- [--repo owner/name] [--limit 10] [--prompt v2]
// Genera borradores para los repos que todavía no tienen ideas del modelo.
// --prompt elige la versión de backend/prompts/ideas/ (por defecto,
// IDEA_PROMPT_VERSION en prompt.ts).

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const { values } = parseArgs({
  options: {
    repo: { type: 'string' },
    limit: { type: 'string' },
    prompt: { type: 'string' },
  },
});
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error('--limit tiene que ser un entero positivo');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');
const token = process.env.GITHUB_TOKEN?.trim();
if (!token) throw new Error('Falta la variable de entorno GITHUB_TOKEN');

const { db, pool } = createDb(url);
const prompt = loadIdeaPrompt(values.prompt);
const model = createOllamaIdeaModel({ format: ideasJsonSchema });

type Entry =
  | { repo: string; status: 'created'; ideas: number }
  | { repo: string; status: 'skipped'; reason: string }
  | { repo: string; status: 'discarded' | 'error'; error: string; raw?: string };

const entries: Entry[] = [];
try {
  const repositories = await selectRepositoriesWithoutIdeas(db, { fullName: values.repo, limit });
  console.log(
    `Repos sin ideas: ${repositories.length} (modelo ${model.name}, prompt ${prompt.version})`,
  );

  for (const repo of repositories) {
    const [owner, name] = repo.fullName.split('/');
    if (!owner || !name) {
      entries.push({
        repo: repo.fullName,
        status: 'error',
        error: 'Nombre sin formato owner/name',
      });
      console.error(`✗ ${repo.fullName}: nombre sin formato owner/name`);
      continue;
    }
    try {
      const readme = await fetchReadme({ owner, name }, { token });
      if (!readme?.trim()) {
        entries.push({ repo: repo.fullName, status: 'skipped', reason: 'Sin README' });
        console.log(`- ${repo.fullName}: sin README, se saltea`);
        continue;
      }

      const result = await generateIdeas(
        db,
        {
          repositoryId: repo.id,
          context: {
            fullName: repo.fullName,
            description: repo.description,
            primaryLanguage: repo.primaryLanguage,
            topics: repo.topics,
            readme: cleanReadme(readme),
          },
        },
        { model, prompt },
      );

      if (result.status === 'created') {
        entries.push({ repo: repo.fullName, status: 'created', ideas: result.ideas.length });
        console.log(`✓ ${repo.fullName}: ${result.ideas.length} ideas`);
      } else {
        entries.push({ repo: repo.fullName, ...result });
        console.warn(`✗ ${repo.fullName}: descartado tras reintentar\n${result.error}`);
      }
    } catch (error) {
      entries.push({ repo: repo.fullName, status: 'error', error: errorMessage(error) });
      console.error(`✗ ${repo.fullName}: ${errorMessage(error)}`);
    }
  }
} finally {
  await pool.end();
}

const count = (status: Entry['status']) => entries.filter((e) => e.status === status).length;
const report = {
  generatedAt: new Date().toISOString(),
  model: model.name,
  promptVersion: prompt.version,
  created: count('created'),
  discarded: count('discarded'),
  skipped: count('skipped'),
  errors: count('error'),
  entries,
};
const reportsDir = new URL('../../reports/', import.meta.url);
mkdirSync(reportsDir, { recursive: true });
const reportPath = new URL('ideas-report.json', reportsDir);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `\nCon ideas: ${report.created} · Descartados: ${report.discarded} · Sin README: ${report.skipped} · Errores: ${report.errors}`,
);
console.log(`Reporte: ${fileURLToPath(reportPath)}`);
// Con Ollama caído todos los repos fallan: que el comando lo informe.
if (report.errors > 0) process.exitCode = 1;
