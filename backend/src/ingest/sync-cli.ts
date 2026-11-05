import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/client.js';
import { generateRepositoryEmbeddings } from './embeddings.js';
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
      afterSync: async () => {
        const embedded = await generateRepositoryEmbeddings(db);
        console.log(`Embeddings actualizados: ${embedded} repositorios.`);
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
