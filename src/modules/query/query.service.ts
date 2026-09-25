import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { hybridSearchService } from "../../lib/search/hybridSearch.js";
import { rerankerService } from "../../lib/reranker.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { promptService } from "../../lib/prompt.js";
import { llmService } from "../../lib/llm.js";
import { documentRepository } from "../documents/document.repository.js";

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

const NO_CONTEXT_MESSAGE =
  "Não encontrei informações suficientes na base de conhecimento.";

export const queryService = {
  async processQuery(input: ProcessQueryInput): Promise<QueryResult> {
    const { question, conversationId, userId } = input;

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
        const error = new Error(
          "Conversation not found or access denied",
        ) as Error & {
          code: string;
          statusCode: number;
        };

        error.code = "NOT_FOUND";
        error.statusCode = 404;

        throw error;
      }
    }

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "user",
      content: question,
    });

    const allowedDocumentIds =
      await documentRepository.findAccessibleIds(userId);

    if (allowedDocumentIds.length === 0) {
      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: NO_CONTEXT_MESSAGE,
        metadata: { sources: [] },
      });

      return {
        outcome: "no_context",
        conversationId: currentConversationId,
      };
    }

    const hybridResults = await hybridSearchService.search(
      question,
      config.rag.retrievalK,
      allowedDocumentIds,
    );

    if (hybridResults.length === 0) {
      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: NO_CONTEXT_MESSAGE,
        metadata: { sources: [] },
      });

      return {
        outcome: "no_context",
        conversationId: currentConversationId,
      };
    }

    // Hybrid is responsible for coverage. The reranker is responsible
    // only for ordering the candidate set before the LLM sees it.
    const rerankedResults = await rerankerService.rerank(
      question,
      hybridResults,
    );

    const finalResults = rerankedResults.slice(
      0,
      config.rag.finalK,
    );

    // Guardrail: require at least one strong retrieval signal in the
    // final evidence. Dense and lexical scores are intentionally not
    // combined because they live on different scales.
    const hasSufficientEvidence = finalResults.some((result) => {
      const denseScore = result.dense_score ?? 0;
      const lexicalScore = result.lexical_score ?? 0;

      return (
        denseScore >= config.rag.similarityThreshold ||
        lexicalScore >= config.rag.lexicalEvidenceThreshold
      );
    });

    if (!hasSufficientEvidence) {
      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: NO_CONTEXT_MESSAGE,
        metadata: {
          sources: [],
          retrievalCandidates: hybridResults.length,
        },
      });

      return {
        outcome: "no_context",
        conversationId: currentConversationId,
      };
    }

    const prompt = promptService.build(question, finalResults);
    const aiResponseText = await import("../../lib/llm.js").then(
      ({ llmService }) => llmService.generate(prompt),
    );

    const maxRerankerScore =
      finalResults[0]?.similarity_score ?? 0;

    const sources = finalResults.map((result) => ({
      file: result.chunk.source_file,
      score: result.similarity_score,
    }));

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "assistant",
      content: aiResponseText,
      metadata: {
        sources,
        maxScore: maxRerankerScore,
        retrieval: {
          candidates: hybridResults.length,
          reranked: rerankedResults.length,
          finalK: finalResults.length,
        },
      },
    });

    await db
      .update(conversations)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, currentConversationId));

    logger.info(
      `Query processed for conversation ${currentConversationId}: candidates=${hybridResults.length}, final=${finalResults.length}`,
    );

    return {
      outcome: "success",
      conversationId: currentConversationId,
      answer: aiResponseText,
      sources,
      confidence: maxRerankerScore,
    };
  },
};
