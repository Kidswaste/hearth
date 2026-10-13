# Spending: a simple weekly guard (round 30, budget)

A weekly token limit per AI, read from the meter's own numbers (token-stats.json, written after every reply: nothing
new is counted, nothing is added to any message). Files: `budget-core.js` (pure rules, Node-tested), `budget.js`,
`budget.css` (lazy group `budget`, loaded right after the first screen). Small hooks: one row in `options.js`, a
`hearth:activity` event + `{ budget: 1 }` link in `activity.js`, one line in the confirms of `tools/three-instant.js`,
`tools/three-lookmatch.js` and the crew plan in `tools/three-crew.js`.

## ⋯ AI setup → Spending (per AI)
1. **Spending** part at the end of ⋯ AI setup, for whichever AI the chips at the top pick.
2. **This week in plain words**: "This week: ≈ 1.2M tokens (≈ $3.40) · 85 replies · 62% of your limit" (Monday to today; ≈ $ only where the engine reports prices, i.e. Claude).
3. **Weekly limit**: No limit, or one of four round amounts around last week's use (each with its ≈ $ when known).
4. **Your own…** limit, typed in plain numbers ("2M", "800k").
5. A thin **bar** of the week against the limit (ember near it, red past it).
6. **Near it** (shown only with a limit): Warn me · Use cheaper answers · Ask before each message. Near = 80 %.
7. A one-line hint when "Use cheaper answers" is picked but the AI isn't on Smart (How hard it thinks).

## Near the limit
8. **Warn me**: a calm toast at 80 % ("Claude is at 84% of this week's limit…") with **This week**.
9. … and at 100 % ("reached this week's limit… Nothing is blocked.").
10. **A line in ◉ Activity** for each warning (◔); click it: the week at a glance.
11. Each warning **once a week** per AI (remembered across restarts; past 100 % in one go = one warning).
12. **Use cheaper answers**: near the limit Smart steps each message **one rung down** (Opus · medium → Sonnet · low, code on high → its own model on medium).
13. **Two rungs** past the limit (an everyday make → Haiku · low).
14. **Never below what a picture needs** (the middle model at least) or a Lab chat's tools need; **a Lab build keeps its chat's own model**.
15. **Your choices stay**: a model or effort you picked for the chat, "ask again, thinking harder", and a long chat's cache (stepping down would re-read it uncached) are never stepped down; Quick / Deep stay as you set them.
16. The reply's pick says so on hover: "…; lighter: near your weekly limit".
17. **Ask before each message**: the chat box asks "Send it anyway?" with the week's use and what this chat sends per message; Cancel keeps your words in the box.
18. Commands and lines waiting in the queue never ask.

## Costly actions say it first
19. **✦ "Ask the director to take it further"**: its cost confirm adds "This would pass your weekly limit for …" (or "already past").
20. **Look match → Ask the director**: the same line in its confirm.
21. **Crew plan**: the same line next to the crew's estimate, before Start.

## This week at a glance
22. One small window: the week's total, **each AI** with its bar and its "near it" choice.
23. **Biggest chats** used this week (click one to open it; what it sends per message now).
24. **Where it went**: chats, the Lab director, second opinions…
25. **Sent with every message**: each AI's tool sets × its replies this week ("Board tools · Claude ≈ 70k a week").
26. **One-click fix: turn tools off** ("Turn off Board tools for Claude: saves ≈ 70k a week"; screenshot, app window, Adobe and publishing tools too).
27. **One-click fix: start a big chat fresh** from a summary (when it re-reads ≥ 30k a message).
28. **One-click fix: let an AI on Deep think on Smart**.
29. Ways in: ⋯ AI setup → Spending → "This week at a glance…", the warning's toast, the Activity line, Ctrl/⌘+K "Spending: this week at a glance".
30. **Ask in chat**: `/spending` (each AI's week), `/spending week`, `/spending limit 2M` / `none`, `/spending near cheaper|ask|warn`.

30 upgrades.

## Tested
- `node dev/budget-test.js`: 45 checks (the week from Monday, sums and $, levels, would-pass, suggested limits, stepping down with floors and your picks, Astra, the glance and its fixes).
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/budget.js` (`sh dev/run-checks.sh budget`): real use from a fake reply; the 80 % toast + Activity line, once; cheaper answers reach the engine (runinfo: sonnet low near, haiku low past, a pinned model stays); the 100 % toast; would-pass lines; ask first (Cancel keeps the words, Send sends, commands don't ask); the Spending part (No limit hides "near it"); the glance and the board-tools fix; `/spending`. No page errors.
- `node dev/boot-test.js` (lazy group + tag), `node dev/router-test.js` unchanged.

## For the patch notes
- **Spending** in ⋯ AI setup: see each AI's use this week in plain words (≈ tokens, and ≈ $ for Claude), and set a weekly limit if you want one.
- Near the limit (80 %) you choose what happens: just a warning, cheaper answers (Smart picks a lighter model or less thinking), or a quick "send it anyway?" before each message.
- Cheaper answers never go below what a picture or a Lab build needs, and never change a model or effort you picked yourself.
- Warnings are calm: a toast and a line in ◉ Activity at 80 % and 100 %, once each a week. Nothing is ever blocked.
- Costly asks (crew, ✦ take it further, look match) tell you in the same confirm when they'd pass your limit.
- "This week at a glance" shows your biggest chats, what each AI sends with every message, and one-click fixes like "Turn off Board tools for Claude: saves ≈ 70k a week".
- Caveat: "biggest chats" ranks chats used this week by their whole size (the meter keeps chats as totals); $ shows only where the engine reports a price.
