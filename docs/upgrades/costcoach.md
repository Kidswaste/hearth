# 🧭 Cost coach: where the tokens went, and the 3 changes that would save the most (round 43, costcoach)

Hearth has many token savers, each in its own corner: Continue lighter (autocompact), Smart (router / routerlearn),
How long its answers are (concise), tools that sleep until needed (toolslim), Where its tokens go (tokenaudit), lean
attachments (attachlean), lean handoffs (handoff), lean missions (swarmlean). The owner shouldn't have to know which
one matters for *their* week. The coach reads what Hearth already keeps, on this computer and for 0 tokens, and says
it in one small card: where the last 7 days' tokens went, and the three changes that would have saved the most, each a
click on the setting that already exists. Nothing reaches an engine: no prompt, flag or message changes
(`dev/cache-test.js` untouched).

## What it reads (nothing new is counted)
- **Each reply's usage in the chats** (input with the cache, output, cache reads / writes, thinking: Codex's reasoning
  count or the kept thinking text ≈ chars / 4), the message before it (a mission, a 🔁 routine round, attachments and
  what attachlean sent, a quick ask or a code ask), the chat's handoff (handoff.js). `costcoachmain.js` scans the chats
  changed in the window, one at a time, and hands back compact records (`costcoach-core.js recordsOf`).
- **token-stats.json** (the meter): the week's real totals per AI; what no chat keeps (second opinions, summaries,
  deleted chats) is shown as its own line, so the coach's total is the meter's.
- **tokenaudit's measure** of each AI's fixed part (instructions vs tool definitions, which tools are unused for 30
  days, which ones sleep until needed).

