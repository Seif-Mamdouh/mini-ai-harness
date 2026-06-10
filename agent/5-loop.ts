import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { client } from "./2-model.js";
import type { ToolRegistry } from "./1-tools.js";
import type { Guardrails } from "./4-guardrails.js";

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
  // Did the harness independently VERIFY the task was done? (vs. the model
  // merely claiming it). Undefined when there are no verifying guardrails.
  verified?: boolean;
};

// STAGE 4 — the loop stops trusting the model's word.
// Before each tool call it consults the guardrail (stage 3). After each call it
// asks the guardrail to verify ground truth. The moment a real, verified upvote
// is detected the loop ends with stoppedBy:"success" — regardless of what the
// model is saying. And if the model declares it's "done" without the harness
// having verified anything, we DON'T accept that as success: verified stays
// false. The lie no longer survives.
export async function runLoop(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ToolRegistry,
  guardrails?: Guardrails,
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
      // The model says it's finished. Believe it only if the harness verified it.
      return {
        answer: choice.message.content ?? "(no response)",
        iterations: trace.length,
        trace,
        stoppedBy: "model",
        verified: guardrails ? guardrails.succeeded() !== null : undefined,
      };
    }

    // ── Tool calls → execute → loop ───────────
    if (choice.finish_reason === "tool_calls") {
      const toolEvents: ToolEvent[] = [];

      for (const call of choice.message.tool_calls ?? []) {
        const name = call.function.name;
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

        const tool = tools.byName.get(name);
        process.stdout.write(`           → ${name}(${JSON.stringify(args)}) ... `);
        let result: string;

        const correction = guardrails?.validate(name, args) ?? null;
        if (correction) {
          // Guardrail rejected the call — return the correction, never touch the browser.
          result = correction;
          console.log(`blocked`);
        } else {
          try {
            result = tool ? await tool.execute(args) : `Unknown tool: "${name}"`;
            console.log(`done`);
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            console.log(`error`);
          }
        }

        toolEvents.push({ tool: name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });

        // Ground-truth check: did this action actually accomplish the task?
        await guardrails?.verifyAfter(name, args);
      }

      trace.push({ index: iterationIndex, outcome: "tool_calls", toolEvents, contextSize });

      // Verified success ends the run immediately — we don't wait for the model
      // to get around to claiming it (or to claim something false instead).
      const verifiedId = guardrails?.succeeded() ?? null;
      if (verifiedId) {
        return {
          answer: `Verified: upvoted story ${verifiedId} on Hacker News.`,
          iterations: trace.length,
          trace,
          stoppedBy: "success",
          verified: true,
        };
      }
    }
  }
}
