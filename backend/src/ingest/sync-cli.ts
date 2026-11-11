import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/client.js';
import { formatEmbeddingReport, generateEmbeddings } from './embeddings.js';
import { parseInitialInventory } from './initial-load.js';
import { runSync } from './sync-run.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const inventoryPath = resolve(repositoryRoot, 'seed/repos.yaml');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL');

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('Falta la variable de entorno GITHUB_TOKEN');

  const inventory = parseInitialInventory(await readFile(inventoryPath, 'utf8'));
  const repositories = inventory.map(({ owner, name }) => ({ owner, name }));
  const { db, pool } = createDb(databaseUrl);

  try {
    const run = await runSync(db, repositories, {
      token,
      // Un vector que no se pudo generar no invalida la sincronización: se
      // informa y el comando termina con error para que Actions lo marque.
      afterSync: async () => {
        const report = await generateEmbeddings(db);
        console.log(formatEmbeddingReport(report));
        if (report.failed.length > 0) process.exitCode = 1;
      },
    });

    if (!run.finishedAt) throw new Error('La sincronización terminó sin fecha de cierre');
    const durationMs = run.finishedAt.getTime() - run.startedAt.getTime();
    console.log(
      `Sincronización ${run.status}: ${run.reposOk}/${run.reposTotal} correctos, ` +
        `${run.reposFailed} fallidos; duración ${durationMs} ms.`,
    );
    if (run.reposFailed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la sincronización diaria:', error);
  process.exitCode = 1;
});
