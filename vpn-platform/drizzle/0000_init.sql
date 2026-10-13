CREATE TYPE "public"."account_status" AS ENUM('pending', 'active', 'expired', 'revoked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'administrator', 'server_manager', 'support');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."node_auth_method" AS ENUM('hmac_sha256', 'bearer_token');--> statement-breakpoint
CREATE TYPE "public"."node_tls_mode" AS ENUM('system_ca', 'custom_ca', 'pinned_fingerprint', 'insecure_http');--> statement-breakpoint
CREATE TYPE "public"."protocol_field_type" AS ENUM('text', 'password', 'select', 'number', 'duration');--> statement-breakpoint
CREATE TYPE "public"."provisioning_operation" AS ENUM('create', 'renew', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."provisioning_state" AS ENUM('queued', 'in_flight', 'uncertain', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."server_compatibility" AS ENUM('unknown', 'compatible', 'outdated', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."server_health_status" AS ENUM('unknown', 'online', 'degraded', 'offline');--> statement-breakpoint
CREATE TYPE "public"."server_lifecycle" AS ENUM('draft', 'active', 'maintenance', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."server_status" AS ENUM('pending', 'online', 'offline', 'maintenance', 'disabled', 'full');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'support' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_last_used_step" bigint,
	"mfa_recovery_code_hashes" text[] DEFAULT '{}'::text[] NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_id" uuid,
	"admin_email" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"success" boolean DEFAULT true NOT NULL,
	"ip" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "protocol_field_type" DEFAULT 'text' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"placeholder" text,
	"help_text" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_value" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_fields_key_format" CHECK ("protocol_fields"."key" ~ '^[a-z][a-z0-9_]{0,31}$')
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'shield' NOT NULL,
	"category" text DEFAULT 'vpn' NOT NULL,
	"adapter_key" text NOT NULL,
	"node_identifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"duration_options" integer[] DEFAULT '{3,7,14,30}'::integer[] NOT NULL,
	"default_duration_days" integer DEFAULT 7 NOT NULL,
	"output_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_accounts_per_ip_per_day" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocols_slug_format" CHECK ("protocols"."slug" ~ '^[a-z0-9][a-z0-9-]{0,47}$')
);
--> statement-breakpoint
CREATE TABLE "provisioning_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'info' NOT NULL,
	"server_id" uuid,
	"protocol_id" uuid,
	"account_id" uuid,
	"request_id" uuid,
	"admin_id" uuid,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "provisioning_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" "provisioning_operation" NOT NULL,
	"state" "provisioning_state" DEFAULT 'queued' NOT NULL,
	"account_id" uuid,
	"server_id" uuid NOT NULL,
	"protocol_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"input_digest" text NOT NULL,
	"input_encrypted" text,
	"claim_token_hash" text,
	"client_ip_hash" text,
	"requested_by_admin_id" uuid,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"auth_method" "node_auth_method" DEFAULT 'hmac_sha256' NOT NULL,
	"key_id" text,
	"secret_encrypted" text NOT NULL,
	"tls_mode" "node_tls_mode" DEFAULT 'system_ca' NOT NULL,
	"tls_server_name" text,
	"ca_certificate_pem" text,
	"pinned_fingerprint_sha256" text,
	"client_certificate_pem" text,
	"client_key_encrypted" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "server_health" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reachable" boolean NOT NULL,
	"status" "server_health_status" NOT NULL,
	"latency_ms" integer,
	"cpu_percent" real,
	"memory_used_bytes" bigint,
	"memory_total_bytes" bigint,
	"disk_used_bytes" bigint,
	"disk_total_bytes" bigint,
	"load_1" real,
	"load_5" real,
	"load_15" real,
	"uptime_seconds" bigint,
	"services" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "server_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"protocol_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"detected" boolean DEFAULT false NOT NULL,
	"service_status" text DEFAULT 'unknown' NOT NULL,
	"node_identifier" text,
	"port" integer,
	"ports" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_accounts" integer,
	"current_accounts" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_detected_at" timestamp with time zone,
	"last_detected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_protocols_current_non_negative" CHECK ("server_protocols"."current_accounts" >= 0),
	CONSTRAINT "server_protocols_max_positive" CHECK ("server_protocols"."max_accounts" is null or "server_protocols"."max_accounts" > 0)
);
--> statement-breakpoint
CREATE TABLE "server_statistics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accounts_total" integer,
	"accounts_by_protocol" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"online_users" integer,
	"bandwidth_rx_bytes" bigint,
	"bandwidth_tx_bytes" bigint
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hostname" text NOT NULL,
	"ip_address" text NOT NULL,
	"country" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"city" text,
	"region" text,
	"provider" text,
	"api_port" integer NOT NULL,
	"api_base_path" text DEFAULT '/api/v1' NOT NULL,
	"driver" text DEFAULT 'contract-v1' NOT NULL,
	"lifecycle" "server_lifecycle" DEFAULT 'draft' NOT NULL,
	"health_status" "server_health_status" DEFAULT 'unknown' NOT NULL,
	"status" "server_status" DEFAULT 'pending' NOT NULL,
	"compatibility" "server_compatibility" DEFAULT 'unknown' NOT NULL,
	"max_accounts" integer DEFAULT 100 NOT NULL,
	"current_accounts" integer DEFAULT 0 NOT NULL,
	"provisioning_version" text,
	"api_version" text,
	"reported_hostname" text,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unmapped_protocols" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"last_seen_at" timestamp with time zone,
	"last_successful_connection_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_health_check_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "servers_max_accounts_positive" CHECK ("servers"."max_accounts" > 0),
	CONSTRAINT "servers_current_accounts_non_negative" CHECK ("servers"."current_accounts" >= 0),
	CONSTRAINT "servers_api_port_range" CHECK ("servers"."api_port" between 1 and 65535)
);
--> statement-breakpoint
CREATE TABLE "vpn_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"protocol_id" uuid NOT NULL,
	"remote_account_id" text,
	"username" text,
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"duration_days" integer NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"client_ip_hash" text,
	"holds_capacity" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_fields" ADD CONSTRAINT "protocol_fields_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_account_id_vpn_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."vpn_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_requests" ADD CONSTRAINT "provisioning_requests_account_id_vpn_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."vpn_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_requests" ADD CONSTRAINT "provisioning_requests_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_requests" ADD CONSTRAINT "provisioning_requests_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_requests" ADD CONSTRAINT "provisioning_requests_requested_by_admin_id_admins_id_fk" FOREIGN KEY ("requested_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_credentials" ADD CONSTRAINT "server_credentials_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_credentials" ADD CONSTRAINT "server_credentials_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_health" ADD CONSTRAINT "server_health_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_protocols" ADD CONSTRAINT "server_protocols_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_protocols" ADD CONSTRAINT "server_protocols_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_statistics" ADD CONSTRAINT "server_statistics_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_accounts" ADD CONSTRAINT "vpn_accounts_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_accounts" ADD CONSTRAINT "vpn_accounts_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_accounts" ADD CONSTRAINT "vpn_accounts_revoked_by_admins_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_unique" ON "admins" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_admin_idx" ON "audit_logs" USING btree ("admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_fields_protocol_key_unique" ON "protocol_fields" USING btree ("protocol_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "protocols_slug_unique" ON "protocols" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "protocols_enabled_order_idx" ON "protocols" USING btree ("enabled","display_order");--> statement-breakpoint
CREATE INDEX "provisioning_logs_created_idx" ON "provisioning_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provisioning_logs_server_idx" ON "provisioning_logs" USING btree ("server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provisioning_logs_event_idx" ON "provisioning_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "provisioning_logs_level_idx" ON "provisioning_logs" USING btree ("level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_requests_idempotency_unique" ON "provisioning_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "provisioning_requests_state_idx" ON "provisioning_requests" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "provisioning_requests_account_idx" ON "provisioning_requests" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_credentials_active_unique" ON "server_credentials" USING btree ("server_id") WHERE "server_credentials"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "server_health_server_checked_idx" ON "server_health" USING btree ("server_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "server_protocols_server_protocol_unique" ON "server_protocols" USING btree ("server_id","protocol_id");--> statement-breakpoint
CREATE INDEX "server_protocols_publish_idx" ON "server_protocols" USING btree ("protocol_id","enabled","detected");--> statement-breakpoint
CREATE INDEX "server_statistics_server_captured_idx" ON "server_statistics" USING btree ("server_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "servers_name_unique" ON "servers" USING btree (lower("name")) WHERE "servers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "servers_status_idx" ON "servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "servers_lifecycle_idx" ON "servers" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "vpn_accounts_server_status_idx" ON "vpn_accounts" USING btree ("server_id","status");--> statement-breakpoint
CREATE INDEX "vpn_accounts_protocol_status_idx" ON "vpn_accounts" USING btree ("protocol_id","status");--> statement-breakpoint
CREATE INDEX "vpn_accounts_expires_idx" ON "vpn_accounts" USING btree ("expires_at") WHERE "vpn_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "vpn_accounts_username_idx" ON "vpn_accounts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "vpn_accounts_created_idx" ON "vpn_accounts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vpn_accounts_remote_idx" ON "vpn_accounts" USING btree ("server_id","remote_account_id");