## How the numbers are made (`costcoach-core.js`, Node-tested)
- **By cause**, per reply: the fixed part (split into instructions and tool definitions by tokenaudit's measure;
  without it, the chat's smallest message), attachments, your words, and the rest of the input = **re-reading the
  chat**; the output split into thinking and the answer. They add up to the week's total.
- **Also counted** (inside the causes): cache misses (the fixed part + history read at full price: not served by the
  cache, minus what the last reply added), handoffs (the brief or whole chat the receiving AI got), swarms and other
  multi-answer missions.
- **Continue lighter** is **replayed on the week's chats**: each time a chat passed the size, a ≈ 3k summary + the last
  exchanges stand in for the history from the next message on; the cheap summary run is paid (≤ 30k read + 700
  written). Off or later than 40k → "Turn on" / "Offer sooner" at 40k; already at 40k → 25k only when that adds ≥ 10 %
  of the AI's week. It's still an offer you click in the chat (the line says so on hover).
- **Deep → Smart**: thinking on the AI's own Deep effort (Smart's own picks left out); Smart would think low on quick
  asks (≤ 200 characters, no code, no attachments), keep code fixes on Deep and put the rest on medium (thinking ≈ 0.5×
  / 1× / 1.7× (high) / 2.4× (xhigh): routerlearn's multipliers, an estimate).
- **Short answers**: ≈ 20 % of the written part at Normal, 35 % at Detailed (concise measured ≈ 24 % fully followed);
  half of a tool-calling reply counts as tool arguments (needed); replies already asked short aren't counted.
- **An unused tool**: tokenaudit's measured saving per message × this AI's messages this week. Tools that sleep until
  needed (toolslim) are a ✓, never a fix.
- **A pinned 🐝 swarm** (or split, debate, side by side…): what those messages cost beyond the AI's average one-answer
  message.
- **The top 3** are the biggest, each at least 2 % of the week (and ≥ 3k); the weekly note needs one fix worth ≥ 10 %.

Measured on the smoke check's fake week (3 chats, 72 replies, ≈ 1.4M tokens): re-reading 75 %, answers 17 %,
thinking 6 %; Continue lighter at 40k ≈ 231k (17 %), Smart ≈ 60k (4 %), Short ≈ 47k (3 %).

## Upgrades
### Where
1. **⋯ AI setup › Spending › 🧭 Cost coach…**: one line under "This week…", with "3 changes would save ≈ 290k a
   week" once it has looked (else "where your tokens went, what to change"). No new rows anywhere else.
2. **The card**: the last 7 days in one line ("≈ 1.4M tokens · 72 replies · worked out here, 0 tokens").
3. **Where it went › By AI**, with a thin bar and its share.
4. **By kind of chat**: Lab director chats, plain chats, missions, routines (🔁 Keep going), and the rest (second
   opinions, summaries, deleted chats: the meter's own count).
5. **By cause**: re-reading long chats, instructions, tool definitions, attachments, your words, thinking, answers it
   wrote; hover each for what it means.
6. **Also counted**: cache misses, handoffs, swarms and multi-answer missions.
### The fixes (each an existing setting, one click)
7. **Continue lighter**: "Claude's Lab chats re-read ≈ 480k tokens this week; Continue lighter at 40k would have saved
   ≈ 210k — Turn on" (or "Offer sooner" when it's set later), replayed on your own chats.
8. **Let Smart decide**: "Astra thinks on Deep for quick questions too (14 this week); Smart would have saved ≈ 30k".
9. **Make answers short**: "Claude wrote ≈ 90k tokens of answers; Short answers would have saved ≈ 18k".
10. **Turn off** a tool unused for 30 days that still rides along (measured by Where its tokens go).
11. **Unpin** a multi-answer mission pinned 📌 from now on ("🐝 Swarm is pinned for Claude: 14 messages cost ≈ 300k…").
12. **Only the 3 that save the most**, biggest first, each with its share of the week; small ones are left out.
13. **Hover a fix** for how its number was worked out (and that it's an estimate).
14. **Already lean ✓**: what's already working says so instead of a fix ("Board tools would ride along on 120 of
    Claude's messages: they now sleep until needed ✓", short answers, Smart, Continue lighter, lean attachments,
    lean handoffs).
15. **Nothing changes without a click**; a fix is gone from the next look once applied (a ✓ instead).
### Undo
16. **Each fix has Undo** on its row and in its toast, and goes into the app's undo log (Ctrl/⌘+Z, ◉ Activity ›
    Recent changes): "Claude thinks: Smart", "Claude: continue lighter at 40k".
17. **Continue lighter changes are in the undo log now** (undoall took `lighterAt` for a time stamp and skipped it —
    the ⋯ AI setup row too).
18. **Unpinning a mission is undoable** the same way (a new "store" kind in undoall, through Missions so the ◎ button
    follows).
### By itself, calmly
19. **A weekly note** through Hints: once a week, only when one change would have saved ≥ 10 % of the week ("Cost
    coach: 2 changes would have saved ≈ 290k tokens last week (21 %). The biggest: Continue lighter." · See the
    fixes). Never while you type, a reply streams or a dialog is open; silenced by Don't show tips.
### Other ways in
20. **`/cost-coach`** (alias `/coach`): the same in words; `/cost-coach open`: the card.
21. **Ctrl/⌘+K**: "Spending: cost coach — where your tokens went, what to change", and Find anything's AI setup row
    "Cost coach".

21 upgrades.

## Light, and safe
- Its own lazy group (`costcoach`, after `budget`, loaded after the first screen): first screen unchanged at 72
  scripts / 29 sheets (`unit:boot-test`). The scan runs in the main process on first use (lazyIpc), one chat at a time;
  a look is reused for 5 minutes; the weekly check rides powerwise's schedule (every 6 h, skipped while hidden).
- **Its own small store** (kv `cost-coach`: the weeks it noted, the fixes applied) follows the scenesafe rule: it's read
  with `kvGet(…, { status: true })`; "unreadable" is never "empty" (nothing is written over it, no weekly note that
  week); nothing is saved before a real read. A held / half-written chat file is skipped by the scan, never read as
  empty.

## Files
New: `costcoach-core.js` (pure: records, attribution, the replay, fixes, top 3, note, store shape, words),
`costcoach.js` + `costcoach.css` (the line, the card, apply / undo, the weekly note, `/cost-coach`),
`costcoachmain.js` (main, lazy IPC `costcoach:scan`), `dev/costcoach-test.js` (UNIT), `dev/checks/costcoach.js`.

## Edits outside the lane (small, additive)
- `budget.js`: one line in the Spending part (`CostCoach.row`).
- `undoall.js`: a `store` kind + `UndoAll.stored()`; `undoall-core.js`: `lighterAt` is no longer ignored as a stamp,
  and has its own words.
- `main.js` (one `lazyIpc` line), `preload.js` (`costCoachScan`), `lazy-data.js` (the group, manifest regenerated),
  `index.html` (`costcoach` added to the existing lazy-at tag: no new script), `appsearch-data.js` (one AI setup row),
  `dev/run-checks.js` (UNIT, a `costcoach` group, + the budget group).

## Tested
- `node dev/costcoach-test.js` (UNIT): 65 checks on synthetic usage logs: records (window, thinking from text /
  reasoning, missions, routines, attachments sent / whole, quick vs code, handoffs once), attribution (the total =
  replies + the meter's rest, causes add up, each kind of chat, tool definitions by the measured share, swarms, cache
  misses), the Continue lighter replay (off, never passing, −35…60 % on a 30-message chat like autocompact's measure,
  sooner saves more, the summary paid), the savings (Smart on high / xhigh, Short, unused tool × messages, a pinned
  swarm), the top 3 and the floor, nothing suggested when already applied (lighter at 25k, Smart, Short, sleeping
  tools → ✓), the note's 10 %, the week key, the store's shape.
- `dev/checks/costcoach.js` (smoke): fake usage saved as chats → ⋯ AI setup › Spending › 🧭 Cost coach… → 3 fixes
  (Continue lighter · Turn on, Let Smart decide, Make answers short) with where it went; Let Smart decide → Claude on
  Smart, saved in config.json, toast, "Claude thinks: Smart" in the undo log, the row's Undo → Deep again; Turn on →
  Continue lighter at 40k, UndoAll's undo → Off again; Short applied → gone next look, ✓; `/cost-coach`; the weekly
  note shown once, the second time "noted", kv cost-coach on disk. No page errors.
- `sh dev/run-checks.sh costcoach` (costcoach, unit:costcoach-test, budget, tokenaudit, autocompact, options, undoall,
  unit:undoall-test): 8/8. Also passing: the budget group (cachewise, concise, unit: budget / cache / autocompact /
  concise / tokenaudit tests), hintcalm + unit:hintcalm-test, lazy, unit:boot-test (first screen 72 scripts / 29
  sheets), unit:appsearch-test, `node dev/lazy-manifest.js` (names, aliases, actions, keys ✓). On a machine busy with
  other streams, `options` failed once on its 300 ms wait for an instruction ("an instruction is added") and passed on
  the re-run; the coach's check needed to wait for an Undo's save to answer before the next click (fixed in the check).

## Risks / not done
- **Savings are estimates** from the week's own numbers: the replay assumes each Continue lighter offer is taken, the
  thinking multipliers and the Short share are assumptions (written above), and a different week behaves differently.
  The card says "estimated" on every fix.
- **Cache**: savings are counted in tokens, like the rest of Spending; a hot cache makes re-reads cheap in dollars, so
  the dollar saving of Continue lighter is smaller than its token saving (autocompact's own offer still weighs the
  cache before it shows).
- **Kinds of chat** come from the AI (a docked director = Lab director) and the message (mission / routine); an older
  reply without its user message counts as plain.
- **Thinking** that Claude didn't show (no kept text) can't be counted, so the Smart fix may be understated there.
- A trim needs tokenaudit's measure (`hub.tokenAudit`, ≤ 4 s); without it no tool fix is offered.
- Real Claude Code / Codex usage isn't available here: fake chats only.

## For the patch notes
- New: **🧭 Cost coach** in ⋯ AI setup › Spending — a look at where your tokens went in the last 7 days (by AI, by kind
  of chat, by cause) and the 3 changes that would have saved the most.
- Each change is a click on a setting you already have: Continue lighter, Let Smart decide, Short answers, turning off
  a tool you don't use, unpinning a swarm.
- The numbers come from your own chats this week, e.g. "your Lab chats re-read ≈ 480k tokens; Continue lighter at 40k
  would have saved ≈ 210k".
- Already lean? It says so with a ✓ instead of nagging.
- Nothing changes until you click, and every change has Undo (also Ctrl/⌘+Z).
- Once a week, only when one change would save at least a tenth of your week, a calm note says so.
- It runs on your computer and costs 0 tokens. Also `/cost-coach` in any chat.
- Caveat: savings are estimates from this week's numbers; a different week can differ.
