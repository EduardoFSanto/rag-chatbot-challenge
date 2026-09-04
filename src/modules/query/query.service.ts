import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { documents } from "../../db/schema/documents.js";
import { vectorStore } from "../../lib/storage/vectorStore.js";
import { embeddingService } from "../../lib/embeddings.js";
import { llmService } from "../../lib/llm.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";

interface ProcessQueryInput {
  question: string;
  conversationId?: string;
  userId: string;
}

type QueryResult =
  | {
      outcome: "success";
      conversationId: string;
      answer: string;
      sources: Array<{ file: string; score: number }>;
      confidence: number;
    }
  | {
      outcome: "no_context";
      conversationId: string;
    };

export const queryService = {
  async processQuery(input: ProcessQueryInput): Promise<QueryResult> {
    const { question, conversationId, userId } = input;

    // 1. Criar ou recuperar conversa
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      const [newConversation] = await db
        .insert(conversations)
        .values({
          userId,
          title: question.substring(0, 50),
        })
        .returning();
      currentConversationId = newConversation.id;
    } else {
      const ownedConversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, currentConversationId),
          eq(conversations.userId, userId),
        ),
      });

      if (!ownedConversation) {
        const error = new Error("Conversation not found or access denied") as Error & {
          code: string;
          statusCode: number;
        };
        error.code = "NOT_FOUND";
        error.statusCode = 404;
        throw error;
      }
    }

    // 2. Salvar mensagem do usuário
    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "user",
      content: question,
    });

    // 3. Buscar documentos do usuário (filtrar retrieval)
    const userDocuments = await db.query.documents.findMany({
      where: and(eq(documents.userId, userId), eq(documents.status, "processed")),
      columns: { id: true },
    });

    const allowedDocumentIds = userDocuments.map((doc) => doc.id);

    // 4. Se não há documentos, retornar sem contexto
    if (allowedDocumentIds.length === 0) {
      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: "Não encontrei informações suficientes na base de conhecimento.",
        metadata: { sources: [] },
      });

      return {
        outcome: "no_context",
        conversationId: currentConversationId,
      };
    }

    // 5. Gerar embedding da pergunta
    const queryEmbedding = await embeddingService.generate(question);

    // 6. Buscar chunks no Qdrant (filtrado por documentIds do usuário)
    const searchResults = await vectorStore.search(
      queryEmbedding,
      config.rag.retrievalK,
      config.rag.similarityThreshold,
      allowedDocumentIds
    );

    // 7. Verificar confiança (threshold)
    const maxScore = searchResults.length > 0 ? searchResults[0].similarity_score : 0;
    const confidenceThreshold = config.rag.similarityThreshold;

    if (maxScore < confidenceThreshold) {
      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: "Não encontrei informações suficientes na base de conhecimento.",
        metadata: { sources: [], maxScore },
      });

      return {
        outcome: "no_context",
        conversationId: currentConversationId,
      };
    }

    // 8. Montar contexto e chamar LLM
    const context = searchResults.map((r) => r.chunk.text).join("\n\n");
    const prompt = `Contexto:\n${context}\n\nPergunta: ${question}\n\nResposta:`;
    const aiResponseText = await llmService.generate(prompt);

    // 9. Salvar resposta da IA com metadados
    const sources = searchResults.map((r) => ({
      file: r.chunk.source_file,
      score: r.similarity_score,
    }));

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "assistant",
      content: aiResponseText,
      metadata: { sources, maxScore },
    });

    // 10. Atualizar timestamp da conversa
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, currentConversationId));

    logger.info(`Query processed for conversation ${currentConversationId}`);

    return {
      outcome: "success",
      conversationId: currentConversationId,
      answer: aiResponseText,
      sources,
      confidence: maxScore,
    };
  },
};