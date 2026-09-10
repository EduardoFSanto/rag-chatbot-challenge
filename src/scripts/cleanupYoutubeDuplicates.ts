import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { documents } from "../db/schema/documents.js";
import { documentSectors } from "../db/schema/sectors.js";
import { vectorStore } from "../lib/storage/vectorStore.js";
import { logger } from "../lib/logger.js";

type YoutubeDocument = {
  id: string;
  externalId: string;
  filename: string;
  fileHash: string;
  fileSize: number;
  status: string;
  createdAt: Date;
};

const EXECUTE = process.argv.includes("--execute");

async function findDuplicateYoutubeDocuments(): Promise<
  Array<{
    externalId: string;
    documents: YoutubeDocument[];
  }>
> {
  const duplicates = await db
    .select({
      externalId: documents.externalId,
      count: sql<number>`count(*)`,
    })
    .from(documents)
    .where(eq(documents.sourceType, "youtube"))
    .groupBy(documents.externalId)
    .having(sql`count(*) > 1`);

  const result: Array<{
    externalId: string;
    documents: YoutubeDocument[];
  }> = [];

  for (const duplicate of duplicates) {
    if (!duplicate.externalId) continue;

    const docs = await db.query.documents.findMany({
      where: and(
        eq(documents.sourceType, "youtube"),
        eq(documents.externalId, duplicate.externalId),
      ),
      columns: {
        id: true,
        externalId: true,
        filename: true,
        fileHash: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
      orderBy: [asc(documents.createdAt)],
    });

    result.push({
      externalId: duplicate.externalId,
      documents: docs as YoutubeDocument[],
    });
  }

  return result;
}

function printDryRun(
  duplicates: Array<{
    externalId: string;
    documents: YoutubeDocument[];
  }>,
) {
  console.log("\n========================================");
  console.log("YOUTUBE DUPLICATE CLEANUP - DRY RUN");
  console.log("========================================\n");

  if (duplicates.length === 0) {
    console.log("Nenhuma duplicata encontrada.\n");
    return;
  }

  console.log(`Duplicatas encontradas: ${duplicates.length}\n`);

  for (const duplicate of duplicates) {
    const [keep, ...remove] = duplicate.documents;

    console.log(`YouTube ID: ${duplicate.externalId}`);
    console.log("----------------------------------------");

    console.log("MANTER:");
    console.log(`  ID:         ${keep.id}`);
    console.log(`  Arquivo:    ${keep.filename}`);
    console.log(`  Tamanho:    ${keep.fileSize} bytes`);
    console.log(`  Status:     ${keep.status}`);
    console.log(`  Criado em:  ${keep.createdAt.toISOString()}`);
    console.log(`  Hash:       ${keep.fileHash}`);

    console.log("\nREMOVER:");

    for (const doc of remove) {
      console.log(`  ID:         ${doc.id}`);
      console.log(`  Arquivo:    ${doc.filename}`);
      console.log(`  Tamanho:    ${doc.fileSize} bytes`);
      console.log(`  Status:     ${doc.status}`);
      console.log(`  Criado em:  ${doc.createdAt.toISOString()}`);
      console.log(`  Hash:       ${doc.fileHash}`);
      console.log("");
    }

    console.log("========================================\n");
  }

  console.log("Nenhum dado foi alterado.");
  console.log("Para executar a limpeza:");
  console.log("npm run youtube:cleanup -- --execute\n");
}

async function deleteDocument(documentId: string) {
  await vectorStore.deleteByDocumentId(documentId);

  await db
    .delete(documentSectors)
    .where(eq(documentSectors.documentId, documentId));

  await db
    .delete(documents)
    .where(eq(documents.id, documentId));
}

async function executeCleanup(
  duplicates: Array<{
    externalId: string;
    documents: YoutubeDocument[];
  }>,
) {
  console.log("\n========================================");
  console.log("YOUTUBE DUPLICATE CLEANUP - EXECUTE");
  console.log("========================================\n");

  if (duplicates.length === 0) {
    console.log("Nenhuma duplicata encontrada.\n");
    return;
  }

  let removed = 0;

  for (const duplicate of duplicates) {
    const [keep, ...remove] = duplicate.documents;

    console.log(`YouTube ID: ${duplicate.externalId}`);
    console.log(`Mantendo: ${keep.id}`);

    for (const doc of remove) {
      console.log(`Removendo: ${doc.id}`);

      try {
        await deleteDocument(doc.id);

        removed++;

        console.log(`OK: ${doc.id} removido.`);
      } catch (error) {
        logger.error(
          `Failed to remove duplicate document ${doc.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        throw error;
      }
    }
  }

  console.log("\n========================================");
  console.log("LIMPEZA CONCLUÍDA");
  console.log("========================================");
  console.log(`Duplicatas removidas: ${removed}`);
  console.log("");
}

async function main() {
  logger.info(
    EXECUTE
      ? "Running YouTube duplicate cleanup in EXECUTE mode"
      : "Running YouTube duplicate cleanup in DRY RUN mode",
  );

  const duplicates = await findDuplicateYoutubeDocuments();

  if (!EXECUTE) {
    printDryRun(duplicates);
    return;
  }

  await executeCleanup(duplicates);

  const remainingDuplicates = await findDuplicateYoutubeDocuments();

  console.log("Verificação final:");

  if (remainingDuplicates.length === 0) {
    console.log("OK: nenhuma duplicata de YouTube permanece.\n");
  } else {
    console.log(
      `ATENÇÃO: ainda existem ${remainingDuplicates.length} externalId(s) duplicados.\n`,
    );

    for (const duplicate of remainingDuplicates) {
      console.log(
        `  ${duplicate.externalId}: ${duplicate.documents.length} documentos`,
      );
    }
  }
}

main().catch((error) => {
  logger.error(
    error instanceof Error
      ? error.stack || error.message
      : String(error),
  );

  process.exitCode = 1;
});
