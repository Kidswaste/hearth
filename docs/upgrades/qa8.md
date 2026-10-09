# QA 8 (round 8): the round-7 streams tested together

Round 7 built the mood board, the video editor, self-capture and the declutter pass in parallel. This pass used
them together the way you would for the Hearth intro video (a reference on the board → its vibe in a director
chat → a Lab scene → a screenshot and a recording of the Lab → cut, titled and rendered in the editor) and fixed
what collided between them and with everything older. One line per bug, each with its fix.

## Keys and shortcuts
1. Fixed: the capture keys (⌘/Ctrl+Alt+S / A / R / P / V / T, the player's and the annotator's keys: 59 lines) were missing from the keys button's sheet. capture.js looked for `window.Keys`, but keys.js defines a global `const`, which is not a window property.
2. Fixed: **Ctrl/⌘+Alt+S** both opened the capture menu and was listed as "stop a Claude × Astra collaboration". The capture key is caught in the main process first, so the stop never worked. Stopping a collaboration is now **Ctrl/⌘+Alt+X** (the ■ Stop on its card and `/collab-stop` are unchanged).
3. Fixed: **Ctrl/⌘+Alt+H** was "hand the chat to the other agent" and also Hearth's global show / hide hotkey (Windows) and "Hide others" (Mac), so it hid the window instead. Handing off is now **Ctrl/⌘+Alt+G**.

