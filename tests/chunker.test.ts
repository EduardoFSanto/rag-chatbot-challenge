import { describe, expect, it } from "vitest";
import { chunker } from "../src/lib/chunker.js";

describe("chunker", () => {
  it("deve retornar um array vazio para texto menor que o mínimo", () => {
    const text = "a".repeat(49);

    const result = chunker.chunk(text, "teste.txt");

    expect(result).toEqual([]);
  });

  it("deve criar um chunk para texto com tamanho suficiente", () => {
    const text = "a".repeat(100);

    const result = chunker.chunk(text, "teste.txt");

    expect(result).toHaveLength(1);
    expect(result[0].text).toHaveLength(100);
  });

  it("deve preservar os metadados do chunk", () => {
    const text = "a".repeat(100);

    const result = chunker.chunk(text, "documento.pdf");

    expect(result[0]).toMatchObject({
      id: "documento.pdf_chunk_0",
      source_file: "documento.pdf",
      chunk_index: 0,
      char_start: 0,
      char_end: 100,
    });
  });

  it("deve criar múltiplos chunks para textos grandes", () => {
    const text = "a".repeat(4000);

    const result = chunker.chunk(text, "teste.txt");

    expect(result.length).toBeGreaterThan(1);
  });

  it("deve aplicar o overlap entre os chunks", () => {
    const text = "a".repeat(3000);

    const result = chunker.chunk(text, "teste.txt");

    expect(result).toHaveLength(2);

    expect(result[0].char_start).toBe(0);
    expect(result[0].char_end).toBe(2000);

    expect(result[1].char_start).toBe(1500);
    expect(result[1].char_end).toBe(3000);
  });
});