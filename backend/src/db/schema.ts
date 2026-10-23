import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const maintenanceLevel = pgEnum('maintenance_level', [
  'ACTIVE',
  'MODERATE',
  'AT_RISK',
  'ARCHIVED',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const category = pgTable('category', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  ...timestamps,
});

// Ficha técnica de cada repositorio del catálogo. Lo que viene de GitHub
// se actualiza por github_id; health_score y maintenance_level los calcula
// el pipeline de ingesta (OB-11).
export const repository = pgTable(
  'repository',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: bigint('github_id', { mode: 'number' }).notNull().unique(),
    // Sin UNIQUE a propósito: si dos repos intercambian nombres en GitHub,
    // la sincronización del día los ve un momento con el mismo full_name.
    fullName: text('full_name').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    url: text('url').notNull(),
    homepage: text('homepage'),
    primaryLanguage: text('primary_language'),
    licenseSpdx: text('license_spdx'),
    stars: integer('stars').notNull().default(0),
    forks: integer('forks').notNull().default(0),
    openIssues: integer('open_issues').notNull().default(0),
    lastCommitAt: timestamp('last_commit_at', { withTimezone: true }),
    lastReleaseAt: timestamp('last_release_at', { withTimezone: true }),
    archived: boolean('archived').notNull().default(false),
    topics: text('topics')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    activeMaintainer: boolean('active_maintainer').notNull().default(false),
    healthScore: smallint('health_score'),
    maintenanceLevel: maintenanceLevel('maintenance_level'),
    contentHash: text('content_hash'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('repository_health_score_range', sql`${t.healthScore} BETWEEN 0 AND 100`),
    index('repository_full_name_idx').on(t.fullName),
  ],
);

// Muchos a muchos: una herramienta como Supabase es a la vez Base de Datos
// y Autenticación, y tiene que aparecer al filtrar por cualquiera de las dos.
export const repositoryCategory = pgTable(
  'repository_category',
  {
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repository.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.repositoryId, t.categoryId] }),
    // La PK ya sirve para buscar por repo; este índice cubre el filtro por categoría.
    index('repository_category_category_id_idx').on(t.categoryId),
  ],
);

export type Category = typeof category.$inferSelect;
export type Repository = typeof repository.$inferSelect;
export type NewRepository = typeof repository.$inferInsert;
