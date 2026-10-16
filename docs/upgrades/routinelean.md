# 🔁 Keep going, leaner (round 51, routinelean): more done per token, and it knows when to stop

The owner uses 🔁 Keep going (round 41) to let an AI prompt itself for a time, a number of extra rounds, or until
stopped. Each round re-read the whole growing session, ran on even when the rounds had stopped producing anything,
ran into plan limits, and its notifications only said "round 3 done". This stream makes each round cheaper, makes the
routine stop by itself when rounds stop changing anything, holds it before a plan limit (and resumes after the reset),
and shows in the Usage window what Keep going spent and achieved. Nothing is added to any prompt, flag or tool list.

## Measured
### The model: 10 rounds of "do the next 5 improvements" (`node dev/routinelean-test.js --table`)
Each round is the routine's words, then tool steps (each a model call that re-reads the session), then a short answer.
Coding rounds have 8 steps (reads, edits, tests); Lab director rounds have 10 (eval, edit, a small picture, read code,
sliders, twice). Rounds are chained a few seconds apart, so the cache stays warm on every engine unless a pause is
chosen. **Before** = round 50: every round resumes the session, and historylean's fresh start only applies after an
expired cache. **After** = routinelean's rule between rounds. Tokens = every model call's input (what the meter
shows); weight = the same at full price (cache reads 0.1×, Claude's cache writes 1.25×).

| AI · chat | tokens per round, avg of 10 (before → after) | full-price weight per round | round 10 re-reads | lighter starts |
|---|---:|---:|---:|---:|
| Claude (subscription, 1 h cache) · coding | 635k → **338k** (−47 %) | 79.0k → **49.8k** (−37 %) | 1189k → 595k | 0 → 1 |
| Claude (API key, 5 min cache) · coding, idle 10 min between rounds | 160k → **101k** (−37 %) | 43.5k → **30.0k** (−31 %) | 236k → 116k | 4 → 9 |
| Astra · coding | 635k → **338k** (−47 %) | 75.6k → **46.3k** (−39 %) | 1189k → 595k | 0 → 1 |
| Claude · Lab director chat | 446k → **317k** (−29 %) | 53.5k → **41.1k** (−23 %) | 831k → 182k | 0 → 1 |
| Astra · Lab director chat | 446k → **316k** (−29 %) | 51.6k → **39.0k** (−24 %) | 831k → 182k | 0 → 1 |
| Astra · Lab director chat, idle 10 min between rounds | 147k → **81.8k** (−44 %) | 29.1k → **18.5k** (−37 %) | 182k → 100k | 3 → 9 |

**Rounds until a sensible stop** (the work runs out after round 4; later rounds change no file and say the same thing):
before **10 rounds** (only the "I'm done" words, the cap or the end stopped it), after **6** ("the last 2 rounds
changed no file and nothing in the scene"). For the Claude coding routine that is **6.35M → 1.74M tokens (−73 %)**
for the whole routine (the stop and the lighter starts together).

### End to end with the fake engines (`dev/checks/routinelean.js`)
10 rounds each way in one smoke run, the same words each round ("… varied toolbytes:80000": every reply new, ≈ 20k
tokens of tool results kept in the session per round), before = lighter off (round 50's behaviour), after = on.
Tokens per round = the round's reply usage (input + output) as the round's 🔁 chip shows it.

| Chat | tokens per round, avg of 10 (before → after) | lighter starts | budget |
|---|---:|---:|---:|
| Claude | 111,431 → **45,222** (−59 %) | 0 → 2 | ≤ 60 % |
| Astra | 114,938 → **48,715** (−58 %) | 0 → 2 | ≤ 75 % |
| Lab director chat (docked, Claude) | 111,538 → **45,293** (−59 %) | 0 → 2 | ≤ 70 % |

Stops, end to end: 3 rounds with file edits then 2 without → it stops after round 5 of 10, 3 files counted; the
same answer → stops after round 3. (The fake reports a reply's input once rather than per tool step, so the director
case uses no tool steps; the model above has them.)

## Upgrades
### More done per token
1. **Lighter between rounds**: before a round, when the chat re-reads ≥ 60k tokens a step, the lighter history is
   ≤ 40 % of that and more rounds follow, the round starts a fresh session with historylean's lighter history (every
   word kept; old tool results, pictures and earlier code as one-line stubs). No extra model call (Continue lighter's
   summary stays the fallback when the lighter history isn't loaded). Works whether the chat is on screen or not.
2. **After an expired cache** (a pause past the cache's life: 1 h on a subscription, ≈ 5 min on an API key or Astra,
   as historylean reads it from the engine), any round starts lighter as soon as it saves ≥ 2k tokens (round 50's
   own rule waited for 20k).
3. **Rounds chained within the cache's life**: with no pause chosen the next round goes a few seconds after the reply,
   so the cache holds; a warm cache is only given up for the big re-reads above.
4. **Shorter default words**, byte-stable (the same bytes every round, checked on what the engine received):
   "Keep improving: do the next 5 improvements. End with one line "Changed: …". If nothing is left worth doing, say
   so plainly." — it asks for one summary line instead of a summary.
### Knows when to stop (in plain words)
5. **Rounds that change nothing**: once a round has changed files or the scene, 2 rounds in a row with no file and no
   scene change stop it: "Keep going finished: the last 2 rounds changed no file and nothing in the scene (6 rounds ·
   ≈ 210k tokens · 3 files changed)". Changes are read from the round's tools (Claude's Edit / Write, Astra's file
   changes, the director's edit / layer / slider tools; looking tools don't count) and aiundo's record of that reply.
   A chat that never changes files (writing, questions) isn't stopped by this rule.
6. **Repeated answers**: the same answer (≥ 90 % alike) twice in a row after the first stops it: "its last 2 answers
   repeated the one before: nothing new is coming".
7. **The same error twice** now says so: "it failed 2 times in a row with the same error (…)".
8. The finished note and ◉ Activity say what it achieved: rounds, tokens and files changed.
### Usage limits
9. **Pauses before a plan limit**: before each round it reads the 5-hour session and weekly windows the Usage window
   knows (0 tokens); when a window plus one more round (its own pace, measured between rounds) would reach the margin,
   no round goes.
10. **"paused until 6 pm (limit)"** on the header chip, in the chat, in ◉ Activity and as a notification.
11. **Goes on by itself after the reset** (a minute after it) when "Wait for a usage limit to reset, then go on" is on
    (the default, the "until I stop it" case); off: it pauses for ▶ and says how much is used and when it resets.
12. **The margin is yours**: card › More › "Pause before a usage limit at": 80 / 90 (default) / 95 % of a limit.
### Never answers for you
13. A permission card or question during a round pauses the routine after it; the card's own notification asks you;
    nothing approves it (unchanged, and a round that waits for a card never counts as "no change").
### Notifications and the Usage window
14. **A round's notification shows its one-line summary** (its "Changed: …" line, else its last sentence, ≤ 140
    characters) and its cost, never the whole answer.
