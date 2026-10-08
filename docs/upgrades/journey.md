# Journey stream (round 3): your real workflows, end to end

This pass used the merged app the way you do: a music visual from scratch in the Lab with the docked Three Director,
a review-and-export pass in Video Review, chatting with Claude and Astra together, the same Lab session driven only
by typed `/commands`, and the first launch after `git pull` on a data folder made by the app as it was before the
night build. It used real mouse clicks and key presses (not code calling buttons) and screenshots of every step.
Everything it found is fixed below. Re-run it any time with `sh dev/journeys.sh` (details at the end).

## Three.js Lab
1. Fixed: **a click on 9:16 could select 16:9.** When the mouse reached the preview, the size readout (and, with the director docked, More… / Safe / 📷) appeared and pushed the size buttons left, under the pointer. The extras now open on a row below, so the size buttons never move.
2. Fixed: **after a click on the picture, the Lab's keys did nothing.** F (Freeze), R (Shuffle), Shift+1…5 (sizes), X (effects), T (Tap), Space and Alt+N went to the preview and were lost. They now work wherever you clicked, unless the sketch uses that key itself. The director's simulated key presses still stay in the sketch.
3. Fixed: **the preview could stay black when the Lab opened.** It loaded twice at start, and the second load sometimes never finished. Nothing rendered, the music didn't play and the director's screenshots failed until you ran the sketch again. It now loads once. A preview that doesn't start within 10 s is reloaded by itself (twice at most).
4. Fixed: **a still could hang**, or come back as "Nothing is rendering", when it was taken while the director was also taking a screenshot. Pictures asked for at the same moment now share the next frame. A second picture no longer opens a "Save screenshot" dialog.
5. Fixed: **Play right after loading a song did nothing** (Space, ▶ or `/play`). The play is now kept until the song reaches the preview.
6. Fixed: **Space on a button you had just clicked also pressed that button.** For example, Tap then Space added a tap. Space now only plays or pauses.
7. Fixed: **Nodes in a narrow Lab** (the director docked on a laptop-width window) were squeezed into three columns of about 200 px. The Lab now keeps its stacked layout in Nodes mode as well.
8. Fixed: in that stacked layout the code / nodes pane grew to the full length of the code (about 2,300 px), so node presets landed out of sight. It now gets a screen-sized box.
9. Fixed: the sketch name in the Lab toolbar's picker was clipped at the bottom.
10. Fixed: slider names typed without the dot now work. **`/knob bloom strength 0.8`** used to find nothing for "Bloom · Strength". The `/` menu suggests them too: "bloom st" finds Bloom · Strength.
11. Fixed: **`/fx vhs`** now gives "VHS tape", as the X picker does. Before, it gave "Found footage", whose internal id is `vhs`.

## Chat commands and the `/` menu
12. Fixed: **Enter ran something other than what you typed.** With suggestions open, Enter replaced every argument with the highlighted one: `/compare v1 side` became `/compare side` and didn't run. Enter now runs what you typed. It still completes a word you're partway through (`/size 9` → `/size 9:16`) and a row you picked with ↑↓.
13. Fixed: **a command typed in full ran a different command.** `/opinion` + Enter turned into `/opinion-chat`. `/save` + Enter turned into `/save-sliders`. A full name or alias now runs on Enter and is listed first.
14. Fixed: picking a suggestion now completes only the word you're typing. `/compare v1 si` → `/compare v1 side`. A suggestion that contains everything you typed replaces it all: `/knob bloom st` → `/knob Bloom · Strength`.
15. New: **`/save`** saves the sliders into the code. Save is your most-used Lab button and had no plain command (`/save-sliders` and `/ss` still work).
16. New: **`/play`** and **`/pause`** play and pause the song in the Lab and its director chat. Before, they opened Video Review and played a video there. Elsewhere they still drive Video Review.

## Video Review
17. Fixed: **Space and the arrow keys did nothing right after you clicked a render** in the library. The list redraws on a click and the keyboard focus went with it. You can now click a card and press Space at once.
18. Fixed: **pressing N while drawing dropped the drawing.** The usual order is D, draw an arrow, N to write. N now keeps the open note, with its marks and text.
19. Fixed: the "Feedback is ready in the Video Director's chat box" toast sat on top of that chat box. Toasts now sit above a docked chat's composer and Send button, in the Lab too.
20. Fixed: each library load logged an error when a default render folder (Desktop, Documents/Codex) didn't exist. Missing folders are now skipped quietly.

## Token meter
21. Fixed: **second opinions, quick asks and collaboration seats now show in the meter at once.** They were counted but the strip only caught up at the next chat reply. Measured: a `/opinion` costing about 4.5k tokens appeared immediately.

## Checked and fine (no change needed)
22. Verified: the first launch after `git pull` on a pre-night data folder made by the pre-night app itself (your agents, both directors docked, Forgeheart, five chats with a pinned and a renamed one, memory, a sketch without layers, a beat map, video notes, usage). Nothing was lost and there were no errors. The Forgeheart preset now shows Forgeheart 2 (`/classic` goes back). The old sketch opens as one layer. Old chats continue in the same engine session. The meter counts the old usage. The moved-folder path fix ran.
23. Verified: the meter's totals match the replies' own token counts. The meter also counts the handoff's summary turn, which isn't kept in any chat.
24. Verified: `/duo`, `/relay`, a second opinion in both directions, `/handoff`, `/pin`, `/bookmark`, `/export md`, searching inside messages from the chats panel and `/search` all work end to end. So do Ctrl+Shift+U, Tap tempo (±1 BPM), K markers, X → filter / look, Shuffle + Save, Freeze on the beat, stills and recordings at the exact frame size, Alt+N and node knobs, the dock's undo, A/B compare, drawn notes, feedback to the Video Director and "Export all 4 socials".
25. By design (noted): Shuffle (and `/shuffle`) only moves named sliders. A new sketch made from a starter template has only raw values, so it says "Nothing to shuffle" until the director (or a node preset) gives it named sliders.

## Tools for the next agent (not counted)
- `dev/checks/journey-lab.js`, `journey-video.js`, `journey-chat.js`, `journey-commands.js`, `journey-upgrade.js` and their shared `journey-lib.js`. They send real CDP mouse and key events, fail a step when something covers the button it clicks, and save a picture per step. `sh dev/journeys.sh [names] [--shots dir]` runs them.
- `dev/smoke.js`: a `smoke()` bridge for checks (real `Input.*` events and screenshots taken mid-check). `--data <dir>` starts from a given data folder and config. `--lib <file>` adds shared helpers. Save dialogs write into `--save-dir` (default `<copy>/test-saves`, also `window.SMOKE_SAVES`). `--open` answers open dialogs. `fsapi.js` honours `HEARTH_TEST_SAVE_DIR` / `HEARTH_TEST_OPEN` (only the test harness sets them).
- `dev/make-test-song.js` writes a 120 BPM WAV with kick, snare and hats and a "drop" halfway. `dev/fixtures/old-data/` is a pre-night data folder plus config, made by `dev/checks/journey-olddata-make.js` running in the pre-night app (commit a8442ba).
