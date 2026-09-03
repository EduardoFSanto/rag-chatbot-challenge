// src/core/llm.ts

import Groq from "groq-sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";

const groq = new Groq({
  apiKey: config.groq.apiKey,
});

export const llmService = {
  async generate(prompt: string): Promise<string> {
    try {
      logger.debug("Calling Groq LLM...");

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        model: config.groq.model,
        temperature: config.rag.llmTemperature,
        max_tokens: 2048,
      });

      const text = chatCompletion.choices[0]?.message?.content;

      if (!text || text.trim().length === 0) {
        throw new Error("LLM returned empty response");
      }

      logger.debug("✅ Groq response received");
      return text.trim();
    } catch (error: any) {
      logger.error("Groq LLM error:", error.message);
      throw {
        code: "LLM_ERROR",
        message: `Failed to generate response: ${error.message || error}`,
        statusCode: 500,
      };
    }
  },
};
