import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    insert: vi.fn(),
    query: {
      conversations: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },

  vectorStore: {
    search: vi.fn(),
  },

  embeddingService: {
    generate: vi.fn(),
  },

  llmService: {
    generate: vi.fn(),
  },

  documentRepository: {
    findAccessibleIds: vi.fn(),
  },

  logger: {
    info: vi.fn(),
  },
}));

vi.mock("../src/db/index.js", () => ({
  db: mocks.db,
}));

vi.mock("../src/lib/storage/vectorStore.js", () => ({
  vectorStore: mocks.vectorStore,
}));

vi.mock("../src/lib/embeddings.js", () => ({
  embeddingService: mocks.embeddingService,
}));

vi.mock("../src/lib/llm.js", () => ({
  llmService: mocks.llmService,
}));

vi.mock("../src/modules/documents/document.repository.js", () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: mocks.logger,
}));

import { queryService } from "../src/modules/query/query.service.js";

function createInsertMock() {
  const returning = vi.fn().mockResolvedValue([{ id: "conversation-1" }]);

  mocks.db.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning,
    }),
  });
}

describe("queryService.processQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createInsertMock();

    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    mocks.documentRepository.findAccessibleIds.mockResolvedValue([]);

    mocks.embeddingService.generate.mockResolvedValue([0.1, 0.2, 0.3]);

    mocks.vectorStore.search.mockResolvedValue([]);

    mocks.llmService.generate.mockResolvedValue("Resposta da IA");
  });

  it("deve rejeitar uma conversa pertencente a outro usuário", async () => {
    mocks.db.query.conversations.findFirst.mockResolvedValue(undefined);

    await expect(
      queryService.processQuery({
        question: "Qual é o procedimento?",
        conversationId: "conversation-1",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });

    expect(
      mocks.db.query.conversations.findFirst,
    ).toHaveBeenCalledTimes(1);

    expect(mocks.llmService.generate).not.toHaveBeenCalled();
  });

  it("deve retornar no_context quando o usuário não possui documentos acessíveis", async () => {
    mocks.db.query.conversations.findFirst.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
    });

    mocks.documentRepository.findAccessibleIds.mockResolvedValue([]);

    const result = await queryService.processQuery({
      question: "Como faço uma entrada?",
      conversationId: "conversation-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      outcome: "no_context",
      conversationId: "conversation-1",
    });

    expect(mocks.embeddingService.generate).not.toHaveBeenCalled();
    expect(mocks.vectorStore.search).not.toHaveBeenCalled();
    expect(mocks.llmService.generate).not.toHaveBeenCalled();
  });

  it("deve retornar no_context quando o resultado fica abaixo do threshold", async () => {
    mocks.db.query.conversations.findFirst.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
    });

    mocks.documentRepository.findAccessibleIds.mockResolvedValue([
      "document-1",
    ]);

    mocks.vectorStore.search.mockResolvedValue([
      {
        chunk: {
          text: "Informação irrelevante",
          source_file: "manual.txt",
          chunk_index: 0,
          char_start: 0,
          char_end: 20,
        },
        similarity_score: 0.2,
      },
    ]);

    const result = await queryService.processQuery({
      question: "Como faço uma entrada?",
      conversationId: "conversation-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      outcome: "no_context",
      conversationId: "conversation-1",
    });

    expect(mocks.embeddingService.generate).toHaveBeenCalledWith(
      "Como faço uma entrada?",
    );

    expect(mocks.vectorStore.search).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      30,
      0.3,
      ["document-1"],
    );

    expect(mocks.llmService.generate).not.toHaveBeenCalled();
  });

  it("deve gerar resposta e retornar as fontes quando encontra contexto suficiente", async () => {
    mocks.db.query.conversations.findFirst.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
    });

    mocks.documentRepository.findAccessibleIds.mockResolvedValue([
      "document-1",
      "document-2",
    ]);

    mocks.vectorStore.search.mockResolvedValue([
      {
        chunk: {
          text: "Para realizar uma entrada, acesse a tela de entrada.",
          source_file: "manual-entrada.pdf",
          chunk_index: 2,
          char_start: 100,
          char_end: 160,
        },
        similarity_score: 0.87,
      },
    ]);

    mocks.llmService.generate.mockResolvedValue(
      "Para realizar uma entrada, acesse a tela de entrada.",
    );

    const result = await queryService.processQuery({
      question: "Como faço uma entrada?",
      conversationId: "conversation-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      outcome: "success",
      conversationId: "conversation-1",
      answer: "Para realizar uma entrada, acesse a tela de entrada.",
      sources: [
        {
          file: "manual-entrada.pdf",
          score: 0.87,
        },
      ],
      confidence: 0.87,
    });

    expect(
      mocks.documentRepository.findAccessibleIds,
    ).toHaveBeenCalledWith("user-1");

    expect(mocks.vectorStore.search).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      30,
      0.3,
      ["document-1", "document-2"],
    );

    expect(mocks.llmService.generate).toHaveBeenCalledWith(
      expect.stringContaining("Para realizar uma entrada"),
    );
  });
});