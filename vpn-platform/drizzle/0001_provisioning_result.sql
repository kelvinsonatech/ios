ALTER TABLE "provisioning_requests" ADD COLUMN "result_encrypted" text;--> statement-breakpoint
ALTER TABLE "provisioning_requests" ADD COLUMN "result_expires_at" timestamp with time zone;