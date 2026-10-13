# Cache-wise chats: the prompt cache keeps hitting (round 32, cachewise)

Both engines keep a prompt cache: when a message starts byte-for-byte like the previous one (the tools, Hearth's
system prompt, then the chat so far), that start is read back at about a tenth of the price (Claude: cache reads ≈
0.1×, cache writes ≈ 1.25×; Codex reports `cached_input_tokens`). Anything that changes the start makes the next message
re-read the whole chat at full price. This stream hunted down what changed the start without the owner doing anything,
moved what the owner does change to the end, shows what the cache saves, and says it in one line when a change of the
owner's will cost one re-read.

## Measured
`node dev/cache-test.js` (in the `unit` group) proves the same chat sends the same bytes; the before → after below is a
20-message chat simulated on the old and new `engines.js` (the AI saves two facts with `<remember>`, one message carries
a picture; context +1.5k tokens a message for a plain chat, +4k for the Three Director). A "reset" is a message whose
start differs from the one before, so the whole chat so far is re-read without the cache.

| Chat (20 messages) | resets before → after | tokens re-read uncached before → after |
|---|---:|---:|
| Plain Claude | 4 → 1 | 55,500 → 13,500 (−76 %) |
| Three Director | 4 → 1 | 148,000 → 36,000 (−76 %) |

The one reset left is the picture's own message (it needs the Read tool); the message after it no longer resets.

When the owner adds an instruction mid-chat on Astra (Codex caches by prefix), the part of the prompt still cached:

| Astra prompt | cached prefix before → after |
|---|---:|
| Plain Astra | 51 → 107 tokens (of 139) |
| Three Director on Astra | 17 → 899 tokens (of 932) |

Fixed tokens per message are unchanged (`node dev/tokens-test.js`: every kind of AI inside its budget; the director's
lean tool list inside `dev/director-mcp-test.js`).

## Upgrades
### Steadier prompts (nothing to do, every chat)
1. **A saved fact no longer resets the chat's cache**: memory is frozen per chat session while it only grows; a fact the
   AI saves mid-chat (or another chat saves) reaches every new chat, and the AI that saved it already has it in this
   chat. An edited or deleted fact still applies at once. The frozen notes are saved with the chat, so a restart keeps them.
2. **A picture resets the cache once, not twice**: once a chat sent a picture, the picture-reading tool stays for the
   rest of that chat (switching it off again for the next message made it re-read everything a second time).
3. **The parts you change are at the end of the prompt**: tool guides, habits and the director's how-to come first;
   personality, standing instructions, files on this computer, connected apps and saved memory last. On Astra a changed
   instruction leaves everything before it cached.
4. **The Three Director's role line no longer changes with a personality** (the personality sits in the tail), so a
   personality change keeps the whole director guide cached on Astra.
5. Nothing in any prompt depends on the time, a counter, a random id or the order of an object's keys (tested).
### Seeing what the cache saves
6. **A reply's token line** (hover the ⚡ %): "≈ 596 saved by the cache" under the cache reads / writes.
7. **The meter**: the cache-hits tile's hover says what the cache saved today; the meter panel's cache-hits ring and
   "This chat" line say it for the range and the chat.
8. **`/cache [today|week|month|all]`** ends with "≈ N tokens saved by the cache".
9. **⋯ AI setup → Spending** ("This week: … · ≈ 120k saved by the cache") and **This week at a glance** (its header).
### A calm note when a change costs one re-read
10. **Changing personality, instructions, what the AI can use, its habits, its model or how hard it thinks mid-chat**
    (⋯ AI setup) puts one line in the open chat: "↻ Its personality changed mid-chat: the next message re-reads the whole
    chat (≈ 24k tokens) once without the prompt cache. That's fine; a new chat starts light." Never blocks anything.
11. A change made another way (a command, the model menu) gets the same line with the message that pays for it, once.
12. Only for chats worth re-reading (≈ 4k tokens of context and up); once per change; a look-only change (colour, icon)
    or Smart's own per-message pick never shows it.
### Guards
13. `node dev/cache-test.js` (unit group): identical bytes for the same chat on every kind of AI (plain, director,
    Astra, board tools, file access), a changed instruction / personality / file access only changes the tail, memory
    frozen while it grows and applied when edited, the picture tool kept, the saved-by-cache math, the note.
14. `dev/checks/cachewise.js` (budget group, fake engines): the reply's token line, the note right after a personality
    change in ⋯ AI setup, no second note after sending, the note at send for a change made elsewhere, `/cache`, the week
    at a glance.

## Files
`engines.js` (buildPrompt head / tail, `memoryFor`, sticky Read in `claudeToolArgs`), new `cachewise.js` (budget lazy
group: saved math, setup signature, the note; `Native.hooks.options`), `meter.js` / `budget-core.js` / `budget.js`
(saved figures), `options.js` (one hook line after a save), `lazy-data.js` (the file in the budget group),
`dev/cache-test.js`, `dev/checks/cachewise.js`, `dev/run-checks.js`.

## Not done (on purpose) / risks
- **Model / effort changes by Smart** (router.js) are left alone: it already never steps down on a big context; it can
  still step up (another model, or more effort, re-reads the chat once). Holding a big chat on its tier both ways would
  save more but could keep a hard message on a light model.
- **Claude Code's own part** of the request (its base prompt pieces, the order it lists MCP tools when several servers
  connect at once) isn't Hearth's to control; the flags and Hearth's prompt are byte-stable, which is what Hearth can do.
- **A frozen memory**: a fact saved by another chat reaches this chat only in its next session (a new chat, a compact,
  or a lost session); the AI that saved a fact has it in its own history.
- **Prompt order changed**: the personality and instructions now come after the tool guides (models follow them the
  same; the personality is no longer the first line).
- The "saved" figure is an estimate in full-price tokens: cache reads × 0.9 − Claude's cache writes × 0.25.

## For the patch notes
- Long chats cost less: the AIs' prompt cache now keeps hitting message after message, so the chat so far is read at
  about a tenth of the price far more often (in a typical 20-message chat, about three quarters fewer full-price re-reads).
- When the AI remembers something new mid-chat, the chat no longer starts over at full price; new chats get the fact.
- Sending a picture costs one full re-read instead of two.
- You can see what the cache saved: hover a reply's ⚡ %, the meter, `/cache`, and ⋯ AI setup → Spending.
- Changing an AI's personality, instructions or tools mid-chat now shows one calm line saying the next message re-reads
  the whole chat once; nothing is blocked, and a new chat starts light.
- On Astra, a new instruction keeps almost all of its instructions cached.
