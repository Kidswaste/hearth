# Lighter history (round 50, historylean): long chats stop re-reading their whole past after a break

Every message re-reads the chat's whole history: every word, but also every old tool result (whole file reads,
console dumps, layer lists, the Lab's screenshots), every picture, every version of the code, every long answer the
owner already acted on. Each tool step of a reply re-reads it again. In a long Lab director chat that history is now
the biggest token cost, far above the fixed prompt (≈ 2.1k) that rounds 31–46 kept cutting.

## What the engines allow (checked on Claude Code 2.1.301 here)
- **Neither engine lets Hearth edit a session.** Claude Code keeps the history in its own session (`--resume <id>`),
  Codex in its thread; there is no supported flag or API to drop old tool results from them. Rewriting their files on
  disk would be unsupported (and would break the prompt cache anyway). So inside a running session nothing changes.
- **Claude Code clears some of its own old tool results** ("time-based microcompact"), but only for its built-in tools
  (Read, Bash, Grep…) and only when the server hints at it — never for Hearth's tools (three_*, chat_*, board…).
- **The prompt cache's life**: Claude Code picks it itself — **1 hour on a Claude subscription, 5 minutes on an API
  key** (its `promptCacheTtl` setting's own description) — and says which in every reply's usage
  (`cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens`). Codex's cache lives about 5–10 minutes,
  at most an hour. Hearth so far assumed 5 minutes for both (sendpreview), which is wrong on a subscription.
- **What Hearth does control**: whether the next message resumes the session or starts a fresh one, and what that
  fresh one's first message carries (the same path Continue lighter, handoffs and lost sessions already use).

So the lever is **when** to start fresh, and **what** to carry. Once the cache has expired, the next message re-reads
the whole session at full price anyway: that is the moment a fresh session with a lighter history costs only that
lighter history at full price, breaks no warm cache, and every later message re-reads less.

## Measured
### Simulated long chats (`node dev/historylean-test.js --table`)
Synthetic chats sent through a model of each engine's session and prompt cache (cache reads 0.1×, Claude's cache
writes 1.25×; the engine compacts itself past 160k), once as today (always resume) and once with the lighter fresh
start. Messages every 2 min, a 15-minute break every 7th, a 3-hour break every 20th; Claude on a subscription (1-hour
cache). Profiles: **code** (a file read + a command a reply, code in most answers, a file every 4th ask), **pictures**
(a 1568 px screenshot with every ask), **Lab director** (five tool steps a reply: eval, edit, a small screenshot, read
code, sliders). Tokens per message = every model call's input (what the meter's usage shows), averaged over the chat;
"after the cache" = the same in full-price terms.

| AI · chat | exchanges | re-read per message (before → after) | after the cache (full-price weight) | cache share before → after | fresh starts |
|---|---:|---:|---:|---:|---:|
| Claude · code | 40 | 218k → **175k** (−20 %) | 30.2k → **22.7k** (−25 %) | 86 % → 87 % | 1 |
| Claude · code | 100 | 246k → **188k** (−23 %) | 33.6k → **24.3k** (−28 %) | 86 % → 87 % | 4 |
| Claude · code | 300 | 261k → **194k** (−25 %) | 36.0k → **25.0k** (−31 %) | 86 % → 87 % | 14 |
| Claude · pictures | 40 | 107k → **61.8k** (−42 %) | 14.8k → **9.0k** (−39 %) | 86 % → 85 % | 1 |
| Claude · pictures | 100 | 151k → **71.9k** (−52 %) | 22.3k → **10.3k** (−54 %) | 85 % → 86 % | 4 |
| Claude · pictures | 300 | 170k → **76.6k** (−55 %) | 24.8k → **10.9k** (−56 %) | 85 % → 86 % | 14 |
| Claude · Lab director | 40 | 480k → **276k** (−43 %) | 55.4k → **32.3k** (−42 %) | 88 % → 88 % | 1 |
| Claude · Lab director | 100 | 486k → **307k** (−37 %) | 56.3k → **35.7k** (−37 %) | 88 % → 88 % | 4 |
| Claude · Lab director | 300 | 513k → **322k** (−37 %) | 60.6k → **37.3k** (−38 %) | 88 % → 88 % | 14 |
| Astra · code | 40 | 218k → **78.8k** (−64 %) | 36.1k → **13.1k** (−64 %) | 83 % → 83 % | 5 |
| Astra · code | 100 | 246k → **82.1k** (−67 %) | 40.9k → **14.0k** (−66 %) | 83 % → 83 % | 17 |
| Astra · code | 300 | 261k → **86.8k** (−67 %) | 42.8k → **14.5k** (−66 %) | 84 % → 83 % | 50 |
| Astra · pictures | 40 | 107k → **36.9k** (−66 %) | 19.2k → **7.0k** (−63 %) | 82 % → 81 % | 4 |
| Astra · pictures | 100 | 151k → **42.2k** (−72 %) | 28.8k → **8.2k** (−71 %) | 81 % → 80 % | 13 |
| Astra · pictures | 300 | 170k → **44.2k** (−74 %) | 31.3k → **8.5k** (−73 %) | 82 % → 81 % | 41 |
| Astra · Lab director | 40 | 480k → **126k** (−74 %) | 62.2k → **17.3k** (−72 %) | 87 % → 86 % | 5 |
| Astra · Lab director | 100 | 486k → **147k** (−70 %) | 63.5k → **20.2k** (−68 %) | 87 % → 86 % | 16 |
| Astra · Lab director | 300 | 513k → **158k** (−69 %) | 67.0k → **21.5k** (−68 %) | 87 % → 86 % | 49 |

