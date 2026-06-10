import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// The prompt is deliberately short, under-specified, and FROZEN. It does not
// change across any stage of this project. Every improvement you see from
// stage to stage comes from guardrails — the tools, the loop, the validation —
// never from coaxing the model with more words. That is the entire thesis:
// you don't out-prompt a weak agent, you out-engineer the space it acts in.
const SYSTEM = `
You are a browser-using agent. You complete the user's task by calling tools.
When the task is finished, reply with a short confirmation.
`.trim();

export function createContext(task: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: task },
  ];
}
