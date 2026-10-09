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
