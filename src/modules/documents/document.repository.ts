import { eq, and, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { documents } from "../../db/schema/documents.js";
import { documentSectors, userSectors } from "../../db/schema/sectors.js";
import type { DocumentStatus } from "../../db/schema/documents.js";

export const documentRepository = {
  async findById(id: string) {
    return db.query.documents.findFirst({
      where: eq(documents.id, id),
    });
  },

  async findByUserId(userId: string) {
    return db
      .selectDistinct({
        id: documents.id,
        filename: documents.filename,
        fileSize: documents.fileSize,
        status: documents.status,
        visibility: documents.visibility,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(documentSectors, eq(documentSectors.documentId, documents.id))
      .leftJoin(userSectors, and(eq(userSectors.sectorId, documentSectors.sectorId), eq(userSectors.userId, userId)))
      .where(or(eq(documents.userId, userId), eq(documents.visibility, "company"), eq(userSectors.userId, userId)))
      .orderBy(documents.createdAt);
  },

  async findAccessibleIds(userId: string) {
    const rows = await db
      .selectDistinct({ id: documents.id })
      .from(documents)
      .leftJoin(documentSectors, eq(documentSectors.documentId, documents.id))
      .leftJoin(userSectors, and(eq(userSectors.sectorId, documentSectors.sectorId), eq(userSectors.userId, userId)))
      .where(and(eq(documents.status, "processed"), or(eq(documents.userId, userId), eq(documents.visibility, "company"), eq(userSectors.userId, userId))));

    return rows.map((row) => row.id);
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