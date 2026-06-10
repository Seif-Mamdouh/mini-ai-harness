# Talk track — guardrails, not prompts

> Speaker notes for the live demo. One section per phase. Keep this open on a
> second screen — it lives on `main`, so checking out `phase-1/2/3` won't disturb it.

**Demo sequence**

```bash
git checkout phase-1 && npm run agent   # watch it lie
git checkout phase-2 && npm run agent   # aims true, still untrustworthy
git checkout phase-3 && npm run agent   # logs in, verifies, says done only when true
```

**Clean diffs to show on screen**

```bash
git --no-pager diff phase-1 phase-2 -- agent/   # tiny: just structured tools
git --no-pager diff phase-2 phase-3 -- agent/   # the harness
```

---

## Opening (30 sec)

- **The thesis:** "You don't fix a struggling agent by rewriting the prompt. You fix it by tightening the guardrails."
- Show the `TASK` line in `agent/7-index.ts`. "This sentence is **byte-for-byte identical** in all three phases. I never touch it. Watch the prompt stay frozen while the agent goes from lying to reliable."
- The model is deliberately weak (`gpt-3.5-turbo`) — "so it's the guardrails carrying it, not a smart model."

---

## Phase 1 — Naive agent 🐕 (`git checkout phase-1`)

*The "dumb dog that doesn't know where to go."*

- **What it has:** raw tools only — navigate, get_text, click. It reads a wall of text and guesses CSS selectors.
- **One file to point at:** `agent/5-loop.ts` — the loop runs until *the model decides to stop talking*. No verification.
- **Run it live.** It clicks nothing real, then says *"I've upvoted the top story."*
- **The punchline:** "`stoppedBy: model`. The agent graded its own homework — and it lied to me. Nothing checked reality."

---

## Phase 2 — Structured tools (`git checkout phase-2`)

*Give it structure so it can't get lost.*

- **What changed:** one new tool — `browser_get_stories` — returns clean JSON: `{rank, id, title, alreadyVoted}`.
- **File:** `agent/1-tools.ts`. Show the tiny diff: `git diff phase-1 phase-2 -- agent/`.
- **Why:** "I shrank the action space. Instead of scraping 4,000 characters and hallucinating a selector, it gets ground truth and aims at a real story."
- **The honest catch:** "It now aims *true* — but it still can't tell if the click *worked*, and it still declares victory on its own word. The lie survives. That's the setup for Phase 3."

---

## Phase 3 — Full harness ✅ (`git checkout phase-3`)

*Wrap the agent so it can't lie.*

- **One story, three jobs the harness does:**
  - **Guarantees the precondition** — `ensureReady()` logs in before the agent even starts.
  - **Validates every action** — rejects upvotes on story ids that don't exist.
  - **Verifies ground truth** — checks the real DOM (`nosee` marker) and only accepts "done" when it's actually true.
- **Files to grab:**
  - `agent/4-guardrails.ts` — the harness brain. **This is where your credentials are used** (`ensureReady()` reads `HN_USERNAME`/`HN_PASSWORD` from `.env`).
  - `agent/5-loop.ts` — pre-flight login, bounded loop, returns `stoppedBy: "success"` only when verified.
- **Run it live.** It logs itself in, upvotes, and reports success — and this time it's real.
- **The closing line:** "Same prompt as Phase 1. The difference is the harness, not the words. The agent no longer decides when it's done — **the harness verifies reality and decides for it.**"

---

## Security aside (drop it in Phase 3)

- `.env` (credentials) and the session cookie are **git-ignored — never committed**. Repo's public; only `.env.example` with placeholders ships.
- "The **model never sees the password.** Only the harness reads it; the agent works off a saved cookie." → guardrails are a security boundary too.

---

## The one slide if you only get one

> **Phase 1:** agent grades itself → lies.
> **Phase 3:** harness grades the agent against reality → can't lie.
> **Same prompt both times.** That's the whole point.
