CREATE TYPE "public"."sync_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "sync_run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"repos_total" integer NOT NULL,
	"repos_ok" integer DEFAULT 0 NOT NULL,
	"repos_failed" integer DEFAULT 0 NOT NULL,
	"rate_limit_used" integer DEFAULT 0 NOT NULL,
	"rate_limit_remaining" integer,
	"rate_limit_reset_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
