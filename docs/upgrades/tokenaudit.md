# Where its tokens go (round 36, tokenaudit)

Every message to an AI starts with the same fixed part before the owner's words: Hearth's system prompt (who it is,
the Lab how-to, habits, personality, standing instructions, file access line, memory, answer length…) and the
definitions of every tool it has (Hearth's tool sets, claude.ai connectors, the owner's own connections). Earlier
rounds cut that part (tokensaver) and kept it cached (cachewise); this stream **shows it, per AI, line by line**, with
how often each tool is really used and one-click trims for what isn't. It only reads: no prompt, flag or message
changes (prompts stay byte-stable: `dev/cache-test.js`).

## Where
⋯ AI setup → **Spending** (folded, as before) → **Where its tokens go** (a small fold inside it; no new rows anywhere
else). Also Ctrl/⌘+K "Spending: where its tokens go", `/token-audit` (alias `/where-tokens-go`), `/token-audit open`.

## Measured, not guessed
- The prompt lines are the **same text the engine gets**: `engines.js buildPrompt` now joins `promptParts()` (named
  parts, in order), byte for byte as before (checked old vs new on 9 kinds of AI, and by `dev/cache-test.js`).
- Hearth's tool lines are `mcp/cost.js exactOf` (the lists the MCP servers serve), the owner's connections their
  measured list from Test (× the read-only share when Read only), claude.ai connectors ≈ 350 tokens per tool Claude's
  startup report lists for them (Claude doesn't report their definitions: marked "≈ estimated").
- Lines add up exactly to the whole prompt's tokens (largest-remainder rounding, ≈ chars / 4 like
  `dev/tokens-test.js`).
- What a trim saves is measured **with the tool off** (the prompt rebuilt, the tool lists re-measured), so it includes
  the prompt line that goes with a tool set, and a line that would come instead (a plain chat without tools gets the
  short "you have no tools" line).
- Smoke-tested end to end with the fake engine: a plain Claude with board tools got a 146-token prompt + 296 + 785
  tokens of tool lists; the board line offered "Turn off" saving **873**; after the click, the next run's prompt and
  tool lists were **873 tokens smaller** (exactly).

## Upgrades
### The breakdown
1. **Where its tokens go** in ⋯ AI setup → Spending: "≈ 1.3k with each message" on its fold line.
2. **Its instructions**, one line each with its tokens: who it is, the Three Director how-to, habits (checks its work,
   suggests next steps, remembers facts, progress bar), personality, standing instructions, file access line, project
   folder, connected apps line, memory, answer length, web search, crew.
3. **Memory** that goes only with the messages it's about shows 0 here, saying so.
4. **Its tools**, one line each: Hearth's tool sets (Lab, chats, mood board, screenshots, app windows, Adobe,
   publishing, Forgeheart), claude.ai connectors ("Gmail (claude.ai)"), your own connections ("Notes (yours)").
5. A tool set's hover splits its tokens: definitions + its line in the instructions.
6. **Hooks** shown at 0: they run in Hearth, never in the prompt.
7. **"used N times this week"** under each tool, for this AI.
8. The total, split: "≈ 1,232 tokens before your words: 151 of instructions, 1,081 of tool definitions".
9. **What the cache usually covers**: this week's cache share of what it read, at about a tenth of the price.
### Trims (one click, never silent)
10. **"Turn off — not used in 30 days"** on a tool this AI didn't use for 30 days (opt-in sets, a plain chat's chat
    tools, claude.ai connectors, your connections; a director's own Lab / chat / game tools never).
11. Its hover says what it saves per message and per week at your use.
12. A toast says what was switched off and what it saves, with **Undo**.
13. It's the same switch as What it can use (config saved; cachewise's one calm line if a chat was mid-way).
14. **"Shorten"** on an over-long standing instruction (> 60 tokens), personality (> 120) or memory in the prompt
    (> 200): opens it to edit (memory: What it remembers…); nothing is rewritten for you.
15. **What trimming would save**: "≈ 1,197 fewer tokens a message · ≈ 84k a week at your use (70 replies in 7 days)".
### The nudge
16. **One line, once**, in the Spending fold's summary when an unused tool costs more than ≈ 500 tokens a message:
    "No weekly limit · Mood board: ≈ 873 tokens a message, not used in 30 days". Not a toast; gone once the fold is
    opened (remembered per AI and tool).
