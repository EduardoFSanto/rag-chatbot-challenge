import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logger.js";

const client = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

export const COLLECTION_NAME =
  process.env.COLLECTION_NAME || "vrtech_knowledge";

class VectorStore {
  private isInitialized = false;

  private async initialize() {
    if (this.isInitialized) return;

    const collections = await client.getCollections();

    const exists = collections.collections.some(
      (collection: any) => collection.name === COLLECTION_NAME,
    );

    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 384,
          distance: "Cosine",
        },
      });
    }

    this.isInitialized = true;
  }

  async addChunks(
    chunks: any[],
    documentId: string,
    scope: {
      visibility: string;
      sectorIds: string[];
      sourceType?: string;
      sourceUrl?: string;
      externalId?: string;
    },
  ): Promise<string> {
    await this.initialize();

    const points = chunks.map((chunk) => {
      const pointId = uuidv4();

      return {
        id: pointId,
        vector: chunk.embedding,
        payload: {
          id: pointId,
          documentId,
          text: chunk.text,
          source_file: chunk.source_file,
          chunk_index: chunk.chunk_index,
          char_start: chunk.char_start,
          char_end: chunk.char_end,
          visibility: scope.visibility,
          sector_ids: scope.sectorIds,
          source_type: scope.sourceType,
          source_url: scope.sourceUrl,
          external_id: scope.externalId,
        },
      };
    });

    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });

    logger.info(
      `Stored ${points.length} chunks in Qdrant for document: ${documentId}`,
    );

    return documentId;
  }

  async search(
    queryEmbedding: number[],
    k: number,
    threshold: number,
    allowedDocumentIds?: string[],
  ): Promise<any[]> {
    await this.initialize();

    let filter = undefined;

    if (allowedDocumentIds && allowedDocumentIds.length > 0) {
      filter = {
        should: allowedDocumentIds.map((documentId) => ({
          key: "documentId",
          match: {
            value: documentId,
          },
        })),
      };
    }

    const results = await client.query(COLLECTION_NAME, {
      query: queryEmbedding,
      limit: k,
      score_threshold: threshold,
      with_payload: true,
      with_vector: true,
      filter,
    });

    const searchResults = results.points.map((result: any) => ({
      chunk: {
        id: result.payload?.id ?? String(result.id),
        text: result.payload?.text ?? "",
        source_file: result.payload?.source_file ?? "",
        chunk_index: result.payload?.chunk_index ?? 0,
        char_start: result.payload?.char_start ?? 0,
        char_end: result.payload?.char_end ?? 0,
        embedding: result.vector,
      },
      similarity_score: result.score,
    }));

    logger.info(
      `RAG retrieval completed: ${searchResults.length} results | threshold=${threshold} | k=${k}`,
    );

    searchResults.forEach((result, index) => {
      logger.info(
        `RAG result #${index + 1} | score=${result.similarity_score.toFixed(4)} | file=${result.chunk.source_file} | chunk=${result.chunk.chunk_index}`,
      );
    });

    return searchResults;
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.initialize();

    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: "documentId",
            match: {
              value: documentId,
            },
          },
        ],
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

    const response = await client.count(COLLECTION_NAME, {
      exact: true,
    });

    return response.count || 0;
  }
}

export const vectorStore = new VectorStore();