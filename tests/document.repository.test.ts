import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    query: {
      documents: {
        findFirst: vi.fn(),
      },
    },
    selectDistinct: vi.fn(),
    update: vi.fn(),
  },

  selectDistinctResult: {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  },

  updateResult: {
    set: vi.fn(),
  },

  updateWhereResult: {
    where: vi.fn(),
  },
}));

vi.mock("../src/db/index.js", () => ({
  db: mocks.db,
}));

import { documentRepository } from "../src/modules/documents/document.repository.js";

describe("documentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.db.selectDistinct.mockReturnValue(mocks.selectDistinctResult);

    mocks.selectDistinctResult.from.mockReturnValue(
      mocks.selectDistinctResult,
    );

    mocks.selectDistinctResult.leftJoin.mockReturnValue(
      mocks.selectDistinctResult,
    );

    mocks.selectDistinctResult.where.mockReturnValue(
      mocks.selectDistinctResult,
    );

    mocks.selectDistinctResult.orderBy.mockResolvedValue([]);

    mocks.db.update.mockReturnValue(mocks.updateResult);

    mocks.updateResult.set.mockReturnValue(mocks.updateWhereResult);

    mocks.updateWhereResult.where.mockResolvedValue(undefined);
  });

  it("deve buscar um documento pelo ID", async () => {
    const document = {
      id: "document-1",
      filename: "manual.pdf",
      userId: "user-1",
      status: "processed",
    };

    mocks.db.query.documents.findFirst.mockResolvedValue(document);

    const result = await documentRepository.findById("document-1");

    expect(result).toEqual(document);

    expect(mocks.db.query.documents.findFirst).toHaveBeenCalledTimes(1);
  });

  it("deve buscar um documento pelo hash", async () => {
    const document = {
      id: "document-1",
      fileHash: "hash-123",
      filename: "manual.pdf",
    };

    mocks.db.query.documents.findFirst.mockResolvedValue(document);

    const result = await documentRepository.findByHash("hash-123");

    expect(result).toEqual(document);

    expect(mocks.db.query.documents.findFirst).toHaveBeenCalledTimes(1);
  });

  it("deve retornar somente IDs de documentos processados e acessíveis", async () => {
    mocks.selectDistinctResult.where.mockResolvedValue([
      { id: "document-private-owner" },
      { id: "document-company" },
      { id: "document-sector" },
    ]);

    const result = await documentRepository.findAccessibleIds("user-1");

    expect(result).toEqual([
      "document-private-owner",
      "document-company",
      "document-sector",
    ]);

    expect(mocks.db.selectDistinct).toHaveBeenCalledTimes(1);
    expect(mocks.selectDistinctResult.from).toHaveBeenCalledTimes(1);
    expect(mocks.selectDistinctResult.leftJoin).toHaveBeenCalledTimes(2);
  });

  it("deve retornar um array vazio quando não existem documentos acessíveis", async () => {
    mocks.selectDistinctResult.where.mockResolvedValue([]);

    const result = await documentRepository.findAccessibleIds("user-1");

    expect(result).toEqual([]);
  });

  it("deve buscar os documentos acessíveis ao usuário", async () => {
    const documents = [
      {
        id: "document-1",
        filename: "manual.pdf",
        sourceType: "file",
        sourceUrl: null,
        externalId: null,
        durationSeconds: null,
        fileSize: 1000,
        status: "processed",
        visibility: "private",
        createdAt: new Date(),
      },
      {
        id: "document-2",
        filename: "video.mp4",
        sourceType: "youtube",
        sourceUrl: "https://youtube.com/watch?v=123",
        externalId: "123",
        durationSeconds: 300,
        fileSize: 0,
        status: "processed",
        visibility: "company",
        createdAt: new Date(),
      },
    ];

    mocks.selectDistinctResult.where.mockReturnValue(
      mocks.selectDistinctResult,
    );

    mocks.selectDistinctResult.orderBy.mockResolvedValue(documents);

    const result = await documentRepository.findByUserId("user-1");

    expect(result).toEqual(documents);

    expect(mocks.db.selectDistinct).toHaveBeenCalledTimes(1);
    expect(mocks.selectDistinctResult.from).toHaveBeenCalledTimes(1);
    expect(mocks.selectDistinctResult.leftJoin).toHaveBeenCalledTimes(2);
    expect(mocks.selectDistinctResult.where).toHaveBeenCalledTimes(1);
    expect(mocks.selectDistinctResult.orderBy).toHaveBeenCalledTimes(1);
  });

  it("deve atualizar o status de um documento", async () => {
    await documentRepository.updateStatus("document-1", "failed");

    expect(mocks.db.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateResult.set).toHaveBeenCalledWith({
      status: "failed",
    });
    expect(mocks.updateWhereResult.where).toHaveBeenCalledTimes(1);
  });

  it("deve marcar todos os documentos em processamento como failed", async () => {
    const failedDocuments = [
      { id: "document-1" },
      { id: "document-2" },
    ];

    mocks.updateWhereResult.where.mockReturnValue({
      returning: vi.fn().mockResolvedValue(failedDocuments),
    });

    const result = await documentRepository.markFailedProcessing();

    expect(result).toEqual(failedDocuments);

    expect(mocks.db.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateResult.set).toHaveBeenCalledWith({
      status: "failed",
    });
  });
});
