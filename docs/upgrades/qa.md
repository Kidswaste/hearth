# QA stream (round 2): the eight streams tested together

Round 1 built chat, meter, look, lab, video, fx, nodes and add-ons in parallel. This pass ran them together
(fake engines, the Lab, Video Review, the look effects and the meter all at once) and fixed what collided.
Re-run the checks any time: `node dev/smoke.js [--fake-engines] --script dev/checks/qa-*.js` (see each file's header).

## Chat commands that collided (443 commands, now 0 duplicates)
1. Fixed: registering a command name twice used to replace the first one silently. It now prints a console warning and is listed by `Commands.duplicates()`. Deliberate replacements are marked.
2. Fixed: commands can now **share a name by context**. The command that fits where you are runs: in a tool (or its docked chat) you get the tool's version, anywhere else the general one. This works whatever order things load in.
3. Fixed: `/compare` and `/speed` in Video Review (A/B compare, playback speed) were sometimes replaced by the meter's commands, depending on startup timing. Now they are always Video's in Video Review and the meter's elsewhere.
4. Fixed: `/goto`, `/timecode` and `/section` were Video-only and broke the chat's `/goto` (jump to a message), the Kit's `/timecode` calculator and the Lab's `/section` cue. In Video Review they drive the video. Elsewhere they are the chat jump, the Kit calculator and the Lab cue.
5. Fixed: the Lab's `/run` replaced the chat's `/run /cmd ; /cmd` chain, which your own `/alias` commands use. `/run` on its own reruns the sketch. `/run` followed by commands chains them.
6. Fixed: the Lab's `/look` replaced the Appearance picker's. `/look` is your saved Lab looks in the Lab (and its director chat) or when you name one of them. Anywhere else it opens Appearance. **`/appearance`** always opens Appearance.
7. Fixed: the meter's `/live` replaced the Lab's **Live sound** command (you use Live sound a lot). `/live` is Live sound again. The meter's list of streaming replies is now **`/streaming`** (also `/live-tokens`).
8. Fixed: typing **`/trash`** moved the open chat to Recently deleted, because `/trash` was an alias of `/delete`. `/trash` now opens the Recently deleted list, as the add-ons intended.
9. Fixed: the Kit's calculators were dropped silently because the Lab owns their names. They are back as **`/kit-bpm`**, **`/easing`**, **`/aspect`**, **`/kit-palette`** and **`/save-palette`**.
10. Fixed: other add-on commands dropped the same way are back as **`/library`** (prompt library), **`/inbox`** (quick capture), **`/notes-find`**, **`/restore-backup`** and **`/import-chats`**.
11. Fixed: two FX commands were dropped the same way: **`/layer-add`** (ready-made layer templates) and **`/fx-palette`**.
12. Fixed: the chat's message-spacing command lost its name to the look's `/density`. It is now **`/spacing`** (also `/compact-view`).
13. Fixed: dead aliases that pointed at the wrong command were removed.
14. Fixed: the Kit window hint and the FX "nothing found" hint now name commands that exist.
15. Fixed: run with no arguments, `/nodes-link`, `/nodes-frame`, `/forge-patch` and the Lab slider commands (`/knob`, `/lock-slider`, `/fav-slider`, `/save-one`, `/midi-learn`…) used to give odd errors such as `No slider ""`. They now show how to use them, or list what's available.

## Keyboard shortcuts
16. Fixed: **Alt+N** (Lab code ⇄ nodes) fired while you typed in the docked director chat or a dialog. On a Mac that also swallowed ⌥N, which types ñ / ˜. It now only works in the Lab itself.
17. Fixed: **X** (FX picker) opened when the docked chat or a dialog had focus.
18. Fixed: the Ctrl+/ shortcut sheet now lists the chat's Alt keys (T, R, B, P, M, F, ↑↓) and Ctrl+Shift+U. For the Lab it adds X / Shift+X, Shift+A/B/C, Alt+1…9, Ctrl+S / Ctrl+Shift+S, Alt+N, O, `` ` `` and ?. "/" is now described as the commands menu.
19. Fixed: on a Mac, shortcut labels in the `/` menu, `/help` and the Ctrl+K palette show ⌘ and ⌥ instead of Ctrl and Alt.

## Speed
20. Fixed: holding ↓ / ↑ in the `/` menu rebuilt the whole 64-row menu on every key press (about 150 ms each). It now only moves the highlight.
21. Measured, no change needed:
    - Start: about 350 ms to DOMContentLoaded.
    - Ctrl+K: opens in about 12 ms, with 588 actions.
    - `/` menu: builds in under 25 ms.
    - `Commands.matching`: 1–2 ms.
    - No long tasks.

## Your data
22. Fixed: saving a Lab **recording** before Video Review had been opened in that session overwrote `video-library.json` (favorites, tags, export list) with an empty library. It now reads your library first.
23. Fixed: if the window reloaded while the Lab was still loading, `three-lab-extras.json` (each sketch's song, position, frame size, looks) could be overwritten with `{}`. Saves now wait for the load.
24. Checked, no change needed:
    - `config.json` and `theme.css` were not changed by any stream tonight.
    - The look migration runs once and only on the old default colors.
    - Video note upgrades only add fields.
    - The meter writes its own new `token-stats.json` file.
    - Every kv save keeps a `.prev.json` copy.

## Looks
25. Fixed: in the light Forgeheart presets (Forge Light, Parchment, Chrome Light, Frost Light), the meter strip kept its dark glass, so the token numbers were dark on dark. The strip and the dashboard cards now follow the light theme.

## Checks added (dev/checks)
26. `qa-commands.js`: duplicate names and aliases, aliases that shadow a name, shared names, and each stream's commands that now live under another name.
27. `qa-sweep.js`: start-up time and memory, palette and `/` menu speed, then **every** command run with no arguments, with dialogs closed in between and destructive ones skipped. It reports thrown errors, error toasts and console errors. Run it in chunks with `QA_FROM` / `QA_TO`.
28. `qa-stream.js`: the main chat and a docked Three Director stream at the same time while the Lab and look effects run. Checks the unread mark, token badges, `<suggest>` command chips, and shared commands from the docked chat.
29. `qa-ui.js`: any theme × view (lab, fx, nodes, video, kit, usage), with a screenshot and a scan for unreadable controls.
