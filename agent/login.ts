import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "dotenv/config";

// One-time login helper. Upvoting on Hacker News requires an authenticated
// session; this opens a real browser and saves the cookies so the agent can
// act as you. Run once: `npm run login`.
//
// Two modes:
//   • Automatic — set HN_USERNAME and HN_PASSWORD in .env and they get typed in
//     for you. (.env is git-ignored, so the credentials are never committed.)
//   • Manual    — leave them unset and just log in by hand in the window that
//     pops up, then press ENTER here.
const AUTH_STATE = new URL("./.auth/state.json", import.meta.url).pathname;

const username = process.env.HN_USERNAME;
const password = process.env.HN_PASSWORD;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://news.ycombinator.com/login");

if (username && password) {
  // The login form is the FIRST form on the page (the second is "create account").
  const form = page.locator("form").first();
  await form.locator('input[name="acct"]').fill(username);
  await form.locator('input[name="pw"]').fill(password);
  await form.locator('input[type="submit"]').click();
  await page.waitForLoadState("domcontentloaded");

  const body = await page.innerText("body");
  if (/bad login/i.test(body)) {
    console.error("\n  Login failed: Hacker News rejected those credentials. Check HN_USERNAME / HN_PASSWORD in .env.\n");
    await browser.close();
    process.exit(1);
  }
  console.log(`\n  Logged in as ${username}.`);
} else {
  console.log("\n  A browser window opened on the Hacker News login page.");
  console.log("  Log in there, then come back here and press ENTER to save the session.");
  console.log("  (Tip: set HN_USERNAME and HN_PASSWORD in .env to skip this step next time.)\n");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

mkdirSync(dirname(AUTH_STATE), { recursive: true });
await context.storageState({ path: AUTH_STATE });
console.log(`  Saved login state to ${AUTH_STATE}`);

await browser.close();
process.exit(0);
