import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

const client = new QdrantClient({ url: process.env.QDRANT_URL || "http://localhost:6333" });
const COLLECTION_NAME = process.env.COLLECTION_NAME || "vrtech_knowledge";

class VectorStore {
  private isInitialized = false;

  private async initialize() {
    if (this.isInitialized) return;
    const collections = await client.getCollections();
    const exists = collections.collections.some((c: any) => c.name === COLLECTION_NAME);
    if (!exists) {
      await client.createCollection(COLLECTION_NAME, { vectors: { size: 384, distance: "Cosine" } });
    }
    this.isInitialized = true;
  }

  async addChunks(chunks: any[], documentId: string): Promise<string> {
    await this.initialize();
    
    const points = chunks.map((chunk) => ({
      id: uuidv4(),
      vector: chunk.embedding,
      payload: {
        documentId: documentId,
        text: chunk.text,
        source_file: chunk.source_file,
        chunk_index: chunk.chunk_index,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
      },
    }));

    await client.upsert(COLLECTION_NAME, { wait: true, points });
    logger.info(`Stored ${points.length} chunks in Qdrant for document: ${documentId}`);
    return documentId;
  }

  async search(queryEmbedding: number[], k: number, threshold: number, allowedDocumentIds?: string[]): Promise<any[]> {
    await this.initialize();

    // Construir filtro se houver document IDs permitidos
    let filter = undefined;
    if (allowedDocumentIds && allowedDocumentIds.length > 0) {
      filter = {
        should: allowedDocumentIds.map((docId) => ({
          key: "documentId",
          match: { value: docId },
        })),
      };
    }

    const results = await client.query(COLLECTION_NAME, {
      query: queryEmbedding,
      limit: k,
      score_threshold: threshold,
      with_payload: true,
      with_vector: true,
      filter: filter,
    });

    return results.points.map((r: any) => ({
      chunk: {
        id: r.payload.id,
        text: r.payload.text,
        source_file: r.payload.source_file,
        chunk_index: r.payload.chunk_index,
        char_start: r.payload.char_start,
        char_end: r.payload.char_end,
        embedding: r.vector,
      },
      similarity_score: r.score,
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.initialize();
    
    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [{ key: "documentId", match: { value: documentId } }],
      },
    });
    
    logger.info(`Deleted all chunks for document: ${documentId}`);
  }

  async isEmpty(): Promise<boolean> {
    await this.initialize();
    return (await this.count()) === 0;
  }

  async count(): Promise<number> {
    await this.initialize();
    const response = await client.count(COLLECTION_NAME, { exact: true });
    return response.count || 0;
  }
}

export const vectorStore = new VectorStore();