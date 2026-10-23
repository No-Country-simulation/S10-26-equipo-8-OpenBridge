CREATE TYPE "public"."maintenance_level" AS ENUM('ACTIVE', 'MODERATE', 'AT_RISK', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"homepage" text,
	"primary_language" text,
	"license_spdx" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"open_issues" integer DEFAULT 0 NOT NULL,
	"last_commit_at" timestamp with time zone,
	"last_release_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_maintainer" boolean DEFAULT false NOT NULL,
	"health_score" smallint,
	"maintenance_level" "maintenance_level",
	"content_hash" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "repository_health_score_range" CHECK ("repository"."health_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "repository_category" (
	"repository_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "repository_category_repository_id_category_id_pk" PRIMARY KEY("repository_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "repository_category" ADD CONSTRAINT "repository_category_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_category" ADD CONSTRAINT "repository_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_full_name_idx" ON "repository" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "repository_category_category_id_idx" ON "repository_category" USING btree ("category_id");