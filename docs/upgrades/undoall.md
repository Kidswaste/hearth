# undoall (round 41): one "Undo last change" for the whole app

Hearth had grown many separate undos: the Lab's sliders and its time machine, what the AIs did (aiundo), Tidy memory's
toast, recipes, the board, the toast after a deleted chat, `/undo` for a few chat commands. Settings switches and ⋯ AI
setup rows had none. The owner shouldn't need to know which is which, so there is now **one small log of the changes
you can see** and **one key for all of them**. Each place's own undo still works; this sits on top and does the work
through them (nothing stored twice, except a copy of a deleted recipe / template so it can come back).

## Where you see it
1. **Ctrl/⌘+Z** outside text boxes undoes the last change, wherever you are (a chat, Settings, ⋯ AI setup, Activity,
   the chats list). In a text box it's the box's own undo; in the Lab and on the board, theirs (they win, as before).
2. **Ctrl/⌘+Shift+Z** (also **Ctrl+Y** on Windows) redoes the change you just undid.
3. A plain toast says what happened: **"Undid: Turned off Mood board for Claude · Redo"** (and "Redid: … · Undo").
4. **Activity (◉) › Recent changes**: the newest six changes in plain words with when, **↶** on each to undo that one
   (not only the last), **Show more** up to 40.
5. Undone changes stay listed, struck through, with **↷** to redo the last undone ones.
6. A change that can't be undone says so on its row ("can't undo", the reason on hover) instead of pretending.
7. The Lab's line: "Lab scene edits: their own undo in the Lab, or **History…**" (opens the time machine).
8. **Find anything (Ctrl/⌘+K)** "undo": *Undo last change*, *Redo last change*, *Recent changes: undo any of them*.
9. Just ask: **`/undo-change`** (also `/undo-last`) · `/undo-change redo` · `/undo-change list` · **`/redo-change`**.
10. The keys sheet (bottom left) lists Ctrl+Z / Ctrl+Shift+Z with what they do.

## What goes in the log (hooked once, not row by row)
11. **Settings**: anything Settings saves (folders, backups, notifications…) through one hook on the app's config save.
12. **Settings' on / off rows that live in a command** (A chime when a reply ends, Read replies aloud, Wrap code, the
    board's snapping, Don't show tips…): "Turned off “A chime when a reply ends”"; the row shows the undo at once.
13. **⋯ AI setup, What it can use**: "Turned off Mood board for Claude", "Turned on Web search for Astra"…
14. **Personality**: "Changed Claude's personality".
15. **Instructions**, with the words: "Added an instruction for Claude: “Always give me 9:16 versions”", removed,
    paused, turned back on, edited.
16. **Files on this computer**: "Changed what Claude can reach on this computer".
17. **How hard it thinks / How long its answers are**: "Claude thinks: Deep", "Claude's answers: Short".
18. **Memory, Habits and the Lab habits** rows (node graphs, the progress bar…), connections and hooks.
19. **The look** (a theme preset): "Changed the look to …".
20. **An AI removed** from the list comes back at its place; **adding an AI** is listed but not taken back (it would
    hide its chats): said plainly.
21. **A chat deleted** comes back from Recently deleted: "Deleted chat “Logo ideas”".
22. **A chat renamed**: "Renamed chat “Logo ideas” to “Logo ideas v2”".
23. **A chat moved** to a folder, archived or re-tagged: "Moved chat “Logo ideas” to “Work”".
24. **Tidy memory**: "Tidied memory (4 changes)" (facts saved since stay, as its own Undo does).
25. **A recipe deleted** and **a template deleted** come back: a copy is kept before they go to the Trash.
26. **What an AI just changed** (since Hearth started) is in the same order: Ctrl+Z on it goes through "Changes by
    AIs" (it shows what and asks first); those rows carry ✦ and the AI's name.

## Safe
27. A quick second change to the same thing is one entry (a switch flipped twice, a personality typed in two goes);
    a change that comes straight back to where it was leaves nothing.
28. Changed again since? "Undo anyway?" asks first; undoing puts back how it was before that change.
29. Already undone some other way (the deleted chat's toast, Tidy memory's own Undo)? It says "Already undone" and
    doesn't do it twice.
30. Only your own changes: an AI's command (in "Changes by AIs" already), a feature saving by itself, bookkeeping
    values and the window layout are never logged (a change counts when it follows your click or key).
31. A new change closes redo, as in every editor; Ctrl+Z pressed twice fast undoes two changes, one after the other.
32. Never undone: anything that left Hearth (nothing in this log does) and what can't be undone safely: said plainly.
33. What shows the value follows an undo at once: the open ⋯ AI setup, Settings' rows, the chats list.

