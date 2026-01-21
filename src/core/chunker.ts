// src/core/chunker.ts

import { Chunk } from "../types/index.js";
import { config } from "../utils/config.js";

export const chunker = {
  chunk(text: string, sourceFile: string): Chunk[] {
    const { chunkSize, chunkOverlap, minChunkLength } = config.rag;
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    for (
      let start = 0;
      start < text.length;
      start += chunkSize - chunkOverlap
    ) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.slice(start, end).trim();

      // Pular chunks vazios ou muito pequenos
      if (chunkText.length < minChunkLength) {
        continue;
      }

      chunks.push({
        id: `${sourceFile}_chunk_${chunkIndex}`,
        text: chunkText,
        source_file: sourceFile,
        chunk_index: chunkIndex,
        char_start: start,
        char_end: end,
      });

      chunkIndex++;
    }

    return chunks;
  },
};
