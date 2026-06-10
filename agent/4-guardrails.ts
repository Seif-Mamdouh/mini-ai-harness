import type { ToolHooks } from "./1-tools.js";
import type { BrowserSession } from "./browser.js";

// STAGE 4 — guardrails #2 and #3: validate actions, then VERIFY them.
//
// Stage 3's gate (validate) stops the agent acting on story ids that don't
// exist. But a click landing isn't the same as a vote registering — on Hacker
// News an upvote only "takes" if you're logged in; otherwise you're bounced to
// /login and nothing changes. A weak model won't notice. It clicks, sees a page,
// and announces victory. That's the lie.
//
// So the harness stops trusting the model's narration and checks ground truth
// itself. After an allowed upvote click, we ask the page directly: does that
// story's arrow now carry the class "nosee"? Only then is the task `succeeded`.
// The loop reports success from THIS signal, not from anything the model says.

export type Guardrails = {
  hooks: ToolHooks;
  // Returns a correction string to send back to the model INSTEAD of running
  // the tool, or null to let the call through untouched.
  validate: (name: string, args: Record<string, unknown>) => string | null;
  // Called by the loop right after a tool runs, to check ground truth.
  verifyAfter: (name: string, args: Record<string, unknown>) => Promise<void>;
  // The id of a story whose upvote the harness has VERIFIED, or null.
  succeeded: () => string | null;
};

export function createGuardrails(session: BrowserSession): Guardrails {
  const knownStoryIds = new Set<string>();
  let verifiedId: string | null = null;

  const upvoteId = (selector: unknown): string | null => {
    if (typeof selector !== "string") return null;
    return selector.match(/up_(\d+)/)?.[1] ?? null;
  };

  return {
    hooks: {
      onStoriesLoaded: (stories) => {
        knownStoryIds.clear();
        for (const s of stories) knownStoryIds.add(String(s.id));
      },
    },

    validate: (name, args) => {
      if (name !== "browser_click") return null;
      const id = upvoteId(args.selector);
      if (!id) return null; // not an upvote click — nothing to validate

      if (knownStoryIds.size === 0) {
        return `Refused: you tried to upvote story ${id} but you have not called browser_get_stories yet. Call it first so you know which stories actually exist.`;
      }
      if (!knownStoryIds.has(id)) {
        return `Refused: story id "${id}" is not on this page. Real story ids are: ${[...knownStoryIds].join(", ")}. Call browser_get_stories and use one of those.`;
      }
      return null;
    },

    verifyAfter: async (name, args) => {
      if (name !== "browser_click") return;
      const id = upvoteId(args.selector);
      if (!id) return;
      // Ground truth: HN hides the arrow (adds class "nosee") once the vote lands.
      const res = await session.hasClass(`#up_${id}`, "nosee");
      if (res.includes("has class")) verifiedId = id;
    },

    succeeded: () => verifiedId,
  };
}
