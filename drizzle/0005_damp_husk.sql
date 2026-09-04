CREATE TABLE "document_sectors" (
	"document_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	CONSTRAINT "document_sectors_document_id_sector_id_pk" PRIMARY KEY("document_id","sector_id")
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sectors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_sectors" (
	"user_id" text NOT NULL,
	"sector_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sectors_user_id_sector_id_pk" PRIMARY KEY("user_id","sector_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sectors" ADD CONSTRAINT "document_sectors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sectors" ADD CONSTRAINT "document_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
INSERT INTO "sectors" ("id", "slug", "name") VALUES
	('00000000-0000-4000-8000-000000000001', 'financeiro', 'Financeiro'),
	('00000000-0000-4000-8000-000000000002', 'suporte', 'Suporte'),
	('00000000-0000-4000-8000-000000000003', 'implantacao', 'Implantação'),
	('00000000-0000-4000-8000-000000000004', 'comercial', 'Comercial')
ON CONFLICT ("slug") DO NOTHING;