## Dev checks
4. Fixed: `dev/checks/polish.js` returned ok: false on its `/look` assertion. The check expected `/look` to belong to the Lab, but since QA round 2 (#6) `/look` is shared by name: the Appearance picker is the general command and the Lab's saved looks are its in-Lab variant. The check now asserts the Lab variant is there.
5. Fixed: `dev/checks/editor.js`, `editor-more.js`, `cut.js`, `music.js` and the journeys failed with "J is not defined" when run without their `--lib` flags. `dev/smoke.js` now adds `journey-lib.js`, `smooth-lib.js` or `dev/editor-frames.js` by itself when a check uses them.
6. New: `sh dev/run-checks.sh [group | check…]` runs any check with the fixtures it needs (test song, test videos, editor clips, board media, capture videos — each made once) and the flags its own header asks for, prints one ✓ / ✖ line per check and keeps every log. Groups: qa, board, editor, capture, journeys, chat, lab, video, nodes, smooth, astra, unit (the Node-only tests), all.
7. New: `dev/smoke.js` runs a check in parts split by a `//@@ reload` line, reloading the window in between (everything read back from disk), so journeys can check what survives a restart.

## Mood board
8. Fixed: **`/board-add` with a path that has a space** (`C:\Users\you\My Videos\clip.mp4`, `~/Movies/Night drive.mov`, `/tmp/neon big.png`) added the path as a text note. Paths with spaces, quoted paths and `~/` now add the file.
9. Fixed: the drawer's "Use the board's vibe in this chat" (right-click the rail ▦) took the current board, not the chat's linked board as the drawer and `/board-use` do.
10. Fixed: dragging a tile from the drawer into a text field other than a chat (the command bar, a note) typed the vibe of the current board, not of the board the drawer was showing.
11. Fixed: website media downloaded onto the board kept the address's extension (`image.php`, `photo.aspx`), so a picture became an unknown file. The type the site sends now names the file; a file over 300 MB is refused before it is downloaded when the site gives its size.
12. Fixed: on Windows and the Mac, a dropped file already in the board's media folder was copied a second time when its path differed only in letter case (`C:\` vs `c:\`); "Tidy the media folder" compared paths the same way.
13. Fixed: "Tidy the media folder" (`/board-clean`) could move a folder inside the media folder (an editor export of a board clip lands in `media/exports`) to the Recycle Bin. It only looks at files now.
14. Fixed: `/board-tools` typed alone turned the board tools on (≈ 550 tokens on every message from then on). Alone it now says where they are on; `on` / `off` / `directors` change it. Its description now says ≈ 550 tokens, as `/director-cost` measures, not ≈ 350.
15. Fixed: the keys sheet put the Board's keys under "other places" while the board was on screen. On the board (and with the drawer open over any chat) its keys come first, like the Lab's in the Lab.

## Token frugality
16. Fixed: `/director-cost` (and `dev/director-cost.js`) left out the board tools. They are listed now: 4 tools, ≈ 480 tokens of definitions, plus a ≈ 70-token prompt line, only for agents you turn them on for.
17. Fixed: a chat with the capture tools on (`/capture-tools agent on`) kept them in its "lean" runs (second opinions, collaborations, quick asks), ≈ 545 tokens each. Lean runs drop them like every other tool set.
18. Fixed: turning the capture tools on for a plain chat also added the chat tools' long when-to-use guide to its system prompt (meant for directors). Only the board's and capture's own lines are added now.
19. Checked, no change needed: a plain Claude chat costs what it did at the start of round 7 (no new tool sets, prompt lines or flags unless opted in). Directors: Three Director 3,018 tokens (unchanged since commit 7dc2766), Forge Debug 1,532 (unchanged), Video Director 1,638 → 1,990 (+352: the editor's three `video_edit*` tools, which the Video Director needs to edit; by design).

## Mac and Windows
20. Fixed: ffmpeg wasn't found when a Windows PATH entry is quoted (`"C:\Program Files\ffmpeg\bin"`), in Video Review, the editor and the frame reader.
21. Fixed: after installing ffmpeg while Hearth was open (`brew install ffmpeg`, `winget install Gyan.FFmpeg`), Hearth kept saying "ffmpeg not found" until a restart. A miss is looked up again after a minute.
22. Fixed: made-from-a-video files (`/make` GIFs, trims…) of a capture whose path differed in letter case from the captures folder went to `captures/made` instead of next to the capture (Windows / Mac).
23. Fixed: editor keys and capture keys were stored with ⌘ on a Mac, so the keys sheet couldn't press them for you when you clicked their line ("Ctrl" is stored, ⌘ / ⌥ are shown). The editor's redo line now reads Ctrl+Shift+Z (it said "Shift+Z").
24. Fixed: Windows AltGr is Ctrl+Alt to the system, so AltGr+S / AltGr+A (ś / ą on Polish and other keyboards) opened the capture menu or the region picker instead of typing the letter. A key that types another letter than its place is now left to the text.

## Capture
25. Fixed: the keys sheet opened over a modal capture window (your captures, a capture's player, the annotator) was unusable (the rest of the page is inert under a modal), and Esc closed the captures behind it instead of the sheet. The sheet now opens inside that window, on top, and Esc closes the sheet first.
26. Fixed: with a capture window open, the keys sheet now lists the capture keys first ("Capture · …"), and the areas that apply where you are keep their order (in the Lab the Lab's keys come before the chat box's; before, the chat box's came first).
27. Fixed: `/make it react` (the Lab's one-click music link, typed as words) crashed `/make` ("Cannot read properties of undefined"); any unknown `/make` word did the same. It now runs `/make-it-react`, and other words get the list of things `/make` makes.
28. Fixed: the capture command's examples offered `/shot lab`, which runs the chat's own screenshot (a picture in your message), not a capture. The example is now `/shot lab 9:16`.

## Undo and saving across tools
29. Fixed: `/undo` in the video editor (the command bar or the Video Director's chat) undid the last *chat* action (a rename, a delete) instead of the edit. In the editor it now undoes the edit; on the board it undoes the board; elsewhere it is still the chat's undo.
30. New: `/redo` redoes the board's or the editor's last undo where you are (there was no `/redo`).
31. Fixed: an edit made just before a reload or quit (a cut, then ⌘Q) was lost with its pending save (400 ms). The editor writes it when the window closes; Video Review's notes and library do the same.
32. Fixed: "New board…" from the rail ▦'s right-click menu or the palette, before the board had ever been opened, failed ("Cannot read properties of null"). The boards are loaded first.
33. Fixed: undoing the creation of a note while it was being edited could leave the board half-drawn (a "node to be removed is no longer a child" error stopped the redraw). The redraw skips a node its own blur handler already took out.
34. Fixed: after the command bar (Ctrl/⌘+;) closed, the keyboard went nowhere: the editor's ← → J K L, the board's and the Lab's keys did nothing until you clicked the tool again. The keys go back to where they were.
35. Fixed: switching to another tool (the board, the Lab, a chat) while the edit played left it playing unseen (its sound and the compositor kept running). Leaving Video Review now pauses the edit.
36. Fixed: a recording whose encoder fell behind (a busy computer, a software codec) came out a fraction of its length (a 6 s take → 0.3 s) with a "🎬 … 0:00" notice and no word of why. It now says how much was kept and why, suggests a lighter take (`/record 30fps 720p`), and two such takes switch to another codec, as two empty ones already did.
37. Fixed: the editor's temporary title frames (a `.hearth-titles-…` folder next to the export) stayed next to your footage when a render failed, was cancelled, or couldn't start. They are removed however the render ends.
38. Fixed: **F1** ("every chat command, searchable", in the keys sheet, the help and the README) only worked inside the command bar. It opens the command list from anywhere now.
39. Fixed: a take that ended with an error ("Nothing was recorded…") showed the same error 5 times: every half-second tick asked the take to stop again while it was being finished. It stops once.
40. Fixed: when a recording's WebM didn't say its length, the short-take check (#36) couldn't see that only one frame was kept. The MP4's own length is used then.
41. Fixed: `/pacing`, `/scenes`, `/contact`, `/frames` and the other frame readings with no video named read your newest *screen recording*, even in Video Review with a reference open or on the board with a clip selected. They read the video on screen first now (Video Review's, the selected board clip), then your newest recording.
42. Fixed: the capture tools' "Hearth is closed" fallback (an agent reading a video's frames with ffmpeg while the app is closed) ignored your captures folder and ffmpeg path from Settings, and crashed instead of answering when ffmpeg was missing or the file broken.
43. Fixed: the keys sheet had one line "Shift+A / Shift+B / Shift+C · recall slot A, B, C" whose click always recalled A, plus a second "Shift+C" line under another group. Now one line per slot, each recalling its own.
44. Fixed: clicking an Editor, Board or Capture line in the keys sheet did nothing (the sheet pressed the key into the page instead of the editor, the board or the open capture window). It presses it where it applies now.
45. Fixed: the main capture keys (⌘/Ctrl+Alt+S / A / R / P / V / T) can't be pressed for you (they're caught before the page), so their lines in the keys sheet did nothing when clicked. Each now does its action (opens the capture menu, starts / stops the recording…).
46. Fixed: on a Mac the keys sheet's descriptions still said "Ctrl" ("⌘ Command palette (Ctrl+K)", "New chat (Ctrl+N)", "copy frame (Ctrl+C)"). They say ⌘ / ⌥ now ("Ctrl+click", the Mac's right-click, stays).
47. Fixed: on a Mac every right-click and ⋯ menu showed "Ctrl+D", "Ctrl+Shift+S", "Alt+T" at the right of its items (the board's, the editor's, the Lab's…). Menus show ⌘D, ⌘⇧S, ⌥T there now.

## Commands where you type them
48. Fixed: `/play` and `/pause` typed in a chat played the *hidden Lab's* song (the Lab's variant was picked when no tool matched), not Video Review as QA round 3 (#16) documents. Commands can now mark a `fallback` variant; Video Review's is it.
49. New: `/play` and `/pause` on the board play / pause the clips in view (like `/board-play`); before they started the Lab's song or opened Video Review.
50. New: `dev/checks/qa-commands.js` prints how the shared plain names resolve in a chat, the Lab, Video Review and the board (`byPlace`): `/scenes`, `/contact`, `/pacing`, `/make`, `/frames`, `/rec` are the capture ones everywhere; `/record` is the Lab's recorder in the Lab and records Hearth elsewhere; `/screenshot` alone (or `lab` / `window`) puts a picture in your message, with a target / frame / option it makes a capture; `/undo` is the board's on the board, the edit's in the editor, the chat's elsewhere.
51. Fixed: "Put Video Review's current frame / the Lab's picture on the board" (`/board-from-review`, `/board-from-lab`, the board's + Add menu) answered in the agents' words ("Use video_list and video_open first", "check three_console for errors"). It says what to do in plain words now.
52. Fixed: `/edit-template` with no name answered with an error ("No template “”"). It lists the templates.
53. Fixed: `/video-flow-link` with nothing after it failed with "Cannot read properties of undefined"; it shows how to use it.
54. Fixed: a freeze frame (Shift+F, `/freeze-frame`) at a color matte inserted a "freeze" with no picture file, and the editor's filmstrip crashed drawing it ("Cannot read properties of undefined (reading 'replace')"). There's nothing to freeze there: it says so.
55. Fixed: `/captions-import` with no file passed an empty path to the file reader ("Not an absolute path"). It opens a file picker for an SRT / VTT.
56. Fixed: the editor's preset commands with nothing after them (`/blend-mode`, `/grade`, `/edit-motion`, `/sound-effect`, `/speed-ramp`) answered "No blend “undefined”" / "No look “”". They ask "Which look?" and list the first ones.

## Shortcut conflicts: the table
`dev/checks/qa-keys.js` lists every key bound in two areas that are on screen together, and presses each key for
real to see which one wins and whether an app-wide action fires as well (none does since the fixes above). How each
is settled (the one that has the focus wins; the other stays reachable as written):

| Key | Where | Who wins | The other one |
|---|---|---|---|
| ⌘/Ctrl+Alt+S | Capture menu ⇄ chat box "stop the collaboration" | Capture (caught first) | stop moved to ⌘/Ctrl+Alt+X (#2) |
| ⌘/Ctrl+Alt+H | global show / hide hotkey (Mac: Hide others) ⇄ chat box "hand off" | the system | hand off moved to ⌘/Ctrl+Alt+G (#3) |
| AltGr+S / A… (Windows) | capture keys ⇄ typing ś, ą… | typing (#24) | the capture keys with the real Ctrl+Alt |
| Ctrl+G | board "group" ⇄ "all agents side by side" | the board, while it has the keyboard | side by side: anywhere else, or the ⋯ menu |
| Ctrl+0 | board "zoom to fit" ⇄ text size 100 % | the board | text size: anywhere else, Settings |
| Ctrl+Shift+S | board "save a version" ⇄ Lab "save as a look" ⇄ "snapshot into the chat" | the board on the board, the Lab in the Lab | snapshot: anywhere else, the palette |
| Ctrl+Shift+C | board "copy as a picture" ⇄ chat box "copy the last reply" | the focused one (board or chat box) | — |
| Ctrl+F / / | board "search" ⇄ "find in the view" | the board | find: anywhere else |
| E, Esc, Space, J K L, ← →, ↑ ↓, , ., S, B, D, [ ], − =, \, I O X, N, T, Ctrl+C | editor ⇄ Video Review | the editor while it's open (its keys come first in the sheet) | Video Review's: E leaves the editor; safe zones (S), library (B), draw (D), compare (\\) also in ⋯ and Alt-revealed buttons |
| Alt+T, Alt+↑ ↓, Enter, Ctrl+V | editor ⇄ the docked Video Director's chat box | the focused one (the chat box ignores the editor's keys and the editor ignores typing) | — |
| ↑ ↓ | Video Review notes ⇄ the `/` menu in a chat box | the focused one | — |
| Esc | board / editor / Lab / chat box / tour / menus | the innermost: a menu or dialog first, then the surface | a running tour stops on any real Esc |
| . | Lab "one frame while frozen" ⇄ timeline "nudge by ear" | frozen: the frame step | the nudge when not frozen |
| Shift+C | Lab "recall slot C" (listed twice) | one line now (#43) | — |
| F1 | command bar help ⇄ (nothing) | everywhere now (#38) | — |

## More fixes found by the journeys
57. Fixed: the app map told Claude and Astra "/record" records Hearth; typed (or offered as a chip) in the Lab's director chat it records the *sketch*. The map now says `/rec` records Hearth anywhere and `/record` in the Lab records the sketch.
58. Fixed (dev): the journeys' clicks landed on the row above in a menu that was still springing open (round 7's menu animation moves the rows for ≈ 150 ms): `dev/checks/editor.js` picked "Opacity ›" instead of "Transition in ›". Clicks wait for a menu, flyout, dialog or the keys sheet to finish opening; `J.key` knows Home, End, PgUp, PgDn, F1, F2.
59. Fixed: pasting (⌘/Ctrl+V) into a capture's annotator, a dialog, the drawer or the keys sheet open over the board also pasted onto the board behind it. The window on top keeps its paste.
60. Fixed: Space in a capture player or dialog open over the board also switched the board into its "hand" (pan) mode.
61. Fixed (Mac): on the board, ⌘+drag didn't move without snapping (it read Ctrl only, and Ctrl+click is the Mac's right-click), and ⌘+wheel didn't zoom. Both take ⌘ now.
62. Fixed (Mac): finishing a capture region with ⌘ held (to keep adjusting it with the arrows) took the shot at once; it waits like Ctrl does on Windows.
63. Fixed: `/capture-tools on` in a brand-new chat (nothing sent yet) answered "Run it in a chat." while you were in one. The chat is made on the spot, so you can turn the tools on before your first message.
64. Fixed: `/board-link` in a brand-new chat answered "Send a message first". Same fix.
65. Checked end to end (no change needed): with `/board-tools on` and `/capture-tools on`, Claude and Astra (fake engines, real MCP servers over stdio) list boards, read the linked board's vibe, add a note, list captures and take a screenshot.
66. Fixed: adding a long clip to the board (up to 2 GB is allowed) copied it on the main process's thread, so every window froze until the copy finished. It copies in the background now.
