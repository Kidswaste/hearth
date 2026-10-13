# swarmlean (round 33): lean ◎ Missions

The ◎ Missions that bring in more AIs (Swarm, Debate, Side by side, Answer then review, Ask everyone, Second opinion,
Research, the Lab's 4 variations) multiply tokens. This round makes them lean without making them worse, and measures
it with the fake engines.

## Measured (before → after)
`node dev/mission-tokens.js` runs every mission once in the real app (smoke, fake engines) on a typical request
("Suggest three ways to make the hook…", ≈ 25 words) in a Claude chat that already has three exchanges, replies padded
to a typical length (≈ 400 tokens). The fakes log each engine run (system prompt, new message, the conversation a
resumed session re-reads, `FAKE_TOKEN_LOG`); tokens ≈ characters / 4. **next** = the fresh input of the following
normal message (what the mission's outcome adds to the chat afterwards). The test app has no saved memory, so the
helpers' memory saving (below) isn't in these numbers.

| mission | runs | total before → after | fresh input before → after | next message (fresh) | models after |
|---|---|---|---|---|---|
| Just answer / Split / Plan / Teach | 1 | 1.9–2.0k → same | same | 10 → 10 | own |
| Answer, then review | 2 | 3.0k → 3.0k | 682 → 626 | 10 → 10 | reviewer on Sol · medium (was Astra · high) |
| Swarm | 4 | 3.8k → 3.7k | 1.4k → 1.2k | **504 → 274** | 2 helpers on Sol · medium, the chair on Opus |
| Debate | 5 | 6.8k → 6.8k | 1.7k → 1.7k | **499 → 269** | own (they are the answers) |
| Side by side | 2 | 1.2k → 1.2k | 270 → 270 | **819 → 271** | own (they are the answers) |
| Second opinion only | 1 | 1.1k → 1.1k | 601 → 601 | **492 → 275** | own |
| Research (from Claude) | 1 | 625 → 625 | 167 → 167 | **492 → 275** | own |
| Ask everyone | 2 | **3.8k → 2.5k** | 52 → 142 | 10 → 10 | own |

What moved: the outcome a mission carries into the chat's next message is now a short summary (≈ 45 % fewer fresh
tokens on every follow-up, ≈ 67 % for Side by side); Ask everyone no longer makes the other AI re-read whatever chat is
open there (−34 % for the mission); Swarm's helpers and the reviewer run on the cheaper model with less effort (same
token count, a fraction of the price, and less hidden thinking, which the fakes don't model). With the owner's real
saved memory (≈ 150–300 tokens) each helper run also skips it and the `<remember>` habit (≈ 70 tokens): about
−0.5k per Swarm, −0.2k per review.

The Lab's "Make 4 variations" crew (≈ 68k tokens for 4 helpers) keeps its count, but its brief is now byte-stable
(the shared part first) and helpers 2–4 start once helper 1 streams, so their first step reads the scene's code (up to
≈ 1.5k tokens) and the tools from the prompt cache; the helpers think with low effort (medium on Deep).

## Upgrades
### Lean helpers
1. Helpers only get the task: a mission's helper / reviewer run carries no saved memory and no `<remember>` /
   `<suggest>` habits (engines.js `options.helper`); the owner's standing instructions stay. Byte-identical when memory
   changes, so helpers on one engine share a cached prefix.
