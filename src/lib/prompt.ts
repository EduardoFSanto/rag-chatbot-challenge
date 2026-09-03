// src/core/prompt.ts

import { SearchResult } from "../types/index.js";

export const promptService = {
  build(question: string, retrievedChunks: SearchResult[]): string {
    // Formatar chunks como contexto
    const contextParts = retrievedChunks.map((result, index) => {
      return `[Document: ${result.chunk.source_file}, Chunk ${result.chunk.chunk_index}]\n${result.chunk.text}`;
    });

    const context = contextParts.join("\n\n---\n\n");

    // Construir o prompt completo
    const prompt = `You are a helpful assistant that answers questions based on provided context.

IMPORTANT INSTRUCTIONS:
- Only answer based on the context provided below
- If the answer is not in the context, say "I don't have enough information to answer this question"
- Always cite your sources using the format: [Document: filename, Chunk N]
- Be concise and accurate

---
CONTEXT:
${context}

---
QUESTION: ${question}

---
ANSWER:`;

    return prompt;
  },
}; // <-- Certifique-se que tem esse };