### Tool use, counted honestly
17. A small per-AI log of tool calls (kv `tool-use`, 35 days), from each reply's own tool list.
18. It starts from the **last 35 days of your chats** (tool calls are saved with the replies), so "30 days unused" is
    true from day one; before 30 days of history, no "not used in 30 days" is claimed.
19. A Hearth tool any AI called in 30 days (usage.js counts) is never called unused.
### In words and elsewhere
20. `/token-audit`: the same breakdown in the chat; `/token-audit open` opens it in AI setup.
21. Ctrl/⌘+K: "Spending: where its tokens go" (AI setup at Spending, the breakdown open).

21 upgrades.

## Files
New: `tokenaudit-core.js` (pure rules: breakdown, rounding, trims, nudge, the log; Node-tested), `tokenaudit.js` +
`tokenaudit.css` (budget lazy group), `tokenauditmain.js` (main, lazy IPC `tokenaudit:measure` / `tokenaudit:seed`),
`dev/tokenaudit-test.js` (unit), `dev/checks/tokenaudit.js` (smoke, budget group).
Small edits: `engines.js` (`promptParts`; `buildPrompt` joins it), `budget.js` (one line: the section in Spending),
`options.js` (the nudge in the Spending summary), `main.js` (one `lazyIpc` line), `preload.js` (two calls),
`lazy-data.js` (+3 files in the budget group, manifest regenerated), `dev/fake-claude.js` (`toolsinfo`: the tool
lists a run really got), `dev/run-checks.js` (unit list, budget group).

## Tested
- `node dev/tokenaudit-test.js` (unit): parts = the prompt byte for byte on 8 kinds of AI; prompt lines add up to it;
  tool lines = the definitions sent; connectors / connections; trims save exactly the next prompt's change; used /
  untracked / used-by-another-AI → no trim; a director's tools never offered; Shorten thresholds; memory relevant; the
  log, rounding, cache share; the history seed.
- `dev/checks/tokenaudit.js` (fake engines): the fold, its lines, the nudge in the summary (not a toast), Turn off →
  config + toast with Undo → the next prompt + tool lists shrink by the amount shown; the nudge once; `/token-audit`;
  the palette way in. No page errors.
- `sh dev/run-checks.sh options budget`: 11/11. `unit:tokens-test`, `unit:cache-test`, `concise-test`,
  `budget-test`, `director-mcp-test`, `boot-test`: pass.

## Not done (on purpose) / risks
- **claude.ai connectors are estimates** (≈ 350 tokens per tool): Claude Code lists their tool names, not their
  definitions. Marked "≈ estimated" on screen.
- **The engines' own part** (Claude Code's / Codex's base prompts and built-in tools, e.g. Read / Edit with file
  access) isn't Hearth's text and isn't counted (as in `dev/tokens-test.js`).
- **Per-week savings** use the AI's replies in the last 7 days; a reply that uses tools re-sends the fixed part each
  step, so the real saving is usually larger.
- **The history seed** reads the chats changed in the last 35 days once (in the main process, one chat at a time); a
  very large chat history makes that first look take a moment.
- A plain chat's chat tools ("Your chats and Hearth") can be offered off when unused for 30 days; they come back with
  Undo or the switch in What it can use.
- `node dev/lazy-manifest.js` reported an "actions" difference for director commands (`/director-*`, `/undo-edit`…) in
  the lazy-vs-eager comparison; it's outside the budget group and unrelated to this change. Only the budget group's
  META entry was kept from the regeneration.

## For the patch notes
- New in ⋯ AI setup → Spending: **Where its tokens go** — what each message to that AI carries before your words,
  line by line: its instructions, personality, memory, habits, and every tool it has.
- Each tool shows how often this AI used it this week; one unused for 30 days gets **Turn off — not used in 30 days**,
  with what it saves per message and per week. One click, a toast with Undo.
- Over-long instructions, personality or memory get **Shorten**, which opens them for you to edit.
- The numbers are measured from what the AI really gets, and a trim shrinks the next message by exactly the amount shown.
- When an unused tool costs more than about 500 tokens a message, the Spending line says so once — no pop-ups.
- Connected apps from claude.ai are estimated (Claude doesn't report their size); everything else is measured.
- Also: `/token-audit` in any chat, or Ctrl/⌘+K "Spending: where its tokens go".