2. Swarm's helpers (the council seats that aren't the chair) and every critique note run on the cheaper model with low
   effort (Router's quick tier: Sonnet / Sol; medium effort when the AI is set to Deep); the chair keeps the chat's
   model. A model or effort set for a seat (`claude:opus`, `astra~high`) or pinned for the chat is never routed away.
3. "Answer, then review": the reviewer gets the same helper pick (it already saw only your question and the reply).
4. The Lab crew's brief is byte-stable: what all helpers share first, who and which angle in the last two lines.
5. The Lab crew warms the cache: helper 1 starts, the others when it streams (at most 4 s later); a helper stopped
   before it started counts as stopped.
6. The Lab crew's helpers think with low effort (medium when the director is on Deep); their model stays (Lab builds).
7. Ask everyone: the other AIs answer in a new chat of theirs instead of on top of whatever chat is open there (a Lab
   director keeps its chat: its scene goes with it).

### Before it starts
8. The ◎ picker shows a plain one-line estimate on each costly mission, no extra click: "≈ 2 helpers · about 4.4k
   tokens" (Swarm), "≈ 1 other AI · about 7.4k tokens" (Debate), "≈ 4 helpers · about 68k tokens" (Lab variations)…
   Single replies (Just answer, Plan first, Explain like a teacher) show none. Sized from this chat's context and your
   draft; calibrated on the measurements above.
9. With a weekly spending limit (⋯ AI setup → Spending), the line turns orange when the mission would pass it ("· passes
   your weekly limit" / "· past your weekly limit").
10. Past the limit, starting a costly mission asks first ("Start it anyway?"); Cancel puts your words back in the box.
    The spending guard loads on its own when a limit is set (it is a lazy group).

11. The ◎ picker fits its popover again: a long "More · …" line had widened its grid past the right edge (the cards
    now wrap in three columns).

### After it ends
12. One compact card, as before; what goes back into the chat's context is a short summary of the kept / final answer
    (the opening ≈ 900 characters, cut at a sentence, big code blocks named, not pasted, "the rest is in the result
    card"), for collaborations (Swarm, Debate, Side by side, Pair), Second opinion only, Research and Ask everyone's
    "Use this one".
13. A chat rebuilt from its text (a lost session, a switched engine) reads each mission card's summary (`m.ctx`), not
    the full answers again.

### Measuring
14. `node dev/mission-tokens.js` (+ `--save`, `--compare a.json b.json`, `--only swarm,duo`): tokens per mission and for
    the next message, cached vs fresh, models used, and the picker's estimates side by side.
15. The fake engines log every run with `FAKE_TOKEN_LOG=<file>` and pad plain replies to a typical length with
    `FAKE_REPLY_CHARS`.

## Tests
- `node dev/swarmlean-test.js`: estimates (order of magnitude, plain line, none for single replies), the summary, the
  helper pick (never over a seat / chat pick, never a stronger model), and a real engines.js run on the fake CLI: a
  helper prompt has no memory / habits, keeps the instructions, stays byte-identical when memory changes, and gets
  `--model sonnet --effort low`. 27/27.
- `dev/checks/swarmlean.js` (smoke, fake engines; `sh dev/run-checks.sh missions` runs it with missions / missions2):
  the picker's lines, Swarm's helpers on the cheaper pick and the chair on the chat's model, the short summary and carry,
  Ask everyone in a new Astra chat, the limit asking first and Cancel keeping your words.
- Still passing: `dev/tokens-test.js`, `dev/cache-test.js`, `dev/director-mcp-test.js`, `dev/router-test.js`,
  `dev/budget-test.js`, checks missions, labeasy, astra-collab, crew. missions2 passes every step but one that was
  already failing on main: "short list + More (8 + 8)" (its ≤ 14 cap predates the missions pinboard / publishkit /
  recall added; not changed here).

## Files
New `swarmlean.js` (script tag after missions.js), `dev/swarmlean-test.js`, `dev/mission-tokens.js`,
`dev/checks/mission-tokens.js`, `dev/checks/swarmlean.js`. Small hooks: `missions.js` (estimate line, the limit gate,
summaries, Ask everyone in new chats, the reviewer mark), `missions.css` (the line), `astra.js` (helper turns,
summaries: `ctxText`, shorter `carryText`), `native.js` (withContext reads `m.ctx`; the mission's reviewer options in
`askAstra`), `engines.js` (`options.helper`, `memoryOff`), `tools/three-crew.js` (brief order, warm start, effort),
`dev/fake-common.js` / `fake-claude.js` / `fake-codex.js` (the token log, typical replies, the crew line anywhere),
`dev/run-checks.js` (missions group), `index.html` (one script tag).

## Not done (on purpose) / risks
- The spending limit is **weekly** (that is what budget.js has); the brief said monthly. The gate uses it as it is.
- Debate and Side by side seats are the answers themselves: they keep their model (cheaper seats there would change
  the answers you pick from).
- "Split it up" runs Claude's own subagents inside its run: Hearth can't route their model; the estimate (≈ 3 helpers)
  is a guess, the fakes don't spawn them for a normal message.
- Estimates are rough by design (± 30 % against the measurements); the card shows what it really took.
- Swarm helpers on Sonnet / Sol could answer a little differently than on Opus / Astra; the chair (own model) writes
  the final answer from them. A seat set as `claude:opus` keeps Opus.
- Ask everyone now leaves the other AI's previous chat in its list and opens a new one there.
- The crew's warm start delays helpers 2–n by up to 4 s.

## For the patch notes
- Missions cost less: Swarm's helper AIs and the reviewer in "Answer, then review" now use the lighter model and
  think less, while the AI that writes your final answer keeps its full model.
- Before you start a Swarm, Debate, Side by side or the Lab's 4 variations, its card in ◎ says what it will take, in
  one line ("≈ 2 helpers · about 4k tokens"), no extra click.
- If you set a weekly spending limit, that line turns orange when a mission would pass it, and starting it asks first
  (Cancel gives your words back).
- After a mission, your next message carries a short summary of the result instead of every full answer (about half
  the tokens on the follow-up); the full answers stay in the card.
- Ask everyone no longer makes your other AIs re-read whatever chat they had open: each answers in a fresh chat.
- The Lab's 4 variations share their brief through the prompt cache and think with less effort.
- Helper AIs no longer get your saved memory or the remember / suggest habits: only the task and your standing
  instructions.
