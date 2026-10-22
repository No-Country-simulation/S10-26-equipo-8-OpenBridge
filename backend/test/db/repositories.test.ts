import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, repository } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('upsertRepository', () => {
  let t: TestDb;
  let categoryId: string;

  beforeAll(async () => {
    t = await createTestDb();
    const [auth] = await t.db
      .insert(category)
      .values({ slug: 'auth', name: 'Autenticación' })
      .returning();
    categoryId = auth.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  const keycloak = () => ({
    githubId: 4921466,
    fullName: 'keycloak/keycloak',
    name: 'keycloak',
    url: 'https://github.com/keycloak/keycloak',
    stars: 24000,
    categoryId,
  });

  it('inserta un repositorio nuevo', async () => {
    const saved = await upsertRepository(t.db, keycloak());

    expect(saved.githubId).toBe(4921466);
    expect(saved.stars).toBe(24000);
  });

  it('actualiza en lugar de duplicar cuando el github_id ya existe', async () => {
    const first = await upsertRepository(t.db, keycloak());
    const second = await upsertRepository(t.db, { ...keycloak(), stars: 25000 });

    const rows = await t.db.select().from(repository).where(eq(repository.githubId, 4921466));
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.stars).toBe(25000);
  });

  it('sincroniza aunque dos repos intercambien sus nombres en GitHub', async () => {
    const base = { url: 'https://github.com/x', categoryId };
    await upsertRepository(t.db, { ...base, githubId: 10, fullName: 'org/uno', name: 'uno' });
    await upsertRepository(t.db, { ...base, githubId: 20, fullName: 'org/dos', name: 'dos' });

    // La ingesta procesa uno a la vez: el 10 ya se llama org/dos mientras
    // el 20 todavía figura con su nombre viejo.
    await upsertRepository(t.db, { ...base, githubId: 10, fullName: 'org/dos', name: 'dos' });
    await upsertRepository(t.db, { ...base, githubId: 20, fullName: 'org/uno', name: 'uno' });

    const [diez] = await t.db.select().from(repository).where(eq(repository.githubId, 10));
    expect(diez.fullName).toBe('org/dos');
  });

  it('rechaza un health score fuera de 0 a 100', async () => {
    await expect(
      upsertRepository(t.db, { ...keycloak(), githubId: 1, fullName: 'x/y', healthScore: 101 }),
    ).rejects.toMatchObject({ cause: { constraint: 'repository_health_score_range' } });
  });
});
