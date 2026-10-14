# ✦ Since you were away (round 42, whatsnew)

Hearth gets several rounds of upgrades a day; you update now and then and used to face a pile of patch notes (rounds
33–41 at once). Now an update that brings two rounds or more shows **one calm card** instead: the top changes of every
round you missed, grouped by what you do, one plain line each, with **Show me** where a feature has a place to go.
Built on this computer from the patch notes themselves: 0 tokens, nothing sent, nothing added to any prompt. The
per-round notes are unchanged and one click away.

## What shipped
**The digest**
1. ✦ **Since you were away** card after an update that brings two or more rounds (bottom left, like the pick-up card):
   "Hearth updated: 9 rounds of changes (33–41): the ones worth knowing, in one place."
2. Grouped by what you do: **Lab · Chats & AIs · Saving tokens · Mac & Windows · Everywhere · Fixes** (Everywhere holds
   app-wide things like Undo, Settings and Find anything, which fit none of the others).
3. About **12 lines**, each one plain line ("Recipes — Do your usual finishing steps once, replay them on any scene in
   one click"); no Markdown, no /commands.
4. **and N more** opens the rest of the changes in place, grouped the same way.
5. **Show me** on a line jumps to its place, reusing Find anything's places: a Settings row (Size of everything, Don't
   show tips, Sync…), an ⋯ AI setup row (Where its tokens go, Tidy memory, How long its answers are, What Smart has
   learned, Continue lighter…), or for a Lab feature the Lab with its own search opened on that name.
6. **Read the full notes** opens the existing per-round reader (📰 Patch notes) on the newest round.
7. **↶ Go back** stays on the card, as on the old "Hearth updated" note.
8. ⤢ opens the same digest as a bigger page.

**Choosing the lines (local, from docs/patch-notes/round-NN.md)**
9. Each round's parts are read: the headline of each part (its name + its first plain line), lines with a bold name,
   and the 🐞 Fixed lines; "Good to know" stays in the full notes.
10. The same thing in two rounds shows once, with the later round's words; a renamed thing ("Shine (was Glow)") shows
    only under its new name.
11. A fix of something that is itself new in the digest folds into it (you never met the bug); a fix of something
    older stays as a fix.
12. Lab and chat features lead, plain speed improvements wait in "and N more", a few lines per group, fixes get a line
    or two.

**When it shows**
13. It is the **first** note after an update (through Hints, as the patch notes were: hintcalm's rule); one round
    alone keeps the usual "Hearth updated … 📰 Patch notes" note.
14. The ✦ What's new card that used to follow an update stays away for an update the digest covered: one note, not two.
15. Which rounds you've seen is remembered **per computer**; it never shows the same rounds twice.
16. Updated some other way (pulled by hand)? The next start brings the digest once, the same calm way.

**Any time**
17. Settings › Updates & what's new › **What's new…** › **Since you were away** (first row of that menu).
18. Ctrl/⌘+K "Since you were away" (also found by "what changed", "digest", "missed"); nothing new → the last digest
    again.
19. Chat command: `/since-away [round]` (alias `/catch-up`): e.g. `/since-away 33` = everything since round 33.

## How it works
- `whatsnew-core.js` (pure, Node-tested): `parse` (round → items), `groupOf`, `dedupe`, `digest(rounds, { seen, cap })`,
  `goFor(item, AppSearchData)` (Show me's place).
- `whatsnew.js` + `whatsnew.css`: the card, the dialog, Show me (AppSearch.toSettings / toAiSetup, LabSearchHook.open),
  `store whatsnew.seen` (newest round shown on this computer), `whatsnew.last`. Lazy group `whatsnew` (tier use, after
  `appsearch`), so the first screen is unchanged (72 scripts / 29 sheets).
- `updater.js`: the after-update Hints offer asks `WhatsNew.afterUpdate(j)` first (≤ 2.5 s, else the old toast); a cheap
  start check reads only `docs/patch-notes/index.txt` and loads the group only when a round is new. No record yet →
  the rounds whose notes the update brought (else: start from the newest, silently).
- Tests: `node dev/whatsnew-test.js` (48 checks on the real notes; in run-checks' unit list), `dev/checks/whatsnew.js`
  (seen = 32 → 33–41 digest grouped, first note, Show me → AI setup row and the Lab search, full notes, Settings row,
  seen updated, not again after a reload, a hand-pulled update once through the queue).

## Edits outside the new files
- `updater.js` (the after-update note asks for the digest; start check; `Updater.sinceAway()`).
- `appui.js` (one row in Settings › What's new…), `discover.js` (the ✦ What's new card's `still:` skips a covered update),
  `appsearch-data.js` (the What's new row's words), `lazy-data.js` (+ regenerated manifest), `index.html` (the group
  name in the existing `lazy-at.js#…` tag), `dev/run-checks.js` (unit list).

## For the patch notes
- **✦ Since you were away**: after an update that brings several rounds, one calm card replaces the pile of notes —
  the top changes of every round you missed, about 12 lines.
- Grouped by what you do: Lab · Chats & AIs · Saving tokens · Mac & Windows · Everywhere · Fixes; one plain line each.
- **Show me** takes you there: the Settings or AI setup row (it lights up), or the Lab with its search on that feature.
- **and N more** shows the rest in place; **Read the full notes** opens the round-by-round notes as before.
- Shown once: Hearth remembers on each computer which rounds you've seen.
- Any time: Settings › Updates & what's new › What's new… › Since you were away, or Ctrl/⌘+K "since you were away".
- Made on your computer from the patch notes: 0 tokens.
- Caveat: a single-round update keeps the usual "Hearth updated" note with 📰 Patch notes.