**Cache effect**: the cache's share of what is read stays the same (≈ 81–88 %): fresh starts happen only when the
cache is already gone, so none of the saving is bought with lost cache hits. Claude on a subscription starts fresh
only after breaks over an hour (its cache stays warm through coffee breaks: resuming is right there); Astra's cache is
gone after ≈ 10 minutes, so it starts fresh more often and saves more. On a Claude API key (5-minute cache) Claude
behaves like the Astra rows. Where most of the history is the owner's and the AI's own words (code answers), the saving
is smaller; where it is tool results and pictures (the Lab director, screenshots), it is largest.

### End to end (fake engines, `dev/checks/historylean.js`)
What the engine was really sent (the fakes' `seenLog`) and what it reported:

| Case | before (last reply re-read) | the fresh start sent | its reply re-read |
|---|---:|---:|---:|
| Claude, 6 messages with tool results (≈ 20k each), a 10-minute break (5-minute cache) | 120,961 | **417** tokens of history + words | **1,136** |
| Astra, 5 messages like it, a 20-minute break | 104,415 | **307** | **4,522** |

A warm message (no break) resumed the session with nothing re-sent; the message after a fresh start resumed the new
session; with "Keep the full history here" the next break resumed the old session.

## Upgrades
### The lighter fresh start (automatic, only when it pays)
1. **After a break past the prompt cache's life, a long chat goes on in a fresh session with a lighter history**
   instead of re-reading its whole old session at full price. Nothing to click; nothing in the chat changes.
2. **Every word stays**: each of your messages and each answer is in it, oldest shortest; the last 2 exchanges go word
   for word; the first message (your goal) is always there.
3. **Old tool results are one-line stubs** ("[used three_eval ×3, three_read_code; results not sent again]"): the AI
   re-runs a tool for the current state.
4. **Pictures are stubs** ("[picture: frame-12.png, not sent again]"), in old and recent exchanges alike.
5. **Attachments are stubs** with their size ("[attached: render.log (≈ 1.5k tokens), not sent again]").
6. **Earlier versions of the same code are stubs** ("[code (js), 84 lines: an earlier version, a newer one follows]");
   the newest version of each file is kept whole.
7. **Older long answers are shortened** to their start and end, saying how much was left out.
8. **Capped at ≈ 12k tokens**: in very long chats the oldest messages go first (the goal stays), and the history says
   how many were left out.
9. **Any earlier message is one call away**: Claude (with the chat tools) is told `chat_do {op: "earlier", query}`
   returns it word for word; Astra without them is told to ask you.
10. **It builds on what came before**: after Continue lighter, the summary + what came after; after a handoff, the
    brief + what came since.
### Weighing the cache (never break a warm one for a small gain)
11. **The cache's life is read from Claude Code itself**: 1 hour on a subscription, 5 minutes on an API key (each
    reply's usage says which); unknown counts as an hour, so a cache that may be warm is never broken.
12. **Astra's cache** counts as warm up to 5 minutes, likely at 10, unlikely up to an hour, gone after.
13. **It decides from real numbers**: what resuming would re-read (the last reply's context; Claude's sum over its tool
    steps divided back), the lighter history's size, the fixed part, how many model calls a reply makes, and the next
    few messages; full-price input vs cache reads (0.1×) and Claude's cache writes (1.25×).
14. **A warm cache is never broken by itself**: the gain would hang on a guess of how many messages follow, and the
    tool results it drops are often what the AI needs right then. Continue lighter stays the offer for that case;
    `/history-lean now` asks for a fresh start anyway.
15. **Never when it can't help**: a chat under ≈ 20k tokens, a history already lean (the lighter one must be ≤ 70 % and
    save ≥ 8k), a message with an attachment sent as "same as before" (it points into the old session), a chat whose
    whole history you asked to send, or a compaction in progress.
