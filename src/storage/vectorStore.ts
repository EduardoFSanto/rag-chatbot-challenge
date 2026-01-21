// src/storage/vectorStore.ts

import { StoredChunk, SearchResult } from "../types/index.js";

class VectorStore {
  private chunks: StoredChunk[] = [];

  addChunks(chunks: StoredChunk[]): string {
    const fileId = `upload_${Date.now()}`;
    this.chunks.push(...chunks);
    return fileId;
  }

  search(
    queryEmbedding: number[],
    k: number,
    threshold: number,
  ): SearchResult[] {
    // Calcular similaridade para todos os chunks
    const scored = this.chunks.map((chunk) => ({
      chunk,
      similarity_score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    // Filtrar por threshold e pegar top K
    return scored
      .filter((r) => r.similarity_score >= threshold)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, k);
  }

  isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  count(): number {
    return this.chunks.length;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    return normA && normB ? dotProduct / (normA * normB) : 0;
  }
}

// Singleton - uma única instância para toda a aplicação
export const vectorStore = new VectorStore();
