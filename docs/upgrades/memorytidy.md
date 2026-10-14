# Tidy memory: saved memory stays small and useful (round 38, memorytidy)

Each AI's saved memory rides with its messages (in the system prompt while small, with the messages it's about once
it's big), and it only grew: every `<remember>` appended a line, even when it said again what was there, or the
opposite of it ("Uses a Mac" … "Now uses Windows" … "Uses a Mac"). Facts that only matter in the Lab went into every
plain chat, "this week" facts stayed for months. This stream measures that, stops most of it at the source, and gives
the owner one calm cleanup with a before / after list, ticked boxes, Apply and one Undo.

## Measured
There is no real memory on this machine (tests never touch the owner's data), so the numbers come from a scripted two
months like the owner's (`node dev/memorytidy-test.js`, section 9): 54 `<remember>` saves across Claude, Astra and the
Three Director (Lab visuals, slider habits, formats, Mac ⇄ Windows back and forth, short answers said five ways, two
"this week" facts, a passed deadline). Tokens of memory carried with each message:

| 60 days, 54 saves | facts | Claude | Astra | Three Director | all of memory |
|---|---:|---:|---:|---:|---:|
| appended (before this round) | 54 | 281 | 55 | 152 | 480 |
| replace, not append (prevention only) | 33 | 235 | 36 | 104 | 346 |
| appended, then Tidy memory (sure changes) | 27 | 120 | 36 | 138 | 258 |
| prevention + Tidy memory | 27 | 120 | 36 | 138 | 258 |

- Plain Claude: **281 → 120 tokens (−57 %)**; all of memory **480 → 258 (−46 %)**. The Three Director gets the Lab facts
  the plain chats no longer carry (still 152 → 138).
- Prevention alone keeps the OS facts at one line through ten back-and-forth saves, and a fact said twice is kept once
  (−18 % for Claude, −28 % overall) with no click.
- ✦ Smarter tidy costs ≈ 850–900 tokens once for a small memory on the lightest model (the fake engine measured 846 in
  the smoke run); shown on its button before it runs.
- Prompts stay byte-stable: an AI without a place gets exactly the same bytes as before (tested), `dev/cache-test.js`,
  `dev/tokens-test.js`, `dev/tokenaudit-test.js` unchanged and passing.

## Upgrades
### Tidy memory (⋯ AI setup → Memory → Tidy memory…)
1. **Tidy memory…** next to What it remembers…: one proposed cleanup as a before / after list (struck-through facts,
   → what stays, which scope, why, tokens saved).
2. **Merge**: the same fact said two or more times (exactly, in other words — "The user really prefers it when the
   responses are short" = "Prefers short answers" — or once in All agents and again for one AI) becomes one.
3. **Update**: a newer fact replaces what it contradicts — computer (Mac / Windows), answer length, format (9:16 /
   16:9), language, dark / light, units, frame rate, resolution, a yes ↔ no ("hates" → "likes"), a new name or value.
   The newest wins (by the date Hearth now keeps for each fact, else its place in the list).
4. **Shorter**: wordy facts lose "The user…", "really", "in order to", "a lot of"… (same fact, fewer tokens).
5. **Move to Lab**: a fact that only matters in the Lab (sliders, layers, bloom, shaders…) leaves All agents (or a plain
   AI's own memory) for the **Lab scope**, read only by the Three Directors; one they already know is dropped instead.
   Forgeheart facts likewise to the game's AI.
6. **Drop**: clearly stale facts ("this week…" saved over 14 days ago, a deadline that has passed); birthdays and
   routines never.
7. Each change has a **box**; sure ones are ticked, unsure ones (a guess, or a stale fact without a date) wait unticked.
8. The top line says **before → after** for all of memory and **for each AI** ("Claude ≈ 95 → 39 tokens with each
   message"), live as you tick.
9. **Nothing changes until Apply**; a pinned fact is never replaced or dropped.
10. **One Undo** in the toast ("Memory tidied: 5 changes, ≈ 88 → 37 tokens"), and `/tidy-memory undo`; facts saved
    since the tidy are kept.
11. **✦ Smarter tidy**: only when clicked, the lightest model (haiku / Astra's lightest, low effort, no tools, no
    memory) reads the facts the ticked changes leave and suggests shorter wording and merges; its **cost is on the
    button before it runs** ("≈ 856 tokens once", in / out on hover) and what it used after. Its drops come unticked;
    longer "shorter" wording or unreadable lines are ignored.
### Prevention (nothing to do)
12. **A `<remember>` that repeats a fact adds nothing**; one that says more replaces the shorter one.
13. **A `<remember>` that contradicts a fact replaces it where it was** ("Now uses Windows" replaces "Uses a Mac" in All
    agents), only on sure matches; anything unsure is added as before.
14. Its **Undo chip puts the old fact back**.
15. **The cache keeps hitting**: a fact the AI updates mid-chat leaves this chat's prompt byte for byte (like a fact it
    adds, cachewise); new chats get the update. An owner's tidy or edit applies at once, as before.
16. Facts the AI saves now get their **date** (memory details), so the newest wins and stale ones are recognised.
### Scopes and the nudge
17. **Lab / Forgeheart scopes** in memory: "Lab only" / "Forgeheart only" in What it remembers… (filter, add, move a
    fact there); their tokens count only for the AIs that read them (the 🧠 cost pills, Spending → Where its tokens go).
18. **One gentle line in the Memory fold's summary** once an AI's memory passes ≈ 800 tokens: "Remembers what you tell
    it · ≈ 1.0k tokens of memory: Tidy memory could shrink it". Not a toast.
### Other ways in
19. Ctrl/⌘+K "Tidy memory…" (Find anything opens AI setup at Memory, the row lit).
20. `/tidy-memory` (alias `/memory-tidy`) opens it; `/tidy-memory undo`.

20 upgrades.

## Files
New: `memorytidy-core.js` (pure: relations, shorter wording, staleness, the proposal, apply / undo, saveFacts /
unsave, smarter prompt / cost / parse; loaded at start, before memory.js; Node-tested), `memorytidy.js` +
`memorytidy.css` (the dialog, nudge, command; lazy group `options`), `dev/memorytidy-test.js` (unit),
`dev/checks/memorytidy.js` (smoke, fake engines).
Small edits: `context-core.js` (`PLACES`; `memoryNotes(mem, agent)` adds the agent's places in a fixed order),
`engines.js` (`memoryFor` uses it; `onlyGrew` accepts logged replacements), `native.js` (`rememberFacts` /
`forgetFacts` through saveFacts / unsave), `memory.js` (place scopes in the fact view, `stamp`, `metaFacts`,
`paintButton` exported), `chat-memory.js` (relevant mode reads the places), `tokenauditmain.js` (relevant memory
counts places), `options.js` (the button + nudge), `appsearch-data.js` (one row), `lazy-data.js` (+2 files, manifest
regenerated), `index.html` (one script tag), `dev/fake-common.js` (the smarter tidy reply), `dev/run-checks.js`
(unit list, group `memorytidy`).

## Tested
- `node dev/memorytidy-test.js` (unit, 65 checks): relations (same / covered / conflicts / unsure / unrelated), wording,
  staleness, the proposal on a messy memory, apply / undo (facts saved since kept), stale changes skipped, prevention
  (skip, replace in place, log, Undo, cap of 30), scopes (plain prompts byte-identical, the Lab fact only in the
  Director's, fixed order, key order, tokenaudit parts, relevant mode), frozen prompt after an AI update, owner's tidy
  applies at once, smarter prompt / cost / parse, the two-month measurement.
- `sh dev/run-checks.sh memorytidy` (memorytidy smoke + unit:memorytidy / cache / tokens / tokenaudit + options): 6/6.
  The smoke check: the nudge line in the fold, the list (merge / update / move / drop ticked, a good fact untouched),
  before → after, nothing changed before Apply, Smarter tidy's cost then the fake engine's suggestion, Apply →
  memory.json, the toast, the Lab fact only in the Director's prompt parts and absent from a real fake-Claude run's
  system prompt, Undo, `<remember>` twice → once, a contradicting save replaced + its Undo, `/tidy-memory`. No page
  errors.
- `sh dev/run-checks.sh budget` 10/10; `context`, `appsearch`, `unit:boot-test`, `unit:context-test` pass;
  `node dev/lazy-manifest.js` regenerated and compared clean.

## Not done (on purpose) / risks
- **Rules are heuristics.** A contradiction is "sure" only for one-value things (computer, answer length, name…) or a
  clear yes ↔ no on the same words; "X is Y" about anything else and two formats on two platforms stay unticked.
  Prevention acts only on sure matches, so the worst case is the old behaviour (a line added).
- **Same fact in two AIs' own memories** isn't merged into All agents (that would hand it to a third AI).
- **Facts saved before this round have no date**: their order in the list decides which is newer; a "this week" fact
  without a date is proposed unticked.
- **A replaced shared fact** changes All agents: if Claude learns "Now uses Windows", Astra's next chat gets it too
  (that's the point, but it's a wider write than before).
- **Undo is whole-tidy** (the memory as it was, plus facts saved since); a hand edit in What it remembers… between
  Apply and Undo is overwritten for the facts the tidy touched.
- The smarter tidy's cost is an estimate (the engine's lean start ≈ 700 tokens on Claude, ≈ 2.4k mostly cached on
  Codex, plus the list); the real use is shown after.
- The two-month numbers are a scripted stream, not the owner's memory (never read here).

## For the patch notes
- New in ⋯ AI setup → Memory: **Tidy memory…** — a before / after list of what could go: facts said twice, old facts a
  newer one contradicts (the newest wins), wordy ones, clearly outdated ones. Tick what you want, Apply, one Undo.
- Lab-only facts can live in a **Lab** scope that only the Three Directors read, so plain chats stop carrying them;
  Tidy memory offers the move.
- **✦ Smarter tidy** asks the lightest model once for shorter wording — it shows what it costs before you click.
- The AIs no longer pile up memory: when one remembers something it already knew, nothing is added; when it learns
  something that changes an old fact ("now on Windows"), the old fact is replaced. The chip's Undo puts it back.
- Long chats keep their prompt cache when the AI updates a fact mid-chat; new chats get the update.
- When an AI's memory gets big (≈ 800 tokens), the Memory line in AI setup says so — once, quietly.
- In a scripted two months of use, Claude's memory went from ≈ 280 to ≈ 120 tokens per message.
