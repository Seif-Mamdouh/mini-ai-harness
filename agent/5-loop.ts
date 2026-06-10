import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { client } from "./2-model.js";
import type { ToolRegistry } from "./1-tools.js";

// A single tool call + its result, captured for the trace
export type ToolEvent = {
  tool: string;
  args: Record<string, unknown>;
  result: string;
};

// One loop iteration: the model either called tools or gave a final answer
export type LoopIteration = {
  index: number;
  outcome: "tool_calls" | "answer";
  toolEvents: ToolEvent[]; // empty if outcome is "answer"
  contextSize: number; // how many messages were in context for this call
};

export type LoopResult = {
  answer: string;
  iterations: number;
  trace: LoopIteration[];
  stoppedBy: "model" | "guardrail" | "success";
};

// STAGE 1 — no guardrails.
// The loop runs until the model itself decides to stop talking. There is no
// iteration cap, no context trimming, and crucially NO check that the task was
// actually accomplished. Whatever the model says at the end, we believe. So
// when it announces "I've upvoted the top story" — having clicked nothing real
// — we faithfully report that lie as the result.
export async function runLoop(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ToolRegistry,
): Promise<LoopResult> {
  const trace: LoopIteration[] = [];

  while (true) {
    const iterationIndex = trace.length + 1;

    // ── Model call ────────────────────────────
    process.stdout.write(`[iter ${iterationIndex}] calling model... `);
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: tools.definitions,
    });

    const choice = response.choices[0];
    const contextSize = messages.length;
    console.log(`${choice.finish_reason}`);

    messages.push(choice.message as ChatCompletionMessageParam);

    // ── Final answer ──────────────────────────
    if (choice.finish_reason === "stop") {
      trace.push({ index: iterationIndex, outcome: "answer", toolEvents: [], contextSize });
      return {
        answer: choice.message.content ?? "(no response)",
        iterations: trace.length,
        trace,
        stoppedBy: "model",
      };
    }

    // ── Tool calls → execute → loop ───────────
    if (choice.finish_reason === "tool_calls") {
      const toolEvents: ToolEvent[] = [];

      for (const call of choice.message.tool_calls ?? []) {
        const name = call.function.name;
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

        const tool = tools.byName.get(name);
        process.stdout.write(`→ ${name}(${JSON.stringify(args)}) ... `);
        let result: string;
        try {
          result = tool ? await tool.execute(args) : `Unknown tool: "${name}"`;
          console.log(`done`);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          console.log(`error`);
        }
        // Show the audience exactly what the agent read back - not just "done".
        console.log(result.slice(0, 1500).replace(/^/gm, "             | "));
        if (result.length > 1500) console.log("             ... (+" + (result.length - 1500) + " more chars)");

        toolEvents.push({ tool: name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }

      trace.push({ index: iterationIndex, outcome: "tool_calls", toolEvents, contextSize });
    }
  }
}
