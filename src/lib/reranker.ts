import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env,
} from "@huggingface/transformers";

import type { SearchResult } from "../types/index.js";

env.cacheDir = "./.cache";

const MODEL = "SugoLabs/mmarco-mMiniLMv2-L12-H384-v1";

let tokenizer: Awaited<
  ReturnType<typeof AutoTokenizer.from_pretrained>
> | null = null;

let model: Awaited<
  ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>
> | null = null;

async function initializeReranker() {
  if (!tokenizer) {
    console.log(`Loading reranker tokenizer: ${MODEL}`);

    tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  }

  if (!model) {
    console.log(`Loading reranker model: ${MODEL}`);

    model =
      await AutoModelForSequenceClassification.from_pretrained(
        MODEL,
        {
          dtype: "q8",
          device: "cpu",
        },
      );
  }

  console.log("Reranker model loaded.");

  return {
    tokenizer,
    model,
  };
}

export const rerankerService = {
  async rerank(
    question: string,
    results: SearchResult[],
  ): Promise<SearchResult[]> {
    if (results.length === 0) {
      return [];
    }

    try {
      const { tokenizer, model } =
        await initializeReranker();

      const passages = results.map(
        (result) => result.chunk.text,
      );

      const inputs = tokenizer(
        new Array(passages.length).fill(question),
        {
          text_pair: passages,
          padding: true,
          truncation: true,
          max_length: 512,
        },
      );

      const { logits } = await model(inputs);

      const scores = (await logits
        .sigmoid()
        .tolist()) as number[][];

      return results
        .map((result, index) => ({
          result,
          score: Number(scores[index]?.[0] ?? 0),
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ result, score }) => ({
          ...result,
          similarity_score: score,
        }));
    } catch (error: any) {
      throw {
        code: "RERANKER_ERROR",
        message: `Failed to rerank results: ${
          error?.message || error
        }`,
        statusCode: 500,
      };
    }
  },
};