### What you see
16. **One quiet line** in the chat: "↻ Fresh start after the break: ≈ 9k tokens sent instead of re-reading ≈ 48k.
    Earlier tool results and pictures stay in the chat; they weren't sent again." Hover: why.
17. **"Keep the full history here"** on that line: this chat resumes its whole session from the next break on.
18. **The reply's token line** (hover) says it too: "Fresh start after the break: ≈ 9k sent instead of re-reading ≈ 48k".
19. **Usage window → How to save** (and 🧭 Cost coach's ✓ list): "Claude: a lighter history after breaks (3 fresh
    starts, ≈ 140k tokens not re-read) ✓".
20. **The send preview counts it**: after a break it estimates the lighter start ("The lighter history (a fresh start
    after the break)") instead of a full-price re-read, and it uses the engine's reported cache life (an hour on a
    subscription) instead of always 5 minutes, so it no longer warns about an "expired" cache that is still warm
    (unknown: its own 5 minutes, a warning errs early).
### Settings and words
21. **One setting for both**: ⋯ AI setup → Spending → "Offer to continue lighter: Off" also keeps the whole history
    after breaks (its hover says so). No new setting.
22. **`/history-lean`** (alias `/lighter-history`): what the next message would do and why (the cache's life, the
    last reply's age, the lighter size, how many stubs); `now` asks for a fresh lighter start with the next message;
    `off` / `on` for this chat.

22 upgrades.

## Files
New: `historylean-core.js` (pure: the cache's life, warmth, a reply's context, the lighter history, the decision,
the chat's numbers, the words, the simulator), `historylean.js` (lazy group `historylean`, tier use, after handoff:
the send hook, the line, the token hover, `/history-lean`), `dev/historylean-test.js` (UNIT, budgets, `--table`),
`dev/checks/historylean.js` (smoke, fake engines, budgets; group `historylean`).

## Edits outside the lane (small, additive)
- `native.js`: one line in `withContext` (the lighter history while it is the chat's newest start).
- `engines.js`: Claude's usage carries `ttl: '1h' | '5m'` from `cache_creation` (one line + comment).
- `handoff.js`: `chat_do earlier` also answers for a chat that went on lighter (one line).
- `sendpreview.js` / `sendpreview-core.js`: the estimate uses the lighter start after a break and the engine's cache
  life (`ttl`), and names it; the expiry timer uses that life.
- `costcoach-core.js`: a record keeps the fresh start's saving; one ✓ line. `usagelimits.js`: How to save always
  shows that ✓ line when it happened.
- `autocompact.js`: the Spending row's hover mentions it.
- `lazy-data.js` (+ the group, manifest regenerated), `index.html` (`historylean` added to an existing lazy-at tag:
  no new script), `dev/run-checks.js` (UNIT + group), `dev/fake-claude.js` / `dev/fake-codex.js` / `dev/fake-common.js`
  (`toolbytes:N`; the fake Claude reports a 5-minute cache like an API key).
- Nothing in codex-server.js or the Astra modules; nothing in any prompt, flag or tool list (`unit:cache-test`,
  `unit:tokens-test`).

## Tested
- `node dev/historylean-test.js` (UNIT): 86 checks: the lighter history (goal kept, the message last, tool lines, picture
  / attachment / earlier-code stubs, the newest code whole, the last exchanges word for word, older answers shortened,
  how to fetch earlier with / without the chat tools, byte-stable, no dates, the ≈ 12k cap with the goal kept, after
  Continue lighter / a handoff), the cache's life and warmth per engine, a reply's context, the decision (cold, warm
  mid-task, warm with a huge history, small, already lean, off, blocked, forced, Astra 3 / 20 min, Claude 1 h vs 5 min),
  the chat's numbers (blocked by a "same as before" attachment, no session, the whole chat asked), and budgets on the
  18 simulated chats (and no fresh start without a break).
- `dev/checks/historylean.js` (smoke, fake engines): 20 steps, the table above (budgets: ≤ 2,500 tokens sent, the
  next reply ≤ 30 % of before), the line, Keep the full history here, `/history-lean`, chat_do earlier, the cost coach
  line. Passed.
- Targeted: historylean, autocompact, handoff, cachewise, sendpreview, usagelimits, lazy, the promptdiet group
  (tokenaudit, cachewise, directorlean, concise + units), unit: boot-test, cache-test, tokens-test, promptdiet-test,
  autocompact-test, handoff-test, sendpreview-test, costcoach-test, usagelimits-test: pass. `node dev/lazy-manifest.js`
  (rewritten, names / aliases / dups ✓), `node dev/datasafe-scan.js`, `node dev/errorcalm-scan.js`: clean.
- First run: cachewise and sendpreview failed because a warm cache could still be broken for a big gain (the
  cachewise check's forced 24k chat got a second line) and an unknown cache life moved the send preview's 5 minutes to
  an hour; both fixed (a warm cache is never broken by itself; unknown keeps the preview's 5 minutes), then both passed.
- access-chat is flaky here on its badge steps: it failed on "the badge shows the level" in the first batch, passed
  alone, then failed on "/access off: no badge" in the promptdiet group and again alone. This change touches nothing
  of chat access (the access badge / settings); not chased further.

## Risks / not done
- **The AI loses old tool results** in a fresh start: it re-runs a tool (the Lab's current state is usually what it
  needs anyway) or asks for an earlier message. A fresh start never happens while the cache is warm.
- **Claude's reply-level usage** sums its tool steps; the context is that sum divided by the steps (an estimate).
  Codex reports it exactly.
- **Unknown cache life counts as an hour** on Claude (safe on a subscription); Claude Code reports it with each reply,
  so this only applies to chats from before this update.
- **The fixed part** (prompt + tools) comes from the session's first reply, capped at 5k (that reply's own tool results
  are in it); an over-estimate only makes the line's "sent" figure larger.
- **Inside a running session nothing is trimmed**: neither engine supports it. Long working sessions without breaks
  still grow until Continue lighter (offered as before) or the engine's own compaction.
- The simulator's profiles and break pattern are assumptions; the end-to-end numbers are from the fake engines, not real
  Claude Code / Codex runs.

## For the patch notes
- Long chats are much cheaper after a break: once the AI's prompt cache has expired, the chat goes on in a fresh session
  with a lighter history instead of re-reading everything at full price.
- The lighter history keeps every word you and the AI wrote; old tool results, pictures, attachments and earlier code
  versions are sent as one-line notes, and older long answers are shortened.
- Nothing in the chat changes; the AI can look up any earlier message word for word when it needs one.
- It never breaks a warm cache mid-task: on a Claude subscription the cache lasts an hour, so this happens after longer
  breaks; on Astra after about 10 minutes.
- In test chats of 40–300 messages, tokens re-read per message dropped by about 20–55 % on Claude and 65–75 % on Astra
  (most for Lab director chats and screenshots).
- One quiet line says when it happened ("Fresh start after the break: ≈ 9k tokens instead of ≈ 48k"), with "Keep the
  full history here" for a chat where you want everything.
- The Usage window's "How to save" shows how much it saved; ⋯ AI setup → Spending → "Offer to continue lighter: Off"
  turns it off too.
- The send preview now knows the cache lasts an hour on a subscription, so it stops warning too early.
