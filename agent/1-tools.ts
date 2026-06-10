import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { BrowserSession } from "./browser.js";

export type Tool = {
  definition: ChatCompletionTool;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

export type ToolRegistry = {
  definitions: ChatCompletionTool[];
  byName: Map<string, Tool>;
};

// Hooks let the harness observe what the tools see without the model knowing.
// onStoriesLoaded fires whenever the agent fetches the structured story list —
// stage 3 uses it to remember which story IDs actually exist on the page.
export type ToolHooks = {
  onStoriesLoaded?: (stories: { id: string; rank: number; title: string }[]) => void;
};

// STAGE 2 — guardrail #1: a structured view of the world.
// We stop making the model parse a wall of innerText. browser_get_stories
// hands it clean JSON — rank, real story ID, voted status. This grounds it in
// IDs that actually exist, so it stops inventing selectors out of thin air.
// It still can't VERIFY its clicks, so it can still end the run with a lie —
// but at least now it's aiming at real targets.
export function createTools(session: BrowserSession, hooks?: ToolHooks): ToolRegistry {
  const tools: Tool[] = [
    {
      definition: {
        type: "function",
        function: {
          name: "browser_navigate",
          description: "Navigate the browser to a URL.",
          parameters: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
          },
        },
      },
      execute: async ({ url }) => session.navigate(url as string),
    },

    {
      definition: {
        type: "function",
        function: {
          name: "browser_url",
          description:
            "Get the URL of the current page. Use this to detect redirects (e.g. being sent to a login page).",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => session.getUrl(),
    },

    {
      definition: {
        type: "function",
        function: {
          name: "browser_get_text",
          description: "Get the visible text content of the current page.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => session.getText(),
    },

    {
      definition: {
        type: "function",
        function: {
          name: "browser_fill",
          description: "Fill in an input field on the current page.",
          parameters: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: 'CSS selector for the input, e.g. "input[name=\'acct\']"',
              },
              value: { type: "string", description: "The value to type into the field." },
            },
            required: ["selector", "value"],
          },
        },
      },
      execute: async ({ selector, value }) =>
        session.fill(selector as string, value as string),
    },

    {
      definition: {
        type: "function",
        function: {
          name: "browser_click",
          description:
            "Click an element on the current page. Also waits for any navigation that results from the click.",
          parameters: {
            type: "object",
            properties: {
              selector: { type: "string", description: 'CSS selector, e.g. "input[type=\'submit\']"' },
            },
            required: ["selector"],
          },
        },
      },
      execute: async ({ selector }) => session.click(selector as string),
    },

    {
      definition: {
        type: "function",
        function: {
          name: "browser_get_stories",
          description:
            "Get a structured list of Hacker News stories on the current page — rank, story ID, title, and whether you've already voted. Use this instead of browser_get_text to accurately identify which story to upvote. Upvote with the selector a[id=\"up_STORYID\"].",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => {
        const result = await session.getStories();
        if (hooks?.onStoriesLoaded) {
          try {
            hooks.onStoriesLoaded(JSON.parse(result));
          } catch {}
        }
        return result;
      },
    },
  ];

  return {
    definitions: tools.map((t) => t.definition),
    byName: new Map(tools.map((t) => [t.definition.function.name, t])),
  };
}
