# settingscalm (round 39): Settings, read top to bottom

You said Hearth must be "so much simpler". simplify3 calmed ⋯ AI setup (a few parts, the rest folded with one line
saying where it stands); this pass does the same for **Settings**. Four plain sections now, one obvious control per
row, everything rarer in folds that tell you their state without opening them, the rarest under Advanced. Nothing was
removed: every row is still in Settings (the search and Ctrl/⌘+K Find anything open the folds it sits in), and one
thing that was only reachable by a command or the palette (your backups) got its button.

## Audit: what Settings shows (before → after)
Counted by `dev/checks/settingscalm.js` (new) the way simplify2 / simplify3 count: visible buttons, selects, inputs,
summaries, links. Screenshots looked at before and after (first sight, and every fold open, scrolled through).

| Part of Settings | Before (first sight) | After (first sight) | Before (all open) | After (all open) |
|---|---|---|---|---|
| Search | 1 | 1 | 1 | 1 |
| Your AIs line → **Your AIs** | 1 | 2 (⋯ AI setup · Programs fold) | 1 | 4 |
| Look → **Look & size** | 15 | **5** (3 looks · Size · fold) | 63 | 58 |
| Sync → **This computer & sync** | 1 | 3 (Sync · Check this computer… · fold) | 1 | 8 |
| Updates → **Updates & what's new** | 4 | 3 (Look now · What's new… · fold) | 4 | 7 |
| Keys | 2 | (in Advanced) | 2 | (in Advanced) |
| Advanced | 1 | 1 | 71 | 71 |
| Cancel / Save | 2 | 2 | 2 | 2 |
| **Total** | **27** | **17** | 145 | 151 |
| Open sections at first sight | 4 | 4 | | |
| Height of the form at first sight | 1047 px | 937 px | | |
| Folds with a line saying where they stand | 0 of 1 | **13 of 13** | | |

"All open" grew by 6 because each fold's title row is itself a control (12 folds); the rows inside are the same
(the size picker went from 6 buttons to one list, the look tweaks lost their own "Advanced" fold).

## Upgrades

### Four plain sections
1. Settings reads top to bottom: **Look & size**, **Your AIs**, **This computer & sync**, **Updates & what's new**,
   then **Advanced** folded. 27 controls at first sight → 17; it fits a laptop screen.
2. Each section shows one obvious control per row; the rest waits in a fold whose title row says where it stands on
   the right ("Opens on what you used last · stays in the tray", "Enter sends · 7 of 12 on", "Found by themselves").
3. The fold lines change the moment you flip something inside (a switch, a tick box, a field).
4. What you open yourself stays open next time (this computer only); folds the search or Find anything opened for you
   don't.
5. Every row and every fold explains itself in one sentence when you point at it.

### Look & size
6. The three main looks on one row, then **Size of everything** as one list ("Auto (125 %)", 100 … 200 %; it was six
   buttons), kept per screen as before (⌘/Ctrl + / − still work and show in the list).
7. **More looks and tweaks** (fold, says the look in use, "follows your computer", "no sparkles"): ◐ Match my
   computer, ✦ Let Astra pick, your saved looks, Every look (searchable), and textures / glow / motion / spacing /
   corners / chat font / accent / tooltips / Save as… shown at once (no second "Advanced" inside), Sparkles.
8. The Appearance window (Ctrl/⌘+Shift+L) is unchanged.

### Your AIs
9. **⋯ AI setup** (who they are and what they can use) and the **Claude and Codex programs** fold (moved up from
   Advanced; it says "Found by themselves" or which one uses your own path).

