CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "server_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid,
	"protocol_id" uuid,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"contact_email" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"client_ip_hash" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "site_settings_singleton" CHECK ("site_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "server_protocols" ADD COLUMN "quota_limit" integer;--> statement-breakpoint
ALTER TABLE "server_protocols" ADD COLUMN "quota_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server_protocols" ADD COLUMN "quota_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill readable slugs for existing servers: <country code><ordinal>, e.g. de1, de2.
UPDATE "servers" s SET "slug" = x.slug FROM (
  SELECT "id", lower("country_code") || row_number() OVER (PARTITION BY lower("country_code") ORDER BY "created_at", "id") AS slug FROM "servers"
) x WHERE x."id" = s."id";--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "last_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "vpn_accounts" ADD COLUMN "quota_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_resolved_by_admins_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_reports_status_created_idx" ON "server_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "server_reports_server_idx" ON "server_reports" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_slug_unique" ON "servers" USING btree ("slug") WHERE "servers"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "server_protocols" ADD CONSTRAINT "server_protocols_quota_positive" CHECK ("server_protocols"."quota_limit" is null or "server_protocols"."quota_limit" > 0);--> statement-breakpoint
ALTER TABLE "server_protocols" ADD CONSTRAINT "server_protocols_quota_used_non_negative" CHECK ("server_protocols"."quota_used" >= 0);--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_slug_format" CHECK ("servers"."slug" ~ '^[a-z0-9][a-z0-9-]{0,31}$');