## Light
34. Its own lazy group (`undoall`, ≈ 30 KB with its CSS) after the first screen; no timers, nothing while idle.
35. This computer's log only: `data/.undo-hold/log.json` (a dot folder: sync leaves it here), ≤ 120 changes, a week;
    kept copies no change points at any more go to the Trash at the next start.

Count: **35** upgrades.

## Tested
- `node dev/undoall-test.js` (unit, 41 checks; in `sh dev/run-checks.sh unit`): ids and order, next undo / redo, a new
  change closes redo, skipped entries, merging and back-to-start, pruning and loading; config diffs of settings / AIs /
  the look (bookkeeping and layout left out), undo / redo into the same agent objects, changed-since both ways, an AI
  removed (back at its place) / added (not undone), the plain words (tools per engine, instructions, personality, files,
  effort), switch arguments, chat meta patches and words.
- `sh dev/run-checks.sh undoall` (≈ 35 s, real CDP key presses): a Settings switch → Ctrl+Z (the row follows, toast
  with Redo) → Ctrl+Shift+Z → Ctrl+Z; ⋯ AI setup Mood board → Ctrl+Z (sheet + config.json follow); delete a chat →
  Ctrl+Z → Ctrl+Shift+Z → Ctrl+Z; rename and folder → Ctrl+Z; the message box keeps its own undo; the Lab's sliders and
  the Lab on screen keep theirs; back in the chat Ctrl+Z works; Activity › Recent changes ↷ / ↶; Find anything "undo";
  `/undo-change list`; the log on disk; the keys sheet; no duplicate command.
- Also run, all green: options, settingscalm (+ tidy, simplify2, firstrun, appsearch on a re-run: its AI setup jump
  missed its 6 s window twice under load, as it can on the base branch), aiundo, memorytidy, labrecipes, labtemplates,
  a11y, lazy, unit:boot-test, unit:cache-test, unit:director-mcp-test; `node dev/lazy-manifest.js` (rebuilt, matches).
- qa-keys fails on the base branch too (a few app-wide keys "dead" under load, a different few each run); the new
  Ctrl+Z / Ctrl+Shift+Z lines aren't among them (noted as text-box no-ops; the board's own Ctrl+Z is listed as a
  conflict on purpose: the board wins there).

## Notes / risks
- The Mac: the Edit menu also has ⌘Z. Chromium normally lets the page see ⌘Z first (this stops it only where it acts,
  so text boxes keep the menu's undo), but it wasn't tried on a real Mac: if the menu takes ⌘Z first there, ⌘Z outside
  text boxes does nothing and Activity › Recent changes / Find anything "undo" still work.
- "Your change" is a save within 3 s of a click or key (1.5 s for renames / folders): a feature that saves the config
  by itself right after you click something else could land in the log (it can still be undone or ignored).
- Board edits are not in this log (the board's own Ctrl+Z, as before); the owner's Lab scene edits stay in the Lab's
  own undo / History. AI changes are listed only since Hearth started (older ones: Activity › Changes by AIs).
- A change made in the first second or two after start (before the group loads) isn't logged.
- Outside this lane (small, additive): `settings-find.js` (switches go through `UndoAll.viaSwitch`, rows repaint on
  `sf-repaint`), `memorytidy.js` (one line after a tidy), `tools/three-recipes.js` and `tools/three-templates.js`
  (a copy before the Trash, one line after), `activity.js` (mounts the part; "All quiet" counts it), `lazy-data.js`
  (the group + manifest), `index.html` (the lazy-at tag), `mcp/hearth-map.js` (one sentence, read on demand),
  `dev/run-checks.js` (group + unit). It wraps `saveConfig`, `Native.remove` / `Native.rename` and `ChatUX.setMeta`
  at load (no edits in those files).

## For the patch notes
- **One undo for everything**: press Ctrl/⌘+Z anywhere outside a text box to take back your last change: a setting,
  an AI's setup (its tools, personality, instructions, file access…), a deleted, renamed or moved chat, a memory tidy,
  a deleted recipe or template.
- **Ctrl/⌘+Shift+Z** brings it back (Ctrl+Y works too on Windows); a small note says what was undone, with Redo.
- **Activity › Recent changes** lists your latest changes in plain words, with ↶ to undo any one of them.
- Text boxes, the Lab and the mood board keep their own undo, exactly as before.
- What an AI just changed is in the same order: Ctrl+Z on it shows what it was and asks first.
- If something changed again since, Hearth asks before undoing; what can't be undone says so plainly.
- Also in Find anything (type "undo") and by asking: /undo-change, /redo-change.
