import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/client.js';
import { upsertRepository } from '../db/repositories.js';
import { category } from '../db/schema.js';
import { seedCategories } from '../db/seed.js';
import { fetchRepos } from './github.js';
import { loadInitialInventory, parseInitialInventory } from './initial-load.js';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryPath = resolve(backendDirectory, '../docs/testing/Repositorios.yaml');
const reportPath = resolve(backendDirectory, 'reports/initial-load-report.json');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL');

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('Falta la variable de entorno GITHUB_TOKEN');

  const repositories = parseInitialInventory(await readFile(inventoryPath, 'utf8'));
  const { db, pool } = createDb(databaseUrl);

  try {
    await seedCategories(db);
    const categories = await db.select({ id: category.id, slug: category.slug }).from(category);
    const categoryIds = new Map(categories.map(({ id, slug }) => [slug, id]));

    const report = await loadInitialInventory(repositories, {
      categoryIds,
      fetchBatch: (batch) => fetchRepos(batch, { token }),
      persistRepository: async (repository, categoryIds) => {
        await upsertRepository(db, repository, categoryIds);
      },
    });

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
      'utf8',
    );

    console.log(
      `Carga inicial: ${report.loaded}/${report.attempted} repositorios; ${report.successRatePercent}% de éxito.`,
    );
    console.log(`Informe: ${reportPath}`);
    if (!report.targetMet) {
      process.exitCode = 1;
      console.error('No se alcanzó el objetivo mínimo de carga del 98 %.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la carga inicial:', error);
  process.exitCode = 1;
});
