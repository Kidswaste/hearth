# rewards63 (round 63): real rewards for real quests

The owner earns XP from real-life quests (Paris places, shows, park music, AirPods…). This stream lets that XP turn
into things that mean something offline: a record at Superfly, a long breakfast at the Marché des Enfants Rouges, a
Serum preset pack, a concert ticket fund.

**What Codex already had** (Sidequest Studio › Treat machine / Reward bay, `tools/quest-core.js` +
`tools/quest-journal.js`): rewards in `s.rewards` priced in **sparks** (1 spark per 5 XP, and claiming never lowers XP
or level), `C.redeem` (refuses when sparks are short, and a priced treat over the monthly € envelope), claimed → enjoyed
/ returned receipts in `s.redemptions`, "Save toward this" (`s.rewardGoal`), reward blueprints and treats, a reward log,
and a monthly treat envelope (`s.rewardBudget`).
**This stream builds on that:** same store, same claim rule, same receipts. Nothing parallel.

## What shipped

**In XP words**
1. Rewards have an XP cost: "300 XP" is 60 of the Studio's sparks. Chat replies, the tracker and the shelf all speak XP.
2. "120 XP to your next reward: a new record" is exact. It counts the XP already earned toward the next spark.
3. The next reward is the one you're saving toward (★ in the Studio). Otherwise it's the biggest one you can claim
   now, or else the nearest one ahead. A reward you claimed and haven't enjoyed yet steps aside.

**In the ✦ tracker panel** (click the quest chip, or Ctrl/⌘+Shift+O)
4. A Rewards row under your quests: "N XP to your next reward: …" with a thin progress bar.
5. When a reward is in reach it says "Ready: …" and shows **Claim…**. Claim… asks first ("Claim it" / "Not now") and
   says your XP and level stay where they are.
6. A claimed jar reward shows "Move €10 into your jar yourself" with **I moved it**.
7. This week's streak bonus shows as one quiet line.
8. Right-click the chip (or ⋯) › **My rewards…** opens Sidequest Studio › Rewards.

