import Groq from "groq-sdk";
import OpenAI from "openai";
import { config } from "./config.js";
import { logger } from "./logger.js";

const groq =
  config.llm.provider === "groq"
    ? new Groq({
        apiKey: config.llm.groq.apiKey,
      })
    : null;

const openai =
  config.llm.provider === "openai"
    ? new OpenAI({
        apiKey: config.llm.openai.apiKey,
        maxRetries: 2,
        timeout: 60_000,
      })
    : null;

export const llmService = {
  async generate(prompt: string): Promise<string> {
    try {
      logger.debug(
        `Calling ${config.llm.provider} LLM (${config.llm.provider === "groq" ? config.llm.groq.model : config.llm.openai.model})...`,
      );

      if (config.llm.provider === "openai") {
        if (!openai) {
          throw new Error("OpenAI client is not initialized");
        }

        const response = await openai.responses.create({
          model: config.llm.openai.model,
          input: prompt,
          max_output_tokens: config.llm.maxOutputTokens,
        });

        const text = response.output_text?.trim();

        if (!text) {
          throw new Error("OpenAI returned an empty response");
        }

        logger.debug("OpenAI response received");
        return text;
      }

      if (!groq) {
        throw new Error("Groq client is not initialized");
      }

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        model: config.llm.groq.model,
        temperature: config.rag.llmTemperature,
        max_tokens: config.llm.maxOutputTokens,
      });

      const text = chatCompletion.choices[0]?.message?.content?.trim();

      if (!text) {
        throw new Error("Groq returned an empty response");
      }

      logger.debug("Groq response received");
      return text;
    } catch (error: any) {
      logger.error(`${config.llm.provider} LLM error:`, error?.message || error);

      throw {
        code: "LLM_ERROR",
        message: `Failed to generate response: ${error?.message || error}`,
        statusCode: 502,
      };
    }
  },
};
