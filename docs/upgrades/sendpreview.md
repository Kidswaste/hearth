# Send preview (round 44, sendpreview): what a message will cost, before it goes, only when it matters

Token frugality is the owner's first rule, but until now the cost of a message showed only after it was sent: the
reply's token line, the meter, the cost coach a week later. The expensive cases look harmless in the chat box. A long
chat after a coffee break costs the same words, but the prompt cache has expired, so the whole chat is re-read at full
price. A picture you clicked "whole" on goes at 4K. A pinned 🐝 Swarm runs several AIs. A chat handed over with the
whole chat sends every message again. Hearth now works this out while you type, on this computer and for 0 tokens.
When the message costs clearly more than usual, a tiny **"≈ 52k"** sits next to Send. Pointing at it says why in plain
words and offers the **one best cheaper way**, in one click. Otherwise nothing shows.

## How the estimate is made (`sendpreview-core.js`, Node-tested)
These parts are counted in the same units the engines report (input including what the cache serves, plus output):
- **Fixed part**: the instructions and tool definitions. This is tokenaudit's measure (`hub.tokenAudit`, ≤ 1 call per AI
  per 10 min). Before that measure exists, the chat's first plain reply is used, then a 1k default.
- **The chat the engine re-reads**, per native.js:
  - An engine session re-reads every message in it (counted from the last Continue lighter or handoff, which started
    it), including pictures it saw.
  - Without a session, the message carries what `withContext` sends instead: the handoff brief or the whole chat, the
    lighter summary plus the kept exchanges, or the earlier conversation capped at 24k characters.
- **The cache** (cachewise): what the last message already sent is likely read from the prompt cache. That means
  everything except the last reply, at this chat's measured hit rate (90 % until measured), and it costs about a tenth
  of the price. The cache counts as cold in three cases: ≥ 5 minutes since the last message (both engines' caches
  expire), a new session, or Smart picking another model or effort than the last reply (each keeps its own cache).
- **Your words**: ≈ characters / 4.
- **Attachments**: attachlean's chip cost for each one (whole when you clicked it whole; "at 1568×882 px").
- **Mission**: swarmlean's estimate for the ◎ mission. It covers this chat's own reply where the mission has one.
- **Its answer**: this chat's median answer, scaled by the effort Smart picks against the usual one (low 0.6×,
  high 1.5×, xhigh 2.2×).
- **Calibration**: × this AI's correction factor, learned from real usage.

