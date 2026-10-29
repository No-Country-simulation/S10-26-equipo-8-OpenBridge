CREATE TYPE "public"."idea_difficulty" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."idea_source" AS ENUM('LLM', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('DRAFT', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('REST_API', 'DOCKER', 'SDK', 'WEBHOOK', 'CLI');--> statement-breakpoint
CREATE TABLE "integration_idea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"integration_type" "integration_type" NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snippet" jsonb,
	"stack_compatibility" text[] DEFAULT '{}'::text[] NOT NULL,
	"difficulty" "idea_difficulty" NOT NULL,
	"connects_with" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "idea_status" DEFAULT 'DRAFT' NOT NULL,
	"source" "idea_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_idea_webhook_triggers" CHECK ("integration_idea"."integration_type" <> 'WEBHOOK' OR jsonb_array_length("integration_idea"."triggers") > 0),
	CONSTRAINT "integration_idea_snippet_language" CHECK ("integration_idea"."snippet" IS NULL OR coalesce(trim("integration_idea"."snippet"->>'language'), '') <> '')
);
--> statement-breakpoint
ALTER TABLE "integration_idea" ADD CONSTRAINT "integration_idea_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_idea_repository_id_idx" ON "integration_idea" USING btree ("repository_id");