import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    query: {
      documents: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },

  fileParser: {
    extract: vi.fn(),
  },

  chunker: {
    chunk: vi.fn(),
  },

  embeddingService: {
    generate: vi.fn(),
  },

  vectorStore: {
    addChunks: vi.fn(),
    deleteByDocumentId: vi.fn(),
  },

  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/db/index.js", () => ({
  db: mocks.db,
}));

vi.mock("../src/lib/fileParser.js", () => ({
  fileParser: mocks.fileParser,
}));

vi.mock("../src/lib/chunker.js", () => ({
  chunker: mocks.chunker,
}));

vi.mock("../src/lib/embeddings.js", () => ({
  embeddingService: mocks.embeddingService,
}));

vi.mock("../src/lib/storage/vectorStore.js", () => ({
  vectorStore: mocks.vectorStore,
  COLLECTION_NAME: "vrtech_knowledge",
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: mocks.logger,
}));

import { ingestDocument } from "../src/lib/ingestion.js";

function createInsertMock(documentId = "document-1") {
  const returning = vi.fn().mockResolvedValue([
    {
      id: documentId,
    },
  ]);

  const values = vi.fn().mockReturnValue({
    returning,
  });

  mocks.db.insert.mockReturnValue({
    values,
  });
}

function createUpdateMock() {
  mocks.db.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

const baseInput = {
  buffer: Buffer.from("conteúdo do documento"),
  filename: "manual.txt",
  mimeType: "text/plain",
  fileSize: 22,
  userId: "user-1",
};

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.db.query.documents.findFirst.mockResolvedValue(undefined);

    createInsertMock();
    createUpdateMock();

    mocks.fileParser.extract.mockResolvedValue(
      "Texto extraído do documento",
    );

    mocks.chunker.chunk.mockReturnValue([
      {
        id: "manual.txt_chunk_0",
        text: "Texto extraído do documento",
        source_file: "manual.txt",
        chunk_index: 0,
        char_start: 0,
        char_end: 28,
      },
    ]);

    mocks.embeddingService.generate.mockResolvedValue([
      0.1,
      0.2,
      0.3,
    ]);

    mocks.vectorStore.addChunks.mockResolvedValue("document-1");
    mocks.vectorStore.deleteByDocumentId.mockResolvedValue(undefined);
  });

  it("deve processar um documento novo com sucesso", async () => {
    const result = await ingestDocument(baseInput);

    expect(result).toEqual({
      outcome: "processed",
      documentId: "document-1",
      numChunks: 1,
      totalChars: 27,
    });

    expect(mocks.db.insert).toHaveBeenCalled();
    expect(mocks.fileParser.extract).toHaveBeenCalledWith(
      baseInput.buffer,
      baseInput.mimeType,
    );
    expect(mocks.chunker.chunk).toHaveBeenCalledWith(
      "Texto extraído do documento",
      "manual.txt",
    );
    expect(mocks.embeddingService.generate).toHaveBeenCalledWith(
      "Texto extraído do documento",
    );
    expect(mocks.vectorStore.addChunks).toHaveBeenCalledTimes(1);
    expect(mocks.vectorStore.deleteByDocumentId).not.toHaveBeenCalled();
  });

  it("deve retornar duplicate quando o documento já existe e está processado", async () => {
    mocks.db.query.documents.findFirst.mockResolvedValue({
      id: "document-existing",
      userId: "user-1",
      status: "processed",
    });

    const result = await ingestDocument(baseInput);

    expect(result).toEqual({
      outcome: "duplicate",
      documentId: "document-existing",
    });

    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.fileParser.extract).not.toHaveBeenCalled();
    expect(mocks.embeddingService.generate).not.toHaveBeenCalled();
    expect(mocks.vectorStore.addChunks).not.toHaveBeenCalled();
  });

  it("deve rejeitar duplicado pertencente a outro usuário", async () => {
    mocks.db.query.documents.findFirst.mockResolvedValue({
      id: "document-existing",
      userId: "user-2",
      status: "processed",
    });

    const result = await ingestDocument(baseInput);

    expect(result).toEqual({
      outcome: "duplicate",
      documentId: "document-existing",
    });

    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.fileParser.extract).not.toHaveBeenCalled();
    expect(mocks.vectorStore.addChunks).not.toHaveBeenCalled();
  });

  it("deve reutilizar o mesmo documento quando estiver em failed", async () => {
    mocks.db.query.documents.findFirst.mockResolvedValue({
      id: "document-failed",
      userId: "user-1",
      status: "failed",
    });

    const result = await ingestDocument(baseInput);

    expect(result).toEqual({
      outcome: "processed",
      documentId: "document-failed",
      numChunks: 1,
      totalChars: 27,
    });

    expect(mocks.db.insert).not.toHaveBeenCalled();

    expect(mocks.vectorStore.deleteByDocumentId).toHaveBeenCalledWith(
      "document-failed",
    );

    expect(mocks.vectorStore.addChunks).toHaveBeenCalledWith(
      expect.any(Array),
      "document-failed",
      expect.any(Object),
    );
  });

  it("deve gerar um embedding para cada chunk", async () => {
    mocks.chunker.chunk.mockReturnValue([
      {
        id: "chunk-0",
        text: "Primeiro chunk",
        source_file: "manual.txt",
        chunk_index: 0,
        char_start: 0,
        char_end: 14,
      },
      {
        id: "chunk-1",
        text: "Segundo chunk",
        source_file: "manual.txt",
        chunk_index: 1,
        char_start: 15,
        char_end: 29,
      },
    ]);

    mocks.embeddingService.generate
      .mockResolvedValueOnce([0.1, 0.2])
      .mockResolvedValueOnce([0.3, 0.4]);

    const result = await ingestDocument(baseInput);

    expect(result.outcome).toBe("processed");

    expect(mocks.embeddingService.generate).toHaveBeenCalledTimes(2);
    expect(mocks.embeddingService.generate).toHaveBeenNthCalledWith(
      1,
      "Primeiro chunk",
    );
    expect(mocks.embeddingService.generate).toHaveBeenNthCalledWith(
      2,
      "Segundo chunk",
    );

    expect(mocks.vectorStore.addChunks).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          text: "Primeiro chunk",
          embedding: [0.1, 0.2],
        }),
        expect.objectContaining({
          text: "Segundo chunk",
          embedding: [0.3, 0.4],
        }),
      ],
      "document-1",
      expect.any(Object),
    );
  });

  it("deve limpar o Qdrant e marcar como failed quando o processamento falhar", async () => {
    mocks.embeddingService.generate.mockRejectedValue(
      new Error("Falha ao gerar embedding"),
    );

    await expect(ingestDocument(baseInput)).rejects.toThrow(
      "Falha ao gerar embedding",
    );

    expect(mocks.vectorStore.deleteByDocumentId).toHaveBeenCalledWith(
      "document-1",
    );

    expect(mocks.db.update).toHaveBeenCalled();

    expect(mocks.vectorStore.addChunks).not.toHaveBeenCalled();
  });
});