15. **Usage window › 🔁 Keep going**: what it spent and did today and in the last 7 days ("Today: ≈ 120k tokens · 8
    rounds · 14 files changed · 6 of 8 rounds changed something"), and each routine running now. Shown only once Keep
    going has been used.

15 upgrades.

## Files
- `routines-core.js` (pure): limitCheck / limitStep (limits and pace), changeOf / similar / summaryOf (change, repeats,
  summary), leanBetween (lighter between rounds), statAdd / statSum / statWords (the Usage window), the stop rules in
  roundEnded, the held chip words, the margin in normalize, the shorter default words.
- `routines.js`: limits from UsageLimits, the hold ("paused until … (limit)"), leanFirst (historylean between rounds),
  the finish hook reads the round's tools and aiundo's record once the reply is in the chat, per-day stats
  (localStorage `routines.stats`, this computer, 15 days), `Routines.usageBox()`, the margin in the card.
- `routines.css`: the Usage window's Keep going lines.
- New: `dev/routinelean-test.js` (UNIT, 68 checks + `--table`), `dev/checks/routinelean.js` (smoke, fake engines,
  budgets), group `routinelean` in `dev/run-checks.js`.

## Edits outside the lane (small, additive)
- `usagelimits.js`: one line in `paint` (`Routines.usageBox()` between the cards and How to save).
- `notify-core.js`: a Keep going round's body is its summary (one expression).
- `dev/fake-common.js` / `dev/fake-claude.js` / `dev/fake-codex.js`: "varied" and "edits:N:tag" keywords.
- `dev/run-checks.js`: UNIT entry + group. Nothing in codex-server.js or the Astra modules; nothing in any prompt, flag
  or tool list.

## Tested
- `node dev/routinelean-test.js`: 68/68 (prompt short and byte-stable, change from tools / aiundo, similarity, stale /
  repeat / same-error stops, limits: margin, pace, hold, reset, two windows, pause without waiting, lighter between
  rounds, summaries, stats; budgets on the model table and the stop).
- `dev/checks/routinelean.js` (smoke, fake engines): 20 steps, passed (the tables above, byte-stable rounds, the two
  stops, the limit hold and resume, summaries in notifications, the Usage window). Its first runs failed on check bugs
  (an edits counter shared between runs, the director's constant scene line), fixed in the check.
- Targeted, alone: routines, historylean, usagelimits, costcoach, notify, cachewise, lazy, unit:boot-test,
  unit:routines-test, unit:routinelean-test: all passed.
- Unit: routines-test 69/69, historylean-test, usagelimits-test, costcoach-test, notify-test 52/52, cache-test; scans
  datasafe / errorcalm clean.

## Risks / not done
- **The model's numbers are a model** (step counts, result sizes, the cache prices); the end-to-end numbers come from
  the fake engines, not real Claude Code / Codex runs.
- **A lighter start drops old tool results** from the session; the AI re-reads a file or the scene when it needs it.
  It only happens past 60k re-read a step (or an expired cache), where re-reading costs more.
- **"No change" reads tools by name**: a Bash command that writes files (sed -i, a script) isn't seen as a change unless
  chat access logs it; the rule only applies once a round has changed something, and needs 2 quiet rounds.
- **Usage limits need numbers**: Claude reports them with each reply (rate_limit_event), Astra with its account read;
  without numbers it goes as before (a refusal still waits for the reset). The pace is the rise between two round
  sends, so the first round after a start is judged by the use alone.
- Repeat detection compares words; an answer that changes a few words each time but says the same thing may run on
  until the "no change" rule or the cap.

## For the patch notes
- 🔁 Keep going now does more per token: when a chat gets long, the next round starts fresh with a lighter history
  (every word kept, old tool results as short notes), so rounds stop re-reading everything. In tests, 10 rounds cost
  about 30–60 % fewer tokens per round.
- It stops by itself when the work runs out: two rounds in a row that change no file and nothing in the scene, or the
  same answer twice, end it, and the note says why and what it did ("3 files changed").
- It pauses before a plan limit instead of running into it: "paused until 6 pm (limit)", and goes on by itself after
  the reset. The margin (90 % by default) is in the Keep going card under More.
- Notifications for each round show a one-line summary of what changed, not the whole answer.
- The Usage window shows what Keep going spent and achieved today and this week (rounds, tokens, files changed).
- It still never answers a permission card for you: it waits and lets you know.
- Caveat: measured with test engines; try a short "3 extra rounds" on a real chat to see your own numbers.