**In Sidequest Studio › Rewards** (a small shelf in Codex's style, under the sparks balance)
9. Your next reward in XP with its meter, and Claim it… (Codex's own confirm) when it's ready.
10. XP to spend, XP earned in all, and streak bonuses so far.
11. The savings jar: what's in it, the claimed jar rewards still to move (with I moved it), and **Note a move** for money
    you put in or take out yourself.
12. Kind starters, one click each, editable like any reward. Each one disappears once you have it:
    - A new record at Superfly (300 XP)
    - Concert ticket fund +€10 (500 XP, the jar)
    - A long breakfast at the Marché des Enfants Rouges (200 XP)
    - A new Serum preset pack (400 XP)
    - A film at Le Champo (250 XP)
13. Every claim (folded): the date, the name, the XP, and whether it was claimed, enjoyed or returned. Codex's reward
    log keeps only the enjoyed and returned ones.

**Savings jar** (optional, off until used)
14. A reward can carry a jar amount (`/reward add concert ticket fund +10€ 500`). Claiming it asks you to move that
    money yourself. **Hearth never moves, sees or touches money**: the jar is only your own notes.
15. `/reward jar +20 birthday` notes money you put in and `/reward jar -25 ticket` notes money you took out. The jar
    never goes below €0. `/reward jar moved` settles everything waiting, and `/reward jar name Concert fund` renames
    the jar.

**Streak bonus** (from weekquest62's streak of weeks with a real-life quest)
16. Once a week, when the streak is 2 weeks or more, you get +5 XP of reward credit for each week beyond the first. It
    is capped at +20 XP a week. It's granted the moment a quest change shows it's due, with one toast. It never
    raises your level XP: it only adds to what you can spend on rewards.

**Chat** (`/reward`, alias `/rewards`)
17. `/reward`: XP to spend, the next reward (or Ready + a Claim button), what else is ready, the jar.
18. `/reward add <name> <xp>`: `/reward add new record at Superfly 300` (also `300xp`, and `+10€` for the jar).
19. `/reward redeem <name>`: asks first, with "Yes, claim it" / "Not now". If you don't have enough, it says how much
    XP is left and writes nothing.
20. `/reward history`: every claim, newest first.
21. `/reward ideas` (the starters, with Add 1–5 and Add all), `/reward goal <name>` (save toward it; `goal off`
    clears it), `/reward edit <name> <xp>`, `/reward remove <name>` (asks first; past claims stay), `/reward jar …`,
    `/reward <name>` (that reward's progress), `/reward help`. Names and words are suggested as you type.
22. Ctrl/⌘+K: Quest: my next reward · Quest: open my reward shelf.

## How it works
- `rewards-core.js` (no DOM, node-tested): XP↔sparks, `toGo` (exact XP still to earn), `next` / `ready`, `match`,
  `parseAdd`, `add` / `addStarter` / `edit` / `remove`, `redeem` (calls `C.redeem`), `history`, the jar (`jar`,
  `jarMove`, `checkJar`), and the bonus (`bonusDue` / `grantBonus` using `WeekQuestCore.streak`).
- `rewards.js` + `rewards.css` ride in the tracker's `questhud` lazy group, which loads after the first screen.
  - `RewardShelf.hudRows` renders the tracker rows and `RewardShelf.studio` renders the Studio shelf.
  - `/reward` is registered there.
  - There's one `hearth:quests` listener, for the bonus.
  - With no journal, QuestCore still isn't loaded (questhud61's rule holds).
- Data, all in Codex's journal (`quest-journal` kv):
  - rewards stay in `s.rewards`, with optional `jar` (€) and `art`. Starter ids are `r-rw63-<key>`.
  - claims stay in `s.redemptions`, made by `C.redeem`.
  - `s.rewardJar = { v: 1, name, moves: [{ id, amount (±€), at, note, receipt? }] }` keeps at most 500 notes. The
    oldest notes fold into one, so the total never changes.
  - `s.rewardBonus = { v: 1, weeks: [{ week (Monday), streak, sparks 1–4, at }] }` keeps at most 520 entries.
- Writes go through `QuestHud.write`. When the Studio holds the journal that's `QuestJournal.mutate`; otherwise it's
  the Studio's own read → validate → change → validate → atomic `kvSet`. Each one is announced as `hearth:quests`. A
  failed read is never treated as empty.
- Idle cost: none. There are no timers and no polling, and no AI is involved. The bonus check runs only when a quest
  change is announced, and it writes at most once a week.

## Tests
- `node dev/rewards-test.js` (unit, in UNIT, 9 checks):
  - XP in, sparks kept, and duplicates refused
  - exact XP to go with Codex's XP, including XP between sparks
  - the next-reward rule: the goal, then ready, then ahead, with an open claim stepping aside
  - claiming can't go negative: refused, with nothing changed. Codex's own rule agrees, XP stays the same, and a
    returned reward gives its sparks back
  - history order and states
  - the streak bonus: none at 1 week, 2 sparks at 3 weeks, once a week, capped at 4 for a 13-week streak, and a forged
    or duplicated bonus refused by `validate`
  - the jar: pending until moved, settled once, never below €0, returned claims ask nothing, and folding keeps the
    total
  - starters: added once, editable; a removed reward keeps its claims
  - the chat words: `/reward add` parsing, the sub-commands, name matching (ambiguous → none)
- `dev/checks/rewards63.js` (app, 27 steps):
  - the bonus is granted once from a quest change, and no rewards timers run while idle
  - `/reward add` ×2 is saved in sparks, and the chat says the XP to go
  - the tracker: "40 XP to your next reward…" → Ready + Claim… after a quest → confirm → Not now (nothing saved) →
    Claim it (saved once, XP the same) → it moves on to the next reward
  - `/reward redeem` with too little says the XP to go and leaves the journal byte-identical
  - `/reward redeem concert` asks in the chat, then claims. The tracker shows "Move €10…", and I moved it notes the
    money in the jar
  - `/reward jar -5` / `-50`: never below €0
  - `/reward history` and `/reward`
  - Studio › Rewards: the shelf with the next reward, the jar, every claim and the bonus. Adding a starter saves it;
    `/reward add` with the Studio open repaints it
  - one `/reward` command, and the journal still valid
  - Screenshots: `rewards-tracker.png` and `rewards-studio.png`.
- Group: `sh dev/run-checks.sh rewards63`.
- Results (under `flock /tmp/hearth-run.lock`, ≤ 5 per hold):
  - pass: rewards63, questhud61, weekquest62, quest-studio, quest-paris, lazy, unit:boot-test, unit:rewards-test,
    unit:quest-test, unit:questhud-test, unit:weekquest-test, unit:datasafe-scan
  - `node dev/lazy-manifest.js` was regenerated
  - not from this stream: unit:errorcalm-scan lists the same 7 earlier lines in Codex's tools/quest-journal.js /
    tools/outing-desk.js, and unit:commandonly-scan flags `/vst-preset`

## Changes outside my files
- `tools/quest-core.js` (Codex):
  - `balance` adds `bonus(s)` (the streak bonus sparks), and `bonus` is exported
  - `validate` checks `s.rewardBonus` (shape, one per week, 1–4 sparks) before its "balance < 0" check
- `tools/quest-journal.js` (Codex): one line in `rewards()` appends `RewardShelf.studio({...helpers}, state)` under the
  sparks balance. Nothing shows if rewards.js isn't loaded.
- `questhud.js` (questhud61):
  - the Rewards rows in the panel (`RewardShelf.hudRows`)
  - "My rewards…" in the chip's menu
  - `QuestHud.repaint()` exported
- `lazy-data.js` (+ regenerated `lazy-meta.js`): `rewards-core.js`, `rewards.js` and `rewards.css` join the `questhud`
  group.
- `dev/run-checks.js`: the unit test and the `rewards63` group.

## Risks
- The bonus is written to the journal on the first quest change of a week where it's due. A check that compares the
  journal byte for byte right after dispatching `hearth:quests` with a multi-week real-life streak could see one extra
  save. questhud61 and weekquest62 pass.
- A bonus already granted stays if you later undo the quest that earned it. It's small (≤ 20 XP a week) and keeps
  "can't go negative" simple.
- Priced treats (Codex's € `amount`) still follow Codex's monthly envelope. With the envelope at €0 they can't be
  claimed, which is Codex's rule. The starters carry no `amount` for that reason (the jar is separate).

## For the patch notes
- 🎁 **Real rewards for your quests**: give your XP somewhere to go. Think a record at Superfly (300 XP), a long
  breakfast at the Enfants Rouges (200 XP), a Serum preset pack (400 XP).
- The ✦ quest tracker now says how far you are: "120 XP to your next reward: a new record". When one is in reach,
  Claim… asks once and saves it.
- Claiming never lowers your XP or your level. It spends Sidequest Studio's sparks, the same ones as before.
- Sidequest Studio › Rewards has a small shelf: your next reward in XP, a few kind starters to add in one click (all
  editable), and every claim you've made.
- An optional savings jar: a reward like "Concert ticket fund +€10" asks you to move the money yourself, and "I moved
  it" notes it. Hearth never moves or sees money.
- Keep a streak of weeks with a real-life quest and you get a small weekly bonus toward rewards: +5 XP per week beyond
  the first, at most +20 XP a week.
- In any chat: `/reward`, `/reward add <name> <xp>`, `/reward redeem <name>`, `/reward history`, `/reward jar +10`.

## For Codex
- Nothing parallel: rewards are your `s.rewards` and claims are your `s.redemptions` (made by `C.redeem`). Enjoyed /
  returned and the goal star work as before.
- New optional fields:
  - on a reward: `jar` (€, 0–10000) and `art`
  - `s.rewardJar`: checked by `RewardsCore.checkJar`. `validate` passes it through untouched today.
  - `s.rewardBonus`: checked inside `validate`
  If you make `validate` strict about unknown keys, keep these (or call `RewardsCore.checkJar`).
- `balance(s)` now includes `bonus(s)`. If you rewrite `balance`, keep `+ bonus(s)`, or the bonus would stop counting
  and a journal that spent it would fail the "balance < 0" check.
- Studio hook: `rewards()` → `RewardShelf.studio({ E, label, p, button, meter, row, mutate, redeemDialog, rewardForm,
  dialog, field }, state)` returns a `section.qj-card.rw-shelf` or null. Its Claim button calls your `redeemDialog`.
- Starter ids are `r-rw63-<key>`. Their XP costs are stored as sparks (`cost = ceil(xp / 5)`).
