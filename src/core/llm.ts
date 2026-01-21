// src/core/llm.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../utils/config.js";

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

export const llmService = {
  async generate(prompt: string): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({
        model: config.gemini.llmModel,
        generationConfig: {
          temperature: config.rag.llmTemperature,
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error("LLM returned empty response");
      }

      return text.trim();
    } catch (error: any) {
      if (error.status === 429) {
        throw {
          code: "API_RATE_LIMITED",
          message: "Gemini API rate limited",
          statusCode: 429,
        };
      }

      if (error.status === 401 || error.status === 403) {
        throw {
          code: "INVALID_API_KEY",
          message: "Invalid Gemini API key",
          statusCode: 500,
        };
      }

      throw {
        code: "LLM_ERROR",
        message: `Failed to generate response: ${error.message}`,
        statusCode: 500,
      };
    }
  },
};
