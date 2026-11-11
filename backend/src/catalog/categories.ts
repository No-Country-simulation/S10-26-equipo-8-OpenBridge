import { asc, count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { category, repositoryCategory } from '../db/schema.js';
import type { CategoryList } from './schema.js';

// Todas las categorías con la cantidad de repositorios de cada una. LEFT JOIN:
// las que no tienen repos salen con 0. Un repo en varias categorías cuenta
// una vez en cada una (la PK de repository_category evita duplicados).
export async function listCategories(db: Db): Promise<CategoryList> {
  const data = await db
    .select({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      repositoryCount: count(repositoryCategory.repositoryId).mapWith(Number),
    })
    .from(category)
    .leftJoin(repositoryCategory, eq(repositoryCategory.categoryId, category.id))
    .groupBy(category.id)
    .orderBy(asc(category.name), asc(category.slug));

  return { data };
}
