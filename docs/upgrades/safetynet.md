# safetynet (round 29): Hearth never loses work

The goal: whatever you were typing or tweaking survives a crash, a forced quit or the computer turning off. Most of
Hearth already saved itself a fraction of a second after a change; this round measured every place you type or
tweak, closed the gaps, and added a recovery card for the moments in between.

## The audit (before this round → now)
"Killed now" = the window's page crashes, Hearth is force-quit, or the power goes, right after the change.

| What you change | Saved where, when (before) | Killed right after (before) | Now |
|---|---|---|---|
| Lab code (the code box) | kv `three-sketches`, 0.6 s after the last keystroke; a long burst without a 0.6 s pause wasn't saved until the pause; a reload in that 0.6 s lost it | the last 0.6 s (or the whole burst) lost | saved at least every 2.4 s while you type and at once on a reload / update / close; the journal keeps it 0.25 s after a change; after a crash it comes back as a **time-machine version** |
| Lab sliders (moved, not saved into the code) | not saved by design (⚡ Save writes them into the code) | lost | in the journal; after a crash they come back in that version |
| Layers, keyframes, layer props | saved with the scene (0.6 s) | last 0.6 s lost | same as the code (saver + journal + version) |
| The Lab sequence | kv `video-cuts` via two debounces (0.3 s + 0.4 s); a reload within 0.3 s lost the edit | last ≈ 0.7 s lost | both written at once on a reload / update / close and during long drags; a crash still loses at most ≈ 0.7 s |
| Mood board | kv `board-<id>` 0.4 s after an edit, written on close / reload | last 0.4 s lost | the journal keeps the changed items; after a crash they're **put back** (only when newer than the save; deletes aren't replayed) |
| Chat drafts | localStorage 0.4 s after the last keystroke (never during a long burst) | last 0.4 s (or the burst) lost | saved during long typing too; in the journal; after a crash the draft **comes back in its box** (never over newer text; not if you'd sent it) |
| Queued messages (typed while a reply runs) | memory only | **all lost** | in the journal; after a crash they come back **in the box, not sent** |
| AI setup text (personality, instructions…) and dialogs | saved when you leave the box (change) | what you were typing lost | in the journal while unsaved; after a crash it becomes a **note** ("Recovered: Personality") |
| Settings (switches, pickers) | `config.json` written in place on each change | a cut mid-write could leave half a file | written to a temp file and renamed: whole or old, never half |
| Notes | kv `notes` 0.5 s after the last keystroke | last 0.5 s (or the burst) lost | saved during long typing and on leaving; a crash still loses at most 0.5 s |
| Lab notes / references | kv 0.3 s debounce | last 0.3 s | saved during long typing and on leaving |
| Chats, every kv store | store thread: temp file + rename | a power cut could leave an empty file (no flush) | flushed to the disk before the rename; a store that can't be read falls back to its previous version (`.prev.json`) instead of starting empty |

The journal is written ≈ 0.25 s after the last change (at least every 2 s during a long burst, at once when the window
hides or the page goes away), only when it changed, by the main process off its main thread (temp file, flushed,
renamed). Nothing runs while you do nothing (no polling, no heartbeat).

## Upgrades
### Knowing Hearth closed unexpectedly
1. **Session marker**: Hearth notes "running" at start and "closed cleanly" on a normal quit (also a restart / update); the next start knows when the last run crashed, was force-quit or lost power.
2. **The window's page reloads itself after a crash** (it used to stay blank), unless it crashed 3 times in 2 minutes.

### The work journal (kept a moment after you change something)
3. The Lab scene on screen: its code, layers, keyframes and layer settings.
4. The Lab's slider moves you haven't saved into the code yet.
5. Each chat box's draft.
6. Messages queued while a reply runs.
7. The mood-board items you just changed (big inline pictures left out: the board has them).
8. Any text box that saves only when you leave it: AI setup's personality and instructions, a dialog you're typing in (closed without saving = let go, not kept).

### After an unexpected exit
9. **One calm card, "Hearth closed unexpectedly — here's what was restored"** (bottom left, where the pick-up card shows), each line with its **Open**; it stays until you close it. Nothing to restore: a short "nothing was lost" note instead.
10. **Lab work comes back as a version in the time machine** ("Recovered after Hearth closed unexpectedly: your unsaved code and slider moves"): the scene itself stays as saved; Open shows that version in the time machine (keep it with one click).
11. **A draft comes back in its chat box**, only into an empty box or one holding the start of it; a draft you'd already sent stays gone.
12. **Queued messages come back in the box, not sent** (the ones that had gone out stay out).
13. **Board edits are put back** when they're newer than the board's last save; Open shows the board.
14. **Words typed in AI setup or a dialog become a note** ("Recovered: Personality"); Open shows it in Notes.
15. **Nothing comes back over newer data**: a newer save wins everywhere, nothing is overwritten, and a restore interrupted by another crash or reload runs again without doubling anything.
16. The card again any time: Ctrl/⌘+K → **What came back after Hearth closed unexpectedly** (or just ask: `/restored`).

### Saves that no longer wait for a pause
17. The Lab code box writes at least every 2.4 s during long typing, and at once on a reload, an update or closing.
18. Notes, the Lab's notes and references, and chat drafts: the same (written during a long burst, and on leaving).
19. The Lab sequence's edits are written at once on a reload / update / close (they could be lost in the 0.3 s before).

### Writes that survive a power cut
20. `config.json` (settings, AIs, AI setup) is written to a temp file and renamed: whole or old, never half.
21. Chats and every kv store are flushed to the disk before they replace the old file.
22. A kv store that can't be read (cut short, garbled) opens its previous version instead of starting empty and being saved over.

## How it works (for the next developer)
- `safetynetmain.js` (main, required from `main.js` with one line): `data/safetynet/session.json` (the marker, only the
  first instance keeps it), `journal.json` (this run's journal; the killed run's is set aside as `journal-prev.json`
  until the window says done), `render-process-gone` → note + reload, IPC `safetynet:status / keep / done`
  (+ `test-crash`, tests only: `HEARTH_TEST_SAVE_DIR`). The folder is local to the computer (`sync-merge.js` LOCAL_DIRS).
- `safetynet-core.js`: pure plans (`labPlan`, `draftPlan`, `boardPlan`, `fieldPlan`, the marker), unit-tested.
- `safetynet.js` (lazy group `safetynet`, first of the 'soon' groups): the journal (document `input` / `change` /
  `submit` / `pointerup` + `Board.onChange` + `hearth:sketch` → one timer) and the restore; the card is
  `SpeedResume.show` with its own title. `ThreeHistory.keepVersion(id, state, { label })` (tools/three-history.js) adds
  a version without putting it on screen.
- `saver(fn, ms, max)` in `ui.js`: a debounced save with a max wait and a flush on `pagehide` (with a few microtask
  rounds, so a save that starts another, like the sequence → CutStore, lands too). Use it for any new save.
- Tests: `node dev/safetynet-test.js` (unit: marker, journal file, plans), `dev/checks/safetynet.js` (a REAL renderer
  crash after editing Lab code, a slider, a chat draft, a board note and a dialog; everything comes back, the card,
  Open → the time machine). `sh dev/run-checks.sh safetynet`.

## Caveats
- A crash still loses up to ≈ 0.25 s of typing (the journal's own pause), and up to ≈ 0.7 s of a Lab sequence edit or
  0.5 s of a note (they save themselves that fast and aren't journaled).
- Text inputs (one line: a rename, a search, a setting's text field) aren't journaled; only multi-line text boxes are.
- Only the Lab scene on screen is journaled (switching scenes saves the one you leave).
- After a page crash the developer-report toast ("Hearth crashed last time… Report to the developer") still shows next
  to the card (devreport's own offer).
- Not tried on a real power cut or a real macOS / Windows force-quit here; the force-quit path is the same marker
  logic the unit test covers, and the crash path ran end to end headless.

## For the patch notes
- Hearth now keeps what you're working on a moment after each change, so a crash, a forced quit or a power cut no longer loses it.
- After Hearth closes unexpectedly, one card says "Hearth closed unexpectedly — here's what was restored", with an Open button per line.
- Unsaved Lab code and slider moves come back as a version in the time machine; your scene itself stays as it was saved.
- A chat draft comes back in its box, and messages you had queued come back in the box too (not sent).
- Mood-board edits from the last moment are put back; words typed in AI setup or a dialog come back as a note.
- Nothing is restored over newer work, and nothing is overwritten.
- If the window itself crashes, it now reloads by itself instead of staying blank.
- Settings and every saved file are written safely (whole or old, never half), and a damaged store opens its previous version.
- See the card again any time: Ctrl/⌘+K → "What came back after Hearth closed unexpectedly".
- Caveat: the last quarter second of typing before a crash can still be lost.
