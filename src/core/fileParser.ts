// src/core/fileParser.ts

import pdfParse from "pdf-parse";

type Parser = (buffer: Buffer) => Promise<string>;

const parsers: Record<string, Parser> = {
  "application/pdf": async (buffer: Buffer): Promise<string> => {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(
        `Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },

  "text/plain": async (buffer: Buffer): Promise<string> => {
    return buffer.toString("utf-8");
  },
};

export const fileParser = {
  async extract(buffer: Buffer, mimeType: string): Promise<string> {
    const parser = parsers[mimeType];

    if (!parser) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    const text = await parser(buffer);

    if (!text || text.trim().length === 0) {
      throw new Error("Extracted text is empty");
    }

    return text.trim();
  },
};
