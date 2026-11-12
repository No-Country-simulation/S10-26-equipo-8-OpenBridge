import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, repository, repositoryCategory } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('upsertRepository', () => {
  let t: TestDb;
  let auth: string;
  let database: string;

  beforeAll(async () => {
    t = await createTestDb();
    const rows = await t.db
      .insert(category)
      .values([
        { slug: 'auth', name: 'Autenticación' },
        { slug: 'database', name: 'Base de Datos' },
      ])
      .returning();
    auth = rows.find((c) => c.slug === 'auth')!.id;
    database = rows.find((c) => c.slug === 'database')!.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  async function categoriesOf(repositoryId: string) {
    const links = await t.db
      .select({ slug: category.slug })
      .from(repositoryCategory)
      .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
      .where(eq(repositoryCategory.repositoryId, repositoryId));
    return links.map((l) => l.slug).sort();
  }

  const keycloak = () => ({
    githubId: 4921466,
    fullName: 'keycloak/keycloak',
    name: 'keycloak',
    url: 'https://github.com/keycloak/keycloak',
    stars: 24000,
  });

  it('inserta un repositorio nuevo', async () => {
    const saved = await upsertRepository(t.db, keycloak(), [auth]);

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

  it('asigna varias categorías a un mismo repositorio', async () => {
    const supabase = await upsertRepository(
      t.db,
      {
        githubId: 54469796,
        fullName: 'supabase/supabase',
        name: 'supabase',
        url: 'https://github.com/supabase/supabase',
      },
      [database, auth],
    );

    expect(await categoriesOf(supabase.id)).toEqual(['auth', 'database']);
  });

  it('reemplaza las categorías cuando se le pasan otras', async () => {
    const saved = await upsertRepository(t.db, keycloak(), [auth, database]);
    await upsertRepository(t.db, keycloak(), [database]);

    expect(await categoriesOf(saved.id)).toEqual(['database']);
  });

  it('ignora categorías repetidas en lugar de fallar', async () => {
    const saved = await upsertRepository(t.db, { ...keycloak(), stars: 27000 }, [
      auth,
      auth,
      database,
    ]);

    expect(saved.stars).toBe(27000);
    expect(await categoriesOf(saved.id)).toEqual(['auth', 'database']);
  });

  it('quita todas las categorías cuando recibe una lista vacía', async () => {
    const saved = await upsertRepository(t.db, keycloak(), [auth]);
    await upsertRepository(t.db, keycloak(), []);

    expect(await categoriesOf(saved.id)).toEqual([]);
  });

  it('conserva las categorías cuando la sincronización no las informa', async () => {
    const saved = await upsertRepository(t.db, keycloak(), [auth]);
    await upsertRepository(t.db, { ...keycloak(), stars: 26000 });

    expect(await categoriesOf(saved.id)).toEqual(['auth']);
  });

  it('no deja borrar una categoría que tiene repositorios', async () => {
    await upsertRepository(t.db, keycloak(), [auth]);

    await expect(t.db.delete(category).where(eq(category.id, auth))).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });

  it('sincroniza aunque dos repos intercambien sus nombres en GitHub', async () => {
    const base = { url: 'https://github.com/x' };
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
