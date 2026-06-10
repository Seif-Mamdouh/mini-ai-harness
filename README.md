# mini-ai-harness

**Thesis: you don't fix a struggling agent by rewriting the prompt. You fix it by tightening the guardrails around it.**

An agent without guardrails is a dumb dog with no field — it runs, confidently, in the wrong direction, and then tells you it arrived. This project demonstrates the alternative. It takes a deliberately weak model (`openai/gpt-3.5-turbo-0613`) and a deliberately naive, **frozen** prompt, and asks it to do one real-world task:

> Upvote the top story on Hacker News.

The prompt never changes. The model never changes. What changes — one git branch at a time — are the *guardrails*. You watch the same dim agent go from hallucinating-and-lying to reliably correct, purely by reshaping the space it's allowed to act in.

## The progression (read it as diffs)

Each stage is a git branch built on the previous one. The whole point is in the diffs:

```bash
git diff stage-1-naive stage-2-structured-tools
git diff stage-2-structured-tools stage-3-validation
git diff stage-3-validation stage-4-verify-and-stop
git diff stage-4-verify-and-stop stage-5-bounded
```

Notice what's *never* in those diffs: the task string in `agent/3-context.ts` and `agent/7-index.ts`. It's byte-for-byte identical the whole way down.

| Branch | Guardrail added | What the agent does |
|--------|-----------------|---------------------|
| `stage-1-naive` | *(none)* | Only `browser_get_text` + `browser_click`. Reads a wall of text, guesses a selector, clicks into the void, and announces "I upvoted the top story." **It hallucinates and it lies.** |
| `stage-2-structured-tools` | **structured view** — `browser_get_stories` returns clean JSON (rank, real id, voted status) | Stops inventing selectors; aims at ids that actually exist. Still can't verify, so it can still finish on a lie. |
| `stage-3-validation` | **action validation** — `4-guardrails.ts` gates clicks against ids the agent has actually seen | A hallucinated id never reaches the browser; the model gets a precise correction back and retries. |
| `stage-4-verify-and-stop` | **ground-truth verification** — `browser_has_class` + the harness checks the arrow flipped to `nosee` | Success is *observed*, not narrated. The loop ends on a verified vote; a model that claims "done" without proof yields `verified: false`. **The lie dies here.** |
| `stage-5-bounded` *(= `main`)* | **bounded loop** — `MAX_ITERATIONS` cap + sliding `MAX_CONTEXT_MESSAGES` window | Can't spin forever or balloon context. The final, reliable demo. |

## Files

All in `agent/`, numbered in reading order:

- `1-tools.ts` — the tool registry the model is given. **Guardrails live here** (which capabilities are even exposed).
- `2-model.ts` — the OpenRouter client + the intentionally weak default model.
- `3-context.ts` — the frozen system + task prompt.
- `4-guardrails.ts` — validation + ground-truth verification (appears at stage 3).
- `5-loop.ts` — the agent loop. **Guardrails live here too** (what the loop enforces and what it's willing to call "success").
- `7-index.ts` — wires it together and runs one headed browser session.
- `browser.ts` — the full Playwright capability. Constant across stages; the *harness* chooses what to expose.
- `login.ts` — one-time HN login helper.

## Running it

```bash
npm install
npm run playwright:install        # downloads Chromium
cp .env.example .env              # then put your OpenRouter key in it
npm run login                     # one-time: log into HN, saves the session
```

`npm run login` matters: upvoting on Hacker News only works while logged in. Without it, the click bounces to `/login` and nothing registers — which is precisely the failure stage 4's verification is built to catch. (Run the early stages without logging in and you'll see the agent lie about a vote that never happened.)

Then check out any stage and run it:

```bash
git checkout stage-1-naive   && npm run agent   # watch it hallucinate
git checkout stage-5-bounded && npm run agent   # watch it actually work
```

The browser runs headed so you can watch the agent work in real time.

## The takeaway

Every instinct says "the agent is failing, let me improve the prompt." This project is the counter-argument made runnable: the same weak model, the same naive words, carried all the way to correct — by guardrails, not by persuasion. The shape of the constraint *is* the instruction.
