ALTER TABLE "documents" ADD COLUMN "file_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status" text DEFAULT 'processed' NOT NULL;