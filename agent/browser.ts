import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { existsSync } from "node:fs";

const AUTH_STATE = new URL("./.auth/state.json", import.meta.url).pathname;

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  // If a saved login state exists (created by `npm run login`), reuse it so the
  // agent acts as a logged-in HN user. Without it, upvotes redirect to /login —
  // which is exactly the failure the later-stage guardrails are built to catch.
  async open(opts: { headless?: boolean } = {}): Promise<void> {
    this.browser = await chromium.launch({ headless: opts.headless ?? false });
    this.context = await this.browser.newContext(
      existsSync(AUTH_STATE) ? { storageState: AUTH_STATE } : {},
    );
    this.page = await this.context.newPage();
  }

  async navigate(url: string): Promise<string> {
    await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    return `Navigated to ${url}`;
  }

  async getUrl(): Promise<string> {
    return this.page!.url();
  }

  async getText(): Promise<string> {
    const text = await this.page!.innerText("body");
    return text.slice(0, 4000);
  }

  async fill(selector: string, value: string): Promise<string> {
    await this.page!.fill(selector, value);
    return `Filled "${selector}"`;
  }

  async click(selector: string): Promise<string> {
    // Capture the id of the element before clicking (navigation may change the page)
    const elementId = await this.page!.locator(selector).first().getAttribute("id");

    await this.page!.click(selector, { timeout: 10000 });
    await this.page!.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const clicked = elementId ? `element id="${elementId}"` : `"${selector}"`;
    return `Clicked ${clicked} — now at ${this.page!.url()}`;
  }

  // Returns a structured list of HN front-page stories so the agent can
  // correlate story IDs, titles, ranks, and voted status precisely.
  async getStories(): Promise<string> {
    const stories = await this.page!.evaluate(() => {
      return Array.from(document.querySelectorAll(".athing")).map((row, i) => {
        const id = row.id;
        const title = row.querySelector(".titleline a")?.textContent?.trim() ?? "(no title)";
        const upvoteEl = document.querySelector(`#up_${id}`);
        const alreadyVoted = upvoteEl?.classList.contains("nosee") ?? true;
        return { rank: i + 1, id, title, alreadyVoted };
      });
    });
    return JSON.stringify(stories, null, 2);
  }

  async hasClass(selector: string, className: string): Promise<string> {
    const el = this.page!.locator(selector).first();
    const classes = (await el.getAttribute("class")) ?? "";
    const has = classes.split(" ").includes(className);
    return has
      ? `"${selector}" has class "${className}"`
      : `"${selector}" does not have class "${className}"`;
  }

  // Logged in iff HN is showing a "logout" link in the top bar. (Assumes the
  // current page is on news.ycombinator.com.)
  async isLoggedIn(): Promise<boolean> {
    return (await this.page!.locator('a[href^="logout"]').count()) > 0;
  }

  // Programmatic login: fill the FIRST form on /login (the second is the
  // "create account" form) and submit. Returns whether it took.
  async login(username: string, password: string): Promise<boolean> {
    await this.page!.goto("https://news.ycombinator.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const form = this.page!.locator("form").first();
    await form.locator('input[name="acct"]').fill(username);
    await form.locator('input[name="pw"]').fill(password);
    await form.locator('input[type="submit"]').click();
    await this.page!.waitForLoadState("domcontentloaded", { timeout: 15000 });
    return this.isLoggedIn();
  }

  // Persist cookies so future runs start already authenticated.
  async saveState(): Promise<void> {
    await this.context!.storageState({ path: AUTH_STATE });
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