### This computer & sync
10. Sync (this computer's name, its state, Turn on sync… / Sync now) as before.
11. **Check this computer…** is in sight (it was under Advanced).
12. **Starting and closing** (fold): Open on start ("What you used last" instead of "Last used (first agent)"),
    Start Hearth when you log in / when Windows starts (the Mac's Login Items note moved to the hover text), keep
    running in the tray, the pick-up card.

### Updates & what's new
13. One line saying where updates stand with **Look now** beside it, **What's new…** (Patch notes · What's new for
    me · Go back), and **Updates and tips** (fold): Install updates by themselves, Don't show tips.

### Advanced: eight folds, each with its state
14. **Chats** ("Enter sends · 7 of 12 on"): notifications and the chat switches.
15. **Keys** ("Show / hide: Control+Alt+H"): Keyboard keys… (the keys button bottom left has it too) and the show /
    hide key (moved here: used once).
16. **Mood board** ("Guides on · grid off · minimap auto"): its switches now light up with their real state (they
    never showed one).
17. **Spell check languages** ("English (US)"), **Tools in the rail** ("Every tool in the rail" / "2 off the rail"),
    **Folders** ("Found by themselves" / which ones are set).
18. **Housekeeping** (was "Hearth": "Weekly tidy on · timers paused"): unload idle websites, Meshy key…, weekly tidy,
    pause every timer.
19. **Backup and files** ("Backups when you ask" / "Backs up by itself weekly"): **Backups…** opens your backups (Back
    up now, save a copy as one file, restore, back up by itself daily / weekly / monthly). It replaces "Back up hub
    data…", which the Backups window has as "Save a copy as…"; the Backups window was only reachable by a command or
    Ctrl/⌘+K until now.

### Finding things
20. The Settings search opens every fold its match is in (also a fold inside Advanced) and folds them back when you
    clear it; `/settings program`, "Show me where to set it" and "Put tools back in the rail…" land open.
21. Ctrl/⌘+K Find anything knows every moved row in its new place, with its new path ("Settings › Look & size › More
    looks and tweaks"); two new rows: ⋯ AI setup and the look tweaks. Its "how do I" answers point at the new places.
22. Right-click Settings › Go to opens the folds around the section it jumps to (and says "folded").
23. Lines elsewhere that pointed at old places now point at the new ones: the engines report ("Settings › Claude and
    Codex programs"), the tips toast, the Discover "What's new" tip, Adobe's After Effects hint, the first-run card's
    "Comes back from Settings › This computer & sync".

**23 upgrades.**

## How it's built
- `appui.js` `openSettings`: the sections and `fold(key, title, tip, state, section)`: a `<details class="sc-fold">`
  whose summary holds the title and `.sc-state`, wrapped around a normal `.settings-section` (its `<h3>` hidden by CSS),
  so the search, Find anything and the right-click Go to keep finding sections by name. States repaint on `change` /
  `input` / `click` in the form and on `sf-changed` (settings-find.js, after a switch answered). Open folds: store
  `settings.open`, written only from a click on a fold's title.
- `settings-find.js`: homes `start` (Starting and closing), `updates` (Updates and tips: now also Don't show tips),
  `hearth` (Housekeeping); `SettingsFind.state(cmd)`; the board switches read `Board.prefs()`; the filter opens every
  fold (Advanced and `.sc-fold`) a match is in and restores them; the folds' CSS.
- `look.js`: `Look.picker({ split: true })` returns the looks row with `box.rest` (the rest of the picker) for the fold.
- `bigscreen.js`: `Bigscreen.sizeRow({ compact: true })`, the same choices as one `<select>` (synced like the row).
- `appsearch-data.js`: sections / paths (`ADVANCED`, `PARENT`, `pathOf`), every moved row, help answers; `appsearch.js`
  uses `pathOf` for the switches and "Look & size" for the looks.

## Edits outside my lane (small)
`look.js`, `bigscreen.js` (opt-in variants, the Appearance window and its checks untouched), `appsearch.js` (2 lines),
`declutter.js` (Go to opens folds), `firstrun.js`, `hints.js`, `discover-data.js`, `engine-health.js`, `chat-cmds.js`,
`adobe-cmds.js` (text pointing at the new places), `dev/run-checks.js` (a `settingscalm` group), `dev/checks/firstrun.js`
(Check this computer… is now in This computer & sync, in sight: same strength, new place).

## Tests
- `dev/checks/settingscalm.js` (new): fails when first sight shows more than 18 controls (17 now; a fourth look tile
  shows while you're on a look that isn't one of the three) or more than 4 open sections, when a visible row or a fold
  has no hover sentence, when a fold has no state line or the Chats line doesn't follow the chime switch, when any of
  the 53 rows Find anything knows isn't found in its section (and in or out of Advanced as its path says), when
  something Settings had before is gone (45 labels, Sync, the rail ticks), when a /command shows, or when searching
  "chime" doesn't open its folds. Before this pass: 5 failures; after: PASS.
- Updated (same strength, new place): `dev/checks/firstrun.js` (Check this computer… in This computer & sync, in sight).
- Run (`sh dev/run-checks.sh settingscalm …`): settingscalm, appsearch, tidy, simplify2, simplify3, options, firstrun,
  declutter (70 ok, 0 bad), bigscreen, bigscreen-hidpi, nativefeel, updater, hintcalm, twocomputers, sync, lazy and the
  unit tests appsearch-test (10/10), boot-test, firstrun, bigscreen, nativefeel, winmac, winpolish, macpolish, hintcalm,
  sync: all pass, with two things that are not from this pass (both seen on the base commit 46e12c3 too / in a file not
  touched): appsearch's "cheaper → Spending … in the first 6" step (fails the same way on the base commit), and page
  errors from `tools/three-abcompare.js` (its keydown handler gets a synthetic event in the declutter check).
- Screenshots: first sight (before / after) and every fold open, scrolled through.

## For the patch notes
- Settings reads top to bottom in four plain sections: Look & size, Your AIs, This computer & sync, Updates & what's
  new. Advanced holds the rest.
- 27 controls at first sight became 17; nothing was removed.
- Every fold says where it stands in one line ("Opens on what you used last", "Enter sends · 7 of 12 on", "Found by
  themselves") and updates as you change things; what you open stays open.
- Size of everything is one list now (Auto shows the size it picked).
- More looks and tweaks holds Match my computer, Let Astra pick, every look and the finer touches in one place.
- Check this computer… is in sight under This computer & sync.
- Advanced › Backup and files › Backups… opens your backups: back up now, restore, or let Hearth back up by itself.
- The mood board switches in Settings now show whether they're on.
- The Settings search and Ctrl/⌘+K open the fold a setting is in and light it up.
