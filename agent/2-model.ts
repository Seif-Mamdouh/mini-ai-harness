import OpenAI from "openai";
import "dotenv/config";

// Works with either provider. Set OPENAI_API_KEY to talk to OpenAI directly,
// or OPENROUTER_API_KEY to go through OpenRouter (one key, many models).
// If both are set, OpenAI wins.
const useOpenAI = !!process.env.OPENAI_API_KEY;

export const client = new OpenAI(
  useOpenAI
    ? { apiKey: process.env.OPENAI_API_KEY }
    : { baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY },
);

// Intentionally weak by default. The point of this project is that we do NOT
// fix a struggling agent by upgrading the model or polishing the prompt — we
// fix it by tightening the guardrails around it. Override with MODEL in .env.
//
// Note the model id differs by provider:
//   OpenAI:     gpt-3.5-turbo            (the old -0613 snapshot has been retired)
//   OpenRouter: openai/gpt-3.5-turbo-0613
export const MODEL =
  process.env.MODEL ?? (useOpenAI ? "gpt-3.5-turbo" : "openai/gpt-3.5-turbo-0613");
