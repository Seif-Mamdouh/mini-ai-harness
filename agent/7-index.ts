import { createTools } from "./1-tools.js";
import { MODEL } from "./2-model.js";
import { createContext } from "./3-context.js";
import { createGuardrails } from "./4-guardrails.js";
import { runLoop } from "./5-loop.js";
import { BrowserSession } from "./browser.js";

// The task is fixed and naive — and stays byte-for-byte identical across every
// stage of this project. We never edit it to make the agent behave. We only
// change what the agent is allowed to do and how the loop holds it accountable.
const TASK = "Upvote the top story on Hacker News (https://news.ycombinator.com). Tell me when it's done.";

console.log(`Model:     ${MODEL}`);
console.log(`Stage:     6 — ensure login (final)`);
console.log(`Task:      ${TASK}\n`);

const session = new BrowserSession();

try {
  await session.open();

  const guardrails = createGuardrails(session);
  const tools = createTools(session, guardrails.hooks);
  const messages = createContext(TASK);
  const result = await runLoop(MODEL, messages, tools, guardrails);

  console.log(`\nAnswer:      ${result.answer}`);
  console.log(`Stopped by:  ${result.stoppedBy}`);
  console.log(`Iterations:  ${result.iterations}`);
  console.log(`Verified:    ${result.verified === undefined ? "n/a" : result.verified}`);
  if (result.verified === false) {
    console.log(`\n⚠  The model reported done, but the harness could NOT verify the upvote. Not trusting it.`);
  }
} finally {
  await session.close();
}
