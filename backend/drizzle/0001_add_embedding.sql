-- drizzle-kit no genera extensiones. El script de docker/postgres/init solo cubre la
-- base por defecto: las bases de test y Neon la necesitan acá.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."embedding_entity_type" AS ENUM('REPOSITORY', 'INTEGRATION_IDEA');--> statement-breakpoint
CREATE TABLE "embedding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "embedding_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"content" text NOT NULL,
	"vector" vector(768) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_entity_idx" ON "embedding" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("vector" vector_cosine_ops);