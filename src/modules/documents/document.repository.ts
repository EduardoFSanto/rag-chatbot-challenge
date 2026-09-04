import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { documents } from "../../db/schema/documents.js";
import type { DocumentStatus } from "../../db/schema/documents.js";

export const documentRepository = {
  async findById(id: string) {
    return db.query.documents.findFirst({
      where: eq(documents.id, id),
    });
  },

  async findByUserId(userId: string) {
    return db.query.documents.findMany({
      where: eq(documents.userId, userId),
      orderBy: (documents, { desc }) => [desc(documents.createdAt)],
      columns: {
        id: true,
        filename: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    });
  },

  async findByHash(fileHash: string) {
    return db.query.documents.findFirst({
      where: eq(documents.fileHash, fileHash),
    });
  },

  async updateStatus(id: string, status: DocumentStatus) {
    await db
      .update(documents)
      .set({ status })
      .where(eq(documents.id, id));
  },

  async markFailedProcessing() {
    return db
      .update(documents)
      .set({ status: "failed" })
      .where(eq(documents.status, "processing"))
      .returning({ id: documents.id });
  },
};