# Continue lighter: calm, measured compaction for long chats (round 34, autocompact)

Every message re-reads the whole chat so far. Hearth already had ways out (🗜 Compact context, the 80k long-chat
banner, `/fresh`, a silent auto-compact at 110k, a "💡 re-reads N tokens of history" toast from 12k), but they fired
on fixed sizes, the compaction ran on the chat's own (expensive) model inside the long session, and one of them
compacted without asking. This stream replaces them with one decision made from real numbers, one calm line, and a
compaction that costs as little as possible.

## Measured (fake engines, 30-message chat)
`dev/checks/autocompact.js` (budget group) sends the same 30 director-like messages (≈ 3k tokens each: the ask plus what
came back) twice through the fake Claude, first with the offer off, then with it on and taken when it shows.
Input tokens each message re-reads:

| Message | 5 | 10 | 15 | 16 | 17 | 20 | 25 | 27 | 28 | 30 | **total (30)** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Before | 15.9k | 31.1k | 46.3k | 49.3k | 52.4k | 61.5k | 76.7k | 82.8k | 85.8k | 91.9k | **1,434k** |
| After | 15.9k | 31.1k | 46.3k | 49.3k ▸ offer | **9.9k** | 19.0k | 34.2k | 40.3k ▸ offer | **9.9k** | 15.9k | **739k (−48 %)** |

`node dev/autocompact-test.js` simulates the same with the cache counted (cache reads at 0.1×, the summaries' own cost
included, at the cheapest model's price):

| 30-message chat | offers taken | tokens re-read | full-price weight (after the cache) | last message |
|---|---:|---:|---:|---:|
| ≈ 1.5k tokens a message (plain chat with pastes) | 1 | 724k → 579k (−20 %) | 175k → 157k (−10 %) | 46k → 9.9k |
| ≈ 3k tokens a message (director turn) | 2 | 1,422k → 700k (−51 %) | 344k → 225k (−35 %) | 91k → 19k |

The gain grows with every message after the offer: a chat that goes on past 30 messages saves more. Fixed tokens per
message are unchanged (`dev/tokens-test.js`); the prompt stays byte-stable (`dev/cache-test.js` section 8).

## Upgrades
### The offer (decided from real numbers)
1. **One calm line under the reply** when continuing would cost clearly more than a compacted continuation:
   "This chat re-reads ≈ 48k tokens each message. Continue lighter? (keeps a summary, ≈ 3k)", with one button
   **🗜 Continue lighter**. Nothing happens unless you click; nothing is blocked; × dismisses it.
2. **It decides from what the chat really sends**: the last reply's context, the fixed part (measured from the chat's
   first reply), and what the summary + the kept exchanges would send instead (the "≈ 3k").
3. **Cache-aware** (cachewise): how much of recent messages the prompt cache served; with a hot cache the next ~3–12
   messages must save at least twice what continuing lighter costs once (the summary + one cache write), or no line.
4. **Topic change**: when your newest message shares almost nothing with the older history, it offers earlier (at 60 %
   of your size).
5. **Old history no longer talked about**: when the last exchanges don't refer to most of the older part, it offers at
   75 % of your size.
6. **No pointless offer**: when most of the context is the last exchanges themselves (a huge paste), no line.
7. **Once per growth step**: an ignored offer comes back only when the chat is half again as big; never for a chat
   you aren't looking at, never while it's still answering or while messages wait in the queue.
8. Hover the line: why now and the expected saving ("Next 8 messages ≈ 52k tokens lighter for ≈ 10k once").
### Continuing lighter
9. **The cheapest model at low effort writes the summary** (Haiku · low on Claude, Luna · minimal on Astra), as a lean
   one-shot run: no tools, no memory, a one-line role instead of the chat's prompt.
10. **A tight structured summary**: Goal · Decisions · Files and names · Open tasks · Where we stopped, under ≈ 300
    words, capped at ≈ 700 tokens (the oldest list lines go first). Your standing instructions are not repeated
    (they're in the system prompt already).
11. **The last 2 exchanges go word for word** after the summary, so the AI keeps the exact current thread.
12. **The summarizer reads only the older part** (the kept exchanges aren't paid twice), long pastes clipped in the
    middle, at most ≈ 30k tokens (the first message, your goal, always kept).
13. **A second compaction builds on the first** (the earlier summary + what came after it, never the divider).
14. **Free fallback**: if the cheap run fails or answers out of shape, the free local summary (context-core) is used, in
    the same shape.
15. **The whole old chat stays**: every message is still in the chat (and in 🔎 recall's search); a 🗜 divider
    "Continued lighter here · was 49k tokens per message · the last 2 exchanges kept word for word" opens the summary.
16. **Byte-stable**: the engine session restarts, so the system prompt and flags are exactly a new chat's and every
    later message resumes with the same bytes; the summary rides in the conversation, never in the prompt.
17. **A message sent while the summary is being written** is waited for, then the switch happens (its reply can't
    bring the long session back).
18. **🗜 Compact context** (chat menu, `/compact`, the meter's 🗜) now uses this cheaper path too.
### Never silent, fewer nudges
19. The old **silent auto-compact past 110k** no longer runs.
20. The **long-chat banner** (80k, three buttons) gives way to the line while the offer is on (it still shows when off).
21. The **"💡 re-reads N tokens of history" toast** gives way to the line while the offer is on.
### The setting
22. **⋯ AI setup → Spending → "Offer to continue lighter"**: Off · At about 25k · 40k (default) · 60k · 100k tokens,
    per AI, in the folded Spending part (no new fold, one row).
23. `/lighter` (alias `/continue-lighter`): `now` · `off` · a size (`/lighter 60k`).
### The saving, in the existing readouts (no new rows)
24. **The chat's context meter** shows "≈ 9.9k context" right after, hover: "(was 49k before continuing lighter)",
    and keeps the "was" on hover while it's still lighter.
25. **A reply's token line** (hover) after it: "Continued lighter: ≈ 10k instead of ≈ 40k per message (≈ 30k less)".
26. The toast after continuing: "Continuing lighter · next message ≈ 9.9k tokens instead of 49k".

26 upgrades.

## Files
New: `autocompact.js` (budget lazy group: decide / split / transcript / prompt / shape / run, the line, the Spending
row, `/lighter`; Node-testable), `dev/autocompact-test.js` (unit), `dev/checks/autocompact.js` (smoke, budget group).
Small edits: `native.js` (withContext carries the kept tail from `compact.tail`; 🗜 Compact routes to Autocompact; the
divider's words; the context meter's ≈ / was; no silent auto-compact once loaded; banner gives way; the last-reply mark
skips dividers), `budget.js` (one row line), `chat-cost.js` (the history tip gives way), `lazy-data.js` (+ the file, the
manifest regenerated), `dev/fake-common.js` (a structured summary for the summarizer's prompt), `dev/cache-test.js`
(section 8), `dev/run-checks.js` (unit + budget group).

## Tested
- `node dev/autocompact-test.js`: the decision (size, off, presets, topic change, the cache, a tail-heavy chat, a hot
  cache with few messages left, the kept exchanges, a second compaction, the fixed part), the summary shape (order,
  preamble, empty parts, bullets, the cap, a non-summary refused, the free one in shape), the summarizer input
  (byte-stable, no dates / ids, kept exchanges left out, ≈ 30k cap), the cheapest model, the 30-message simulations.
- `node dev/cache-test.js` (+ section 8), `node dev/tokens-test.js`, `node dev/boot-test.js`: pass.
- `sh dev/run-checks.sh budget options`: 7/7 (budget, budget-test, cachewise, cache-test, autocompact, autocompact-test, options).

## Risks / not done
- The fake engines' summary is scripted; a real Haiku / Luna summary's quality isn't seen here (out of shape → the free
  summary is used). On Astra the cheapest model name comes from Smart's plan (`gpt-6-luna`).
- The price ratios (cheapest model ≈ 0.2× input, output ≈ 5×, cache 0.1× / 1.25×) are estimates; they only decide when
  the line shows, never what is sent.
- With the offer Off, the old 110k auto-compact stays off too once the budget group is loaded (never silent); Claude
  Code compacts by itself near its window limit.
- A chat compacted this way keeps the summary + kept exchanges in its first message, capped at 24k characters of kept
  text like the existing compact path.

## For the patch notes
- Long chats get lighter on request: when a chat re-reads a lot with every message, one calm line under the reply
  offers "Continue lighter?" with the size now and after. Nothing happens unless you click.
- It shows only when it really pays: it counts the prompt cache, how much of the old history still matters, and
  whether you changed topic.
- Continuing lighter uses the cheapest model at low effort for a short summary (goal, decisions, files, open tasks), and
  keeps your last two exchanges word for word.
- The whole chat stays: scroll up or search it with 🔎 like before; a 🗜 divider shows where it got lighter.
- In a 30-message test chat, the tokens re-read dropped by about half (the last message: 92k → 16k).
- Set the size (or turn it off) in ⋯ AI setup → Spending → "Offer to continue lighter" (default: about 40k tokens).
- No more silent compaction, and fewer nudges: the line replaces the long-chat banner and the history tip.
- The context meter and a reply's token line (hover) show what you saved.
