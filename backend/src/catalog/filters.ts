import { eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { category, maintenanceLevel, repository, repositoryCategory } from '../db/schema.js';
import type { CatalogFilters } from './schema.js';

const byCountThenValue = (a: { value: string; count: number }, b: typeof a) =>
  b.count - a.count || a.value.localeCompare(b.value);

// Opciones de los filtros del catálogo, calculadas sobre todos los repos (no
// cambian con los filtros activos). Solo aparecen valores que existen.
export async function getCatalogFilters(db: Db): Promise<CatalogFilters> {
  const count = sql<number>`count(*)::int`;

  const [languages, licenses, categories, levels, [stars]] = await Promise.all([
    db
      .select({ value: sql<string>`${repository.primaryLanguage}`, count })
      .from(repository)
      .where(isNotNull(repository.primaryLanguage))
      .groupBy(repository.primaryLanguage),
    db
      .select({ value: sql<string>`${repository.licenseSpdx}`, count })
      .from(repository)
      .where(isNotNull(repository.licenseSpdx))
      .groupBy(repository.licenseSpdx),
    db
      .select({ value: category.slug, label: category.name, count })
      .from(repositoryCategory)
      .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
      .groupBy(category.slug, category.name),
    db
      .select({ value: repository.maintenanceLevel, count })
      .from(repository)
      .where(isNotNull(repository.maintenanceLevel))
      .groupBy(repository.maintenanceLevel),
    db
      .select({
        min: sql<number>`coalesce(min(${repository.stars}), 0)::int`,
        max: sql<number>`coalesce(max(${repository.stars}), 0)::int`,
      })
      .from(repository),
  ]);

  return {
    languages: languages.sort(byCountThenValue),
    licenses: licenses.sort(byCountThenValue),
    categories: categories.sort(byCountThenValue),
    // En el orden del enum (de más activo a archivado), no por cantidad.
    maintenanceLevels: maintenanceLevel.enumValues.flatMap((value) => {
      const found = levels.find((level) => level.value === value);
      return found ? [{ value, count: found.count }] : [];
    }),
    stars,
  };
}
