import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env,
} from "@huggingface/transformers";

import type { SearchResult } from "../types/index.js";

env.cacheDir = "./.cache";

const MODEL = "SugoLabs/mmarco-mMiniLMv2-L12-H384-v1";

const BATCH_SIZE = 4;
const MAX_LENGTH = 384;

let tokenizer:
  | Awaited<
      ReturnType<typeof AutoTokenizer.from_pretrained>
    >
  | null = null;

let model:
  | Awaited<
      ReturnType<
        typeof AutoModelForSequenceClassification.from_pretrained
      >
    >
  | null = null;

async function initializeReranker() {
  if (!tokenizer) {
    console.log(
      `Loading reranker tokenizer: ${MODEL}`,
    );

    tokenizer =
      await AutoTokenizer.from_pretrained(MODEL);
  }

  if (!model) {
    console.log(
      `Loading reranker model: ${MODEL}`,
    );

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

async function scoreBatch(
  question: string,
  results: SearchResult[],
  tokenizerInstance: NonNullable<
    typeof tokenizer
  >,
  modelInstance: NonNullable<
    typeof model
  >,
): Promise<number[]> {
  const passages = results.map(
    (result) => result.chunk.text,
  );

  if (passages.length === 0) {
    return [];
  }

  const questions = new Array(
    passages.length,
  ).fill(question);

  const inputs = tokenizerInstance(
    questions,
    {
      text_pair: passages,
      padding: true,
      truncation: true,
      max_length: MAX_LENGTH,
    },
  );

  const { logits } =
    await modelInstance(inputs);

  const scores = (await logits
    .sigmoid()
    .tolist()) as number[][];

  return scores.map((score) =>
    Number(score?.[0] ?? 0),
  );
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
      const {
        tokenizer: tokenizerInstance,
        model: modelInstance,
      } = await initializeReranker();

      if (!tokenizerInstance || !modelInstance) {
        throw new Error(
          "Reranker model failed to initialize",
        );
      }

      const scoredResults: Array<{
        result: SearchResult;
        score: number;
      }> = [];

      for (
        let start = 0;
        start < results.length;
        start += BATCH_SIZE
      ) {
        const batch = results.slice(
          start,
          start + BATCH_SIZE,
        );

        console.log(
          `Reranking candidates ${start + 1}-${Math.min(
            start + BATCH_SIZE,
            results.length,
          )} of ${results.length}...`,
        );

        const scores = await scoreBatch(
          question,
          batch,
          tokenizerInstance,
          modelInstance,
        );

        batch.forEach((result, index) => {
          scoredResults.push({
            result,
            score: scores[index] ?? 0,
          });
        });
      }

      return scoredResults
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