import { pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from './client.js';
import { category } from './schema.js';

export const BASE_CATEGORIES = [
  {
    slug: 'auth',
    name: 'Autenticación',
    description: 'Inicio de sesión, identidad y control de acceso',
  },
  { slug: 'database', name: 'Base de Datos', description: 'Bases de datos y backends gestionados' },
  { slug: 'payments', name: 'Pagos', description: 'Cobros, suscripciones y facturación' },
  { slug: 'ai', name: 'IA', description: 'Modelos, orquestación y herramientas de IA' },
  { slug: 'analytics', name: 'Analítica', description: 'Métricas de producto y de uso' },
  { slug: 'search', name: 'Búsqueda', description: 'Motores de búsqueda de texto y semántica' },
];

// Idempotente: se puede correr en cada deploy sin duplicar categorías.
export async function seedCategories(db: Db) {
  await db
    .insert(category)
    .values(BASE_CATEGORIES)
    .onConflictDoUpdate({
      target: category.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        updatedAt: sql`now()`,
      },
    });
}

// Ejecutado directo (npm run db:seed).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');
  const { db, pool } = createDb(url);
  await seedCategories(db);
  await pool.end();
  console.log(`Categorías cargadas: ${BASE_CATEGORIES.length}`);
}
