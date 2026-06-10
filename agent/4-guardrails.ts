import type { ToolHooks } from "./1-tools.js";

// STAGE 3 — guardrail #2: validate actions against reality.
//
// A structured view (stage 2) keeps the model honest about what EXISTS, but it
// can still fumble: copy the wrong id, off-by-one a rank, invent an id it never
// saw. So we put a gate in front of the tools. We quietly remember every story
// id the agent has actually observed (via the onStoriesLoaded hook), and when
// it tries to click an upvote arrow we check that id against what's real.
//
// A rejected call never reaches the browser. Instead the model gets a precise
// correction back as the tool result — which is far more useful than letting it
// click nothing and carry on believing it succeeded.

export type Guardrails = {
  hooks: ToolHooks;
  // Returns a correction string to send back to the model INSTEAD of running
  // the tool, or null to let the call through untouched.
  validate: (name: string, args: Record<string, unknown>) => string | null;
};

export function createGuardrails(): Guardrails {
  const knownStoryIds = new Set<string>();

  return {
    hooks: {
      onStoriesLoaded: (stories) => {
        knownStoryIds.clear();
        for (const s of stories) knownStoryIds.add(String(s.id));
      },
    },

    validate: (name, args) => {
      if (name !== "browser_click" || typeof args.selector !== "string") return null;

      const match = args.selector.match(/up_(\d+)/);
      if (!match) return null; // not an upvote click — nothing to validate
      const id = match[1];

      if (knownStoryIds.size === 0) {
        return `Refused: you tried to upvote story ${id} but you have not called browser_get_stories yet. Call it first so you know which stories actually exist.`;
      }
      if (!knownStoryIds.has(id)) {
        return `Refused: story id "${id}" is not on this page. Real story ids are: ${[...knownStoryIds].join(", ")}. Call browser_get_stories and use one of those.`;
      }
      return null;
    },
  };
}