**When it shows** (`should`) — either of these, and never for a command, while it answers, or for an empty box:
- ≥ 3× this chat's median message (input + output of its last 12 replies, at least 2 of them) and ≥ 8k, or
- ≥ 30k tokens at full price (what the cache won't cover).

A long chat with a warm cache is big but usual, so nothing shows. The same chat 12 minutes later re-reads everything at
full price, so the hint appears.

**The one cheaper way** (`cheaper`): each candidate is costed with the same estimate and one part changed. It must save
≥ 3k and cost ≤ 60 % of sending as it is. The ways that lose nothing come first: a picture at 1568 px, a file trimmed
to what you ask about, the short brief. Then the biggest saving. Continue lighter first ranks above a new chat because
it keeps the thread, unless your message changed topic (autocompact's own test).

## Measured (smoke check, fake engines)
| Case | Estimate | Cheaper way | Real, after the click |
|---|---:|---|---:|
| 30-exchange chat, last message 15 min ago (the cache expired) | ≈ 92k ("≈ 92k" next to Send) | Continue lighter first — ≈ 9.9k | the message read **6,853** input tokens instead of **120,900** |
| Short chat + a 200 KB file clicked "whole" | ≈ 38k | Send only what you ask about from render.log — ≈ 1.5k | sent **989** tokens of the file's 50,573 |
| "Make the second one a bit warmer please." in a short chat | ≈ 1.1k (median 740) | — (no hint) | — |
| Calibration: a plain message | 1,080 | — | engine reported 801 → factor 1 → 0.74; the next estimate uses it |

## Upgrades
### The hint
1. **"≈ 52k" next to Send**, only when the message will cost much more than usual. It's gold, and orange when most of it
   is at full price. It isn't there at rest, and the chat box keeps ◎ ＋ Send in chatcalm's order.
2. **It decides from this chat's own numbers**: ≥ 3× its usual message (and ≥ 8k), or ≥ 30k tokens at full price.
3. **It knows when the cache has expired**: about 5 minutes after the last message, the chat is re-read at full
   price. If you pause over a draft, it looks again the moment the cache would expire.
4. **It never blocks**: Send and Enter send as always.
### The explanation (point at it, or Tab to it and press Enter)
5. **One headline**: "≈ 92k tokens with this message, nearly all at full price · about 6× this chat's usual (≈ 15k)".
6. **Its instructions and tools**, measured as in Where its tokens go.
7. **Re-reading this chat**, with what the cache likely covers ("≈ 45k of it likely from the cache, at about a tenth of
   the price"). Otherwise it says why it won't: "the cache expired (last message 15 min ago)", "a new session",
   "Sonnet · low this time: its cache is separate".
8. **A handoff** shows as "The handoff brief" or "The whole chat, handed over"; after Continue lighter, "The lighter
   summary + what came after".
9. **Each attachment** with what it will cost ("whole, at full size", "at 1568×882 px").
10. **A ◎ mission** (Swarm, Debate, Lab variations…) with its other AIs' estimate.
11. **Its answer**, with Smart's pick ("Smart: Opus · high").
12. **Adjusted to this AI's real use (× 0.74)**: how many replies it learned from.
### The one cheaper way (one click; it then sends)
13. **Continue lighter first — ≈ 6k**: the cheapest model writes the summary (autocompact), then your message goes.
14. **Send shot.png at 1568 px, not full size** / **Send only what you ask about from server.log**: an attachment you
    clicked "whole" goes lean again.
15. **Ask on a new chat**: your message and attachments move to a new chat with this AI. It's offered when the topic
    changed, or when Continue lighter can't help.
16. **Just Claude, without 🐝 Swarm**: a once-only mission dropped for this message. A pinned 📌 one is never undone
    from here.
17. **Send the short brief instead**: a chat handed over with the whole chat goes back to the brief.
18. **Send anyway**, right beside it. A toast after a cheaper send says what it saved ("≈ 9.9k tokens instead of ≈ 92k").
### Learning, words, access
19. **Calibrated per AI**: what the engine reports after a plain message (input + output) moves a small correction
    factor for that AI. The first replies move it most, then a running mean, within 0.3–6×. Missions, commands and
    queued messages never teach it. It's saved in kv `send-preview` through DataSafe, so an unreadable store is never
    written over.
20. **`/send-preview [words]`** (alias `/cost-preview`): the same breakdown in the chat, for these words in this chat
    (or what's in the chat box).
21. **Screen readers and keyboard**: the hint is named ("This message will cost about 92k tokens, more than usual; a
    cheaper way: Continue lighter first. Show why"). The explanation is a named dialog. Esc closes it and the focus
    goes back to the hint.

21 upgrades.

## Light
- **Typing does nothing but reset a timer**. The estimate runs 350 ms after the last key, reads the draft once, and
  writes the DOM only when the text changes.
- **No new always-visible control**: the hint exists only while it matters (`hidden` otherwise). The explanation is
  built on demand and removed on close.
- **Its own lazy group** (`sendpreview`, after `budget` and `attachlean`, loaded after the first screen). The first
  screen stays at 72 scripts / 29 sheets (`unit:boot-test`).
- **Prompts and engines are untouched**: nothing reaches an engine. The estimate is local, and the cheaper ways use the
  existing paths (Autocompact.run, attachlean's whole switch, Missions.set, Native.newChat, the handoff record).

## Files
New: `sendpreview-core.js` (pure: stats, history, estimate, should, cheaper, variant, calibrate, store shape, words),
`sendpreview.js` + `sendpreview.css` (the hint, the explanation, the cheaper ways, calibration, `/send-preview`),
`dev/sendpreview-test.js` (UNIT), `dev/checks/sendpreview.js` (smoke, fake engines).

## Edits outside the lane (small, additive)
- `lazy-data.js`: the `sendpreview` group (manifest regenerated with `node dev/lazy-manifest.js`: names, aliases,
  actions, keys, apps, tools, dups ✓).
- `index.html`: `sendpreview` added to the existing `lazy-at.js#…` tag (no new script tag).
- `dev/run-checks.js`: `sendpreview-test` in UNIT, and a `sendpreview` group.
- No edits to native.js, router.js, missions.js, attachlean, autocompact or handoff. The hint hooks in through
  `Native.hooks` (send / event / chips / render / newChat), one capture listener for the chat box's input and submit,
  and the public APIs of those modules.

## Tested
- `node dev/sendpreview-test.js`: 50 checks.
  - The parts add up (total, full price, cached).
  - History in a session, after Continue lighter, with a brief or the whole chat, with no session.
  - The cache warm / expired at exactly 5 min / another model / never hitting.
  - Attachments lean vs whole; a whole log → the 30k rule; missions replace the own reply.
  - Smart's effort; when it shows (small chat, 4K at full size, the 8k floor, one reply isn't "usual", a long warm
    chat → nothing, the same chat 12 min later → the hint).
  - The cheaper way (Continue lighter, a new topic → new chat, too small a saving → none, lossless first).
  - Calibration (first reply, running mean, an outlier bounded, no learning from nothing, estimate lands near real,
    missions unscaled).
  - The store's shape and trim; the words.
- `dev/checks/sendpreview.js` (fake engines): every case in the table above, plus pointing at the hint with a real
  mouse move opens the dialog, its rows, Send anyway, Esc returns focus, ◎ ＋ Send unchanged, `/send-preview`, and
  the hint gone once sent. No page errors.
- `sh dev/run-checks.sh sendpreview` on a machine at load ≈ 26 on 4 CPUs (several streams' checks at once).
  - **Pass**: sendpreview, unit:sendpreview-test, attachlean, autocompact, lazy, unit:boot-test (72 scripts / 29
    sheets).
  - **budget**: fails "a line in Activity" and "the same warning never twice", the two steps attachlean's doc already
    lists as failing on the unchanged base.
  - **a11y**: its audit says `"pass": true`, but the run counted as failed on a console error, "WebGL context could
    not be created … context loss" (the Lab's preview under that load).
  - **chatcalm**: fails differently on each run (right-click rows 0, pointing at a reply). It fails the same way with
    the `sendpreview` group taken out of index.html, so this isn't from this change.
  - **inputlatency**: the first run went over on `enter-send` (61.7 ms > 50). The calibration snapshot at Enter was
    doing the whole estimate inside the key handler. It now only records the draft, and works the estimate out when
    the reply is in. On the re-run `enter-send` was within budget; three other stretches went over under the load
    (menu, chat-click, Lab slider), none of which runs this code.
- Measured in a 400-message chat (≈ 400k characters) with a 30,000-character draft (`SendPreview.refresh`):
  - Before the memo: ≈ 11 ms, then ≈ 8 ms (most of it autocompact's decision).
  - Now: **≈ 0.2 ms median**. The chat's part, and what Continue lighter would leave, are worked out once per change
    of the chat, in an idle moment after the pause.
  - The input listener: ≈ 0.1 ms.
- `node dev/datasafe-scan.js`: pass (no new findings).

## Risks / not done
- **It's an estimate.** Replies that call tools add up every step's input, so a director chat's real usage is several
  times its context. The per-AI factor learns that ratio, but one AI with both plain and tool-heavy chats gets an
  average. The 3×-median rule compares against that chat's own real replies, so it stays fair.
- **The cache TTL is taken as 5 minutes** for both engines. Real caches can live longer or be evicted earlier; the
  hint says "likely".
- **Ask on a new chat** moves the draft and attachments, not the chat's style chips or a pinned model.
- **A pinned 📌 mission** is never offered away (that would undo a standing choice). The cost coach's Unpin covers it.
- **The fixed part** comes from tokenaudit's measure, which leaves out the engines' own base prompts. Calibration
  absorbs the difference.
- **The first look at a very long chat** after each reply reads all of its messages once (≈ 30 ms for 400 messages
  under load). It runs in an idle moment after you pause, never inside a key press.
- Not run on real Claude Code / Codex (fake engines only).

## For the patch notes
- **New: a send preview.** When a message is about to cost much more than usual, a small "≈ 52k" appears next to Send.
  Most of the time nothing shows.
- Point at it to see why in plain words: re-reading the chat (and whether the prompt cache still covers it), your
  attachments, a mission's other AIs, its answer.
- It offers the one best cheaper way in one click, then sends: "Continue lighter first — ≈ 6k", "Send shot.png at
  1568 px, not full size", "Ask on a new chat", "Just Claude, without 🐝 Swarm".
- It knows the prompt cache expires about 5 minutes after the last message. A long chat after a break is the usual
  surprise, and now you see it before sending.
- It never blocks: Send, Enter and "Send anyway" always send.
- It learns from what each AI really reports after a message, so its numbers get closer over time.
- Worked out on your computer, 0 tokens. Also `/send-preview` in any chat.
