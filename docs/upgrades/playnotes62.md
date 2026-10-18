# Round 62: playtest notes for Clink in ▶ Play (playnotes62)

While you play Clink in ▶ Play, **F8** drops a note at that moment: a picture of the frame, the time into the session,
what the game saves (a Lab layer's `saveState()`, or an HTML build's `window.hearthState()` / `window.game`), the
camera and the player's position, and the frame rate right then. **Shift+F8** also opens a small box over the game
for words: type them, or press 🎤 to use Hearth's voice input (only when you press it). When you go back to editing
(Ctrl/⌘+P) or leave, Hearth says "3 notes from this playtest". The **Playtest log** shows each note's picture and line.
Clicking a note puts the Lab's scene back at that moment (its layers' `restoreState()`, their cameras). **Fix this**
writes the note up as a task in the Three Director's box, with the picture attached. It is never sent: you press Enter.

**Cost while playing: none until you press the key.** The key is read main-side with Esc / F / Ctrl+P
(gamemodemain's `before-input-event`). Nothing is added to the game's page: no script, listener or frame callback.
The picture is taken once, on the key (`capturePage`: the compositor's frame, no per-frame capture, no
`preserveDrawingBuffer`). The frame rate comes from numbers that are already counted: the performance probe's ring when
it's attached, otherwise the budget watch's last second. Reading the state is one short `executeJavaScript` in the page
(≈ 0.1–1 ms, on the key press only). Nothing goes into any prompt (0 tokens) unless you send the director's draft. The
game's own files are never touched.

New files: `playnotes-core.js` (pure), `playnotes.js` + `playnotes.css` (hub, lazy group `gamemode`), `playnotesmain.js`
(main), `dev/playnotes-test.js` (unit), `dev/checks/playnotes62.js`.

## Upgrades
### In the game
1. **F8 drops a playtest note**: the frame's picture, the time into the session, the game's saved state, the camera
   and player position, and the fps / frame time at that moment.
2. **Shift+F8**: a note plus a words box over the game. Enter keeps the words and Esc closes the box (the words stay).
   Keys typed there never reach the game, and F doesn't open the stats chip while you type.
3. **🎤 in the box**: say it instead of typing. This uses Hearth's own local voice input, only when pressed.
4. "✎ Note 3" shows over the game for a moment. The game never sees the F8.
5. The start hint names the key ("… · ⌘P: back to editing · F8: note").
6. The key can be changed: `/playtest key F9` (F1–F10, or a letter with Ctrl / Alt / ⌘). The game's plain keys,
   F, Esc, ⌘P / ⌘Q / ⌘W are refused.
### After the session
7. **"3 notes from this playtest"** when you go back to editing (Ctrl/⌘+P) or leave, with **Open the log**.
8. **Playtest log**: a picture per note with its moment, fps, where the player was and the words (editable in place).
   It can show this playtest only or all of the game's notes.
9. **A click on a note jumps the Lab back there**: the scene opens, its layers get what they saved then
   (`restoreState()`), and the cameras go back to where they were. For an HTML build, its ▶ Play window gets
   `window.hearthRestore(state)` if the game defines it, plus its camera.
10. **Fix this**: the Three Director's box gets the note as a task (its words, the moment, fps, position, a few state
    numbers, "Fix this.") with the picture attached. It is a draft, never sent.
11. ✕ removes a note. **Clear…** moves the game's notes to the Trash.
### Chat and menus
12. `/playtest notes [game]`: the list in the chat and the log opened.
13. `/playtest note <n>`: jump to note n. `/playtest fix <n>`: the director's draft.
14. `/playtest clear [game]`: to the Trash. `/playtest key [F8]`.
15. ▶ Play's right-click: **✎ Playtest log**. Ctrl/⌘+K: ✎ Playtest log. The keys sheet lists F8.
### Kept safe
16. Notes are kept per game in `data/game-cache/<game>/notes` (log.json + a JPEG each). Writes are atomic. A log that
    can't be read is never written over (the note says so). There are at most 200 per game.
17. diskcalm's "Optimized 3D models" free-up leaves the notes alone (they're yours, not a cache).

17 upgrades.

## Edits outside the new files
- `gamemodemain.js`: requires playnotesmain (the key first in `before-input-event`, `notesKey` in the window's JSON,
  the `game:notes` / `game:note-*` channels, `ended`).
- `game-preload.js`: the key in the hint, "✎ Note n", the words box (made on first use; its window capture listeners
  exist only while it's open), and the pointer-lock card that the box doesn't trigger.
- `gamemode.js`: `notes` in `game:play`, the log row in ▶ Play's right-click.
- `preload.js` (`hub.game.notes` / `onNotes`).
- `tools/directorgame.js`: `/playtest notes | note | fix | clear | key` routed to PlayNotes (args, examples, complete).
- `tools/gameperf-probe.js`: `recent(n)` (the last frames from its ring; read on the key only).
- `tools/playbudget-page.js`: `pace()`. Two slots of its typed array, written once a second (the window's frames and
  length), with no allocation.
- `voice.js`: `Voice.start({ into })` sends the words to a function instead of a chat box. It gets null when nothing was
  heard.
- `diskcalmmain.js`: the optimized free-up skips `game-cache/*/notes`.
- `lazy-data.js` / `lazy-meta.js` (regenerated), `dev/run-checks.js` (group `playnotes62`, unit `playnotes-test`, three.js
  dir), `tools/game-api.md` (the Playtest notes section).

## Tests
See the final report below (filled in after the runs).

## Risks
- **Typing in the box while the game runs**: the game keeps playing (it isn't paused). The box's keys are stopped at
  the window's capture phase. A game that registered its own window *capture* listener before the box opened still
  sees them (rare: games listen in the bubble phase).
- **Jumping back needs the game's help**: a Lab layer without `saveState()` / `restoreState()` only gets its camera
  back. An HTML build needs `window.hearthRestore(state)`. A note without either is a picture and numbers ("picture
  and numbers only").
- The picture is the window as shown, so Hearth's own chip or blip shows in it if they were on screen.
- The note's time is the time since the window opened, and it includes time spent resting.
- Voice in the box needs Hearth's speech-to-text set up (`/voice`). Without it, the box says to type.

## For the patch notes
- **Playtest notes.** While Clink plays, press **F8** to note a moment. Hearth keeps a picture of that frame, the time,
  where you were and the frame rate right then. **Shift+F8** lets you add words (type or say them).
- Back in the Lab (⌘P / Ctrl+P), "3 notes from this playtest" opens the **Playtest log**. Click a note and the Lab's
  scene jumps back to that moment. Press **Fix this** and the Three Director gets it as a task with the picture,
  ready for you to send.
- It costs your game nothing while you play: Hearth does no work in the game window until you press the key.
- `/playtest notes`, `/playtest clear`, and `/playtest key F9` to use another key.
