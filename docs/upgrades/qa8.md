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
