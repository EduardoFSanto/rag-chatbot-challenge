ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_hash_unique" UNIQUE("file_hash");