# ⏳ Usage left: how much of each AI's plan is left, when it runs out, and how to save (round 48, usagelimits)

The owner asked to "show, just like Astra does currently in 'usage', how much usage left I have and the heads up of
how long I have left and how to optimize token from now on in the usage menu. Also make the presentation a bit nicer."
The Usage window (the meter's dashboard) showed only Astra's account limits, as a plain list. It now opens on **one
card per AI**, with what's left of each plan window, how fresh that number is, when it would run out at your pace, and
the three changes that save the most from now on. It costs 0 tokens and nothing is guessed.

## Where Claude's numbers come from (0 tokens, nothing uploaded)
- **With every reply**: Claude Code's stream-json has a `rate_limit_event` line (`rate_limit_info`: status, the limit
  type, `resetsAt` in seconds, `utilization` 0–1, and `unifiedWindows { five_hour, seven_day, … }` when the account
  carries them). `engines.js` turns it into a `limits` event on the existing live channel (two small lines); the window
  keeps the newest number per window.
- **A refused message** ("5-hour limit reached ∙ resets 6pm", "…usage limit reached|1760378400", a 429): that window is
  at 100 % until its reset (offline-core.js reads the time, as for the offline queue).
- **Claude Code's own `/usage`**, run in print mode when the Usage window opens (at most every 5 minutes, never on a
  timer). It's a *local command* of Claude Code: checked on the installed 2.1.301 here, the result says
  `local_command: "usage"`, `num_turns: 0`, `duration_api_ms: 0` — no model request. Hearth checks this on every answer;
  if a copy ever answered with a model turn, the path switches itself off for good (kv `usage-limits`). Copies older
  than 2.1.301 are never asked. With a subscription it prints lines like "Current session: 42% used · resets 6pm"; with
  an API key it prints only the cost, so nothing is shown from it.
- **Astra**: codex-usage.js's account read (Codex's own, unchanged), when the window opens and at most every 30 minutes
  after an Astra reply.
- **Freshness**: every card says "as of 3 min ago"; hover a bar for where its number came from. A window past its reset
  shows "reset" with no stale number; a window nobody reported says "Not known yet".

## The heads-up (usagelimits-core.js, Node-tested)
- A window started at `resetsAt − its length` (5 h or 7 days). The pace is taken, first match:
  1. **Local tokens** (the week): the percent per token since the window started (the meter's per-day counts for this
     AI) × the tokens of yesterday and today.
  2. **Its own samples**: the rise between the reports kept for this window (the last 40), over ≥ 30 min (session) or
     ≥ 6 h (week).
  3. **The average** since the window started (not before 15 min / 6 h: "Too early … to tell your pace").
- Words: "At your pace this week you'll reach the weekly limit around Thu 6 pm (it resets Sat 9 am)." · "At this pace
  the session limit comes around 4:40 pm, 25 min before it resets." · "At your pace you'll have used about 70% of this
  week when it resets: you're fine." · "Session limit reached: it resets in 2 h 10 min."
- The card shows one line: what runs out first, else the week's outlook.

## Upgrades
### The cards (Usage window: click the meter, Ctrl/⌘+Shift+U, `/usage`)
1. **One card per AI** (Claude, Astra) at the top of the Usage window, side by side (stacked on a narrow window).
2. **A slim bar per window**: Session (5 hours) and This week (and Sonnet / Opus weeks when Claude Code reports them),
   with **% left** large, % used and **"resets in 2 h 10 min"** (or "resets Sun 8:45 pm" past a day).
3. **Calm colors**: each AI's own color; the bar turns amber at 80 % and red at 95 %.
4. **How fresh**: "as of just now / 3 min ago / 2 h ago" per card; hover a bar for its source and exact reset.
5. **Never invented**: "Not known yet: Claude Code reports it with your next Claude message"; a reset window says so.
6. **The heads-up line** under the bars (the forecast above).
7. **Today / 7 days tokens** for that AI with a tiny sparkline of the week.
8. The countdowns stay current while the window is open (a 30 s look that writes only when the text changed).
### How to save from now on
9. **The 3 changes that save the most**, from 🧭 Cost coach (Continue lighter, Let Smart decide, Short answers, an
   unused tool, an unpinned swarm), each **one click** with **Undo** (and Ctrl/⌘+Z), "estimated from your last 7 days".
10. When Hearth's own count is a fair sample of the week (≥ 100k tokens), each saving also says its share of that AI's
    weekly limit ("≈ 8% of Claude's weekly limit").
11. Already lean: one ✓ line instead of a fix.
### The numbers, at 0 tokens
12. **Claude's plan usage from each reply** (rate_limit_event) and **from a refused message**.
13. **Claude Code's local /usage** when the Usage window opens (no model request; checked on every answer; old copies
    never asked).
### Heads-ups, calmly
14. **A note through Hints at 80 % and at 95 %** of any window ("Claude has 17% of its weekly limit left. It resets
    Sun 8:45 pm."), once per window; **and when it resets** ("…has reset: the full week is yours again"). A desktop
    notification too while you're in another app, when "Tell me when… Replies" is on. Never blocks sending.
### Other ways in
15. **`/usage-left`** (alias `/limits`): the same in words; `/usage-left open`: the Usage window.
16. **Ctrl/⌘+K**: "Usage left — how much of each AI's plan is left, and when it resets".

16 upgrades.

## Light, and safe
- Its own lazy group (`usagelimits`, after `costcoach`, loaded after the first screen): first screen unchanged. The
  Usage window loads it on open if it isn't in yet (and falls back to the old Codex list if it can't).
- `usagelimitsmain.js` is a lazy IPC (loaded on the first /usage read). The CLI runs with `--no-session-persistence
  --strict-mcp-config` in the engines' folder, 20 s at most.
- Its store (kv `usage-limits`: the newest number per window, ≤ 40 samples of the current cycle, the notes given)
  follows the scenesafe rule: read with status; "unreadable" is never "empty" and is never written over.
- Nothing is added to any prompt, flag or message (`dev/cache-test.js` untouched).

## Files
New: `usagelimits-core.js` (pure: reading, store, freshness, forecast, notes), `usagelimits.js` + `usagelimits.css`
(the cards, the tips, the notes, `/usage-left`), `usagelimitsmain.js` (main, lazy IPC `usagelimits:claude`),
`dev/usagelimits-test.js` (UNIT), `dev/checks/usagelimits.js`.

## Edits outside the lane (small, additive)
- `engines.js` (Codex shares it): `rate_limit_event` → a `limits` live event (1 line + comment) and `'limits'` in
  `LIVE_EVENTS`. Nothing in codex-server.js / codex-usage.js changed.
- `meter.js`: the Usage window's account section asks UsageLimits to paint it (old Codex list as fallback); its title
  "Usage left".
- `notify-core.js`: a `limit` notification type under the Replies switch (+ `dev/notify-test.js`'s table).
- `main.js` (one `lazyIpc` line), `preload.js` (`usageLimitsClaude`), `lazy-data.js` (the group, manifest
  regenerated), `index.html` (`usagelimits` added to the existing lazy-at tag: no new script).
- `dev/fake-claude.js` / `dev/fake-common.js`: switches `claudeRateEvent` (a rate_limit_event after init),
  `claudeUsageText` (`-p /usage` answers like the local command), `limitForm: 'session'`.
- `dev/run-checks.js`: UNIT + a `usagelimits` group.

## Tested
- `node dev/usagelimits-test.js` (UNIT): 50 checks: events (unifiedWindows, top level, rejected, allowed without a
  number, overage left out), refusals (session, epoch, weekly; busy / network aren't limits), the /usage text (session,
  week, Sonnet, reset times; cost-only → nothing), Codex buckets, the store (newest wins, carried numbers, samples per
  cycle, caps), freshness and countdown words, views (levels, reset, unknown), the forecast (average, local tokens,
  samples; hit / ok / early / reached / reset / unknown), local tokens, the share of the week, the notes (80, 95, once,
  reset, old numbers, reached), the version gate.
- `dev/checks/usagelimits.js` (smoke, fake engines): a reply's rate_limit_event → kv on disk; the 80 % note once; the
  Usage window: Claude's card (42 % / 17 % left, "resets in 2 h 10 min", "as of just now", amber week, named bars, the
  heads-up, the sparkline), Astra's card; 3 tips, one applied then undone (config back); a refusal → session 100 %,
  resets 6 pm; /usage read (2.1.301 fake) → the week from it; an older copy never asked; `/usage-left`; the Light look.
  No page errors. Screenshot looked at: two calm cards side by side (Claude warm, Astra teal), bars with large "% left",
  the forecast in a soft box, three fix rows with violet buttons below.
- Targeted: see the final report (usagelimits group: costcoach, budget, sendpreview, offline, a11y, lazy, unit:boot-test,
  unit:codex-usage-test), `node dev/notify-test.js`, `node dev/datasafe-scan.js`, `node dev/errorcalm-scan.js`.

## Risks / not done
- **Claude Code's /usage text for a subscription** wasn't seen here (this machine has no subscription sign-in); the
  parser follows the format in Claude Code 2.1.301's own code ("Current session: 42% used · resets 6pm (…)"). If it
  doesn't match, nothing is shown from it and the per-reply numbers still work.
- **utilization** is read as a fraction (Claude Code's own schema says 0–1, may pass 1).
- The forecast is an estimate from one pace; Claude Code used outside Hearth counts toward the plan but not in the
  meter's tokens (the samples / average methods still see it through the plan's own percent).
- Astra's numbers come only from the account read (Codex's stream doesn't report them per reply here).

## For the patch notes
- New: **Usage left**: the Usage window (click the token meter) now starts with one card per AI showing how much of
  your plan is left: Claude's 5-hour session and week, Astra's session and week, each with when it resets.
- A heads-up says how long you have at your pace: "At your pace this week you'll reach the weekly limit around Thu
  6 pm", or "you're fine".
- Every number says how fresh it is ("as of 3 min ago"). If Hearth doesn't know yet, it says so instead of guessing.
- "How to save from now on" lists the 3 changes that save the most, each one click with Undo.
- A calm note at 80 % and 95 % of a limit, and when it resets. Nothing is ever blocked.
- It costs 0 tokens: the numbers come from what Claude Code and Codex already report, and Claude Code's own /usage.
- Also `/usage-left` in any chat.
- Caveat: the forecast is an estimate from your recent pace.
