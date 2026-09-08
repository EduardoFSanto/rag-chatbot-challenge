ALTER TABLE "documents" ADD COLUMN "source_type" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "language" text;