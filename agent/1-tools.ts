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

// STAGE 1 — no guardrails.
// The agent gets only the rawest possible view of the page: a wall of text and
// a click. It cannot see structured story IDs, cannot verify that anything it
// did actually worked. With a weak model this is enough to produce confident
// nonsense: it guesses a selector, clicks into the void, and reports success.
export function createTools(session: BrowserSession): ToolRegistry {
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
  ];

  return {
    definitions: tools.map((t) => t.definition),
    byName: new Map(tools.map((t) => [t.definition.function.name, t])),
  };
}
