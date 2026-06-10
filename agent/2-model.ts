import OpenAI from "openai";
import "dotenv/config";

const useOpenAI = !!process.env.OPENAI_API_KEY;

export const client = new OpenAI(
  useOpenAI
    ? { apiKey: process.env.OPENAI_API_KEY }
    : { baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY },
);

export const MODEL =
  process.env.MODEL ?? (useOpenAI ? "gpt-3.5-turbo" : "openai/gpt-3.5-turbo-0613");
