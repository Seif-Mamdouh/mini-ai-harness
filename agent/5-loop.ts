import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { client } from "./2-model.js";
import type { ToolRegistry } from "./1-tools.js";
import type { Guardrails } from "./4-guardrails.js";

// STAGE 5 — guardrail #4: bound the loop.
// A weak model can wander forever and let the conversation grow without limit.
// Two cheap rails fix both: a hard iteration cap (the loop can fail closed
// instead of spinning), and a sliding context window (only the system prompt
// plus the most recent messages are ever sent — cost and confusion stay flat).
const MAX_ITERATIONS = 12;
const MAX_CONTEXT_MESSAGES = 20;

// Keep the system message + the most recent messages, without orphaning a tool
// result from the assistant tool_call that produced it (the API rejects that).
function trimContext(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;
  const system = messages[0];
  const tail = messages.slice(messages.length - (MAX_CONTEXT_MESSAGES - 1));
  // If the window opens in the middle of a tool exchange, drop the dangling
  // tool results until we reach a clean boundary.
  while (tail.length && tail[0].role === "tool") tail.shift();
  return [system, ...tail];
}

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

// The fully-harnessed loop: validate before acting, verify after, end on real
// verified success, and never run unbounded in iterations or context.
export async function runLoop(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ToolRegistry,
  guardrails?: Guardrails,
): Promise<LoopResult> {
  const trace: LoopIteration[] = [];

  // ── Precondition guardrail: make the task possible before the agent starts.
  // The harness ensures we're logged in; the agent never has to deal with it.
  if (guardrails?.ensureReady) {
    console.log(await guardrails.ensureReady());
  }

  while (true) {
    const iterationIndex = trace.length + 1;

    // ── Iteration cap (fail closed, don't spin forever) ──
    if (trace.length >= MAX_ITERATIONS) {
      return {
        answer: `Stopped after ${MAX_ITERATIONS} iterations without a verified result.`,
        iterations: trace.length,
        trace,
        stoppedBy: "guardrail",
        verified: guardrails ? guardrails.succeeded() !== null : undefined,
      };
    }

    // ── Model call (on a bounded, trimmed context) ────────
    const sent = trimContext(messages);
    process.stdout.write(`[iter ${iterationIndex}] calling model (ctx ${sent.length})... `);
    const response = await client.chat.completions.create({
      model,
      messages: sent,
      tools: tools.definitions,
    });

    const choice = response.choices[0];
    const contextSize = sent.length;
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
