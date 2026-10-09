# Chats at the core (round 9, chatcore stream)

Since round 7 Hearth gained a mood board, a video editor, self-capture, video projects and the Lab sequence. This pass
makes the chats the place where all of it meets, with less on screen:

- **What a reply makes shows inside it** as a small card: a capture, a Lab frame, a render, a board item, the scene it
  changed, a sequence, a video project. Point at a video card and it plays; run the pointer along its bottom edge for
  exact frames. Click opens it in its tool; drag it to the board, the editor, another chat or another app.
- **＋ in the chat box is one menu**: files, the board, captures, the Lab (its frame, its scene), the screen, recent
  renders. Drops and pastes from the other tools land in the chat box too. Every source is also a `/attach-…` command.
- **The `/` menu is short**: pinned, recent (here first), a few commands for where you are (in the Lab: the Lab's),
  then one row per area that opens in place. Typing filters everything, the place's commands first.
- **A chat remembers what it works with** (board, scene, sequence, video project, captures, renders): a quiet line over
  the chat box (only while you point at or type in it; Alt for details). "Use the board", "render it again", "the last
  capture" now just work, and continuing on the other engine keeps it.
- **A calmer chat**: tool calls fold to one line, secondary info fades until you point at the message, and every part
  of a message has its own right-click menu.

Token frugality: cards, the context line over the chat box, the menus and the right-clicks are drawn from Hearth's
own record of the calls: none of it reaches Claude or Astra. A message only carries something extra when **you**
attach it, or when your own words point at one of the chat's things ("use the board": one `[Hearth context: …]` line,
≈ 15–40 tokens, plus the board's vibe for an agent without board tools, exactly what `/board-use` attaches). The ⌖ mark on
your message shows what went along; `/chat-context auto off` turns it off. A plain message reaches the engine exactly
as typed (checked with the fake engine's `echo`).

Counted honestly: one line per thing you can see or use (a command, a menu entry, a gesture, a behaviour). Helpers and
checks are listed at the end, not counted.

## A. Cards for what a reply made (chat-things.js)
1. A capture made by a tool call (capture_shot, a recording, a contact sheet, a GIF / trim made from a video) shows as a picture or video card under the reply.
2. Renders and exports a tool call reports (the Lab sequence's ⇪, video_edit renders, capture make) show as video cards.
3. The Lab frame a director looked at (three_screenshot, a sequence frame) becomes one "Lab frame" card per reply (saved once at the end of the reply, not per screenshot).
4. The Lab scene a reply changed shows as a scene card with the scene's still.
5. A Lab sequence a reply built or edited (three_do sequence) shows as a sequence card.
6. A board item a reply added (board_add) shows as a board card (its picture when it has one).
7. A video project a reply worked on (video_edit op project) shows as a project card.
8. Picture and video paths the reply itself names become cards too (dimmed with "file moved or deleted" when the file is gone).
9. Cards appear in the reply while it is still being written, as soon as the tool call returns.
10. Video cards load their first frame only once on screen, and play (muted) only while you point at them.
11. Frame-exact scrubbing: run the pointer along a video card's bottom edge; it lands on the middle of each frame, with the true frame rate from ffprobe.
12. ← / → on a video card step one frame (Shift: 10), Space plays / pauses; the readout says "f 76 · 0:03.06".
13. Click or Enter opens a card in its tool: the capture player / picture viewer, the board (item selected and zoomed to), the Lab scene, the Lab sequence, the video project's card.
14. Drag a file card (picture, video, render) out as a real file: onto the board, the video editor, another chat, Finder / Explorer, After Effects.
15. Drag a scene card onto the Lab sequence to add it there; drag a board card into a chat for its vibe.
16. Right-click a card (or its ⋯): Open, Send to › (this chat, another chat, the board, the editor's edit, Video Review, the editor timeline, the Lab as media, the Lab sequence).
17. Right-click a video / picture card → Frames, make, read… / Picture tools…: the captures' own menu (contact sheet, scenes, pacing, GIF, social frames, beautify, annotate…).
18. Right-click a card → Copy the path, Show in folder, Hide this card (the file stays).
19. A message's ⋯ menu has **Made here ›** listing its cards.
20. `/things [pictures | videos | scenes | board | sequences]` (alias `/made`): what this chat made, newest first, one click to open.
21. `/open-last [video | picture | scene | board | sequence]`: open the newest thing this chat made.
22. Cards are stored on the message as `things` and never read by a prompt, the context sent after an edit, a compact, a handoff or an export.

## B. Attach from anywhere (chat-attach.js)
23. **＋** replaces 📎 in the chat box: one menu with Files…, Board ›, Captures ›, Lab ›, Screen ›, Recent renders ›.
24. Shift+click ＋ opens the file picker straight away (what 📎 did).
25. **Alt+A** in a chat box opens the ＋ menu.
26. Board ›: the chat's board's whole vibe, Only… (palette, light, motion… the board's focuses), its 8 newest references one by one, Open the drawer.
27. Captures ›: the 10 newest shots and recordings (a recording attaches its contact sheet), All captures….
28. Lab ›: the frame on screen (a picture), the scene (its name and layers as a few lines, not its code), and your 6 latest other scenes.
29. Screen ›: a region you drag, this tool, the whole window.
30. Recent renders ›: Video Review's exports, Lab recordings and recorded captures, newest first (each attaches its contact sheet).
31. The ＋ menu ends with what this chat works with (its board, scene, sequence, project, captures, renders), one level deep.
32. A video dropped or attached in a chat now attaches its contact sheet (engines read pictures); before, a video was refused unless the agent had file access.
33. Drag a video from Video Review's library into a chat: its contact sheet attaches.
34. Drag a scene tile from the Lab sequence's ＋ into a chat: the scene attaches as a few lines.
35. Drop a card from another chat: a file attaches as itself, a scene as its lines, a board item as its vibe, a sequence / project as one reference line in your message.
36. Paste the path of a picture or a video (copied from a capture, a render, Finder): the file attaches (the toast offers "Paste as text").
37. `/attach-board [reference | focus]`: the board's vibe (or one reference's), never its media.
38. `/attach-capture [last | name]`: a capture; no name: a menu of the newest.
39. `/attach-frame`: the Lab's frame on screen.
40. `/attach-scene [scene]`: a Lab scene as a few lines.
41. `/attach-region [window | tool]`: drag a region of the screen (or take the window / this tool) and attach it.
42. `/attach-render [last | name]`: a recent render's contact sheet; no name: a menu.
43. `/attach-menu`: the ＋ menu from a command.
44. Right-click around the chat box: **＋ Attach from…** opens the same menu (Attach files… stays below it).

## C. The "/" menu, grown up (chat-slash.js, notes.js, commands.js)
45. Only "/" typed: a short view instead of 60 commands: ★ Pinned, Recent in <tool>, Recent, a few for where you are, then the areas (16 rows in a fresh chat with a little history; 60 before).
46. One row per area ("Three.js Lab ›  139"): Enter, → or a click opens it in place; ← or "‹ All areas" goes back.
47. The 8 areas you use most (the one you're in first), then **More areas ›** with the rest.
48. **For this chat**: in a chat that made things or works with a board / scene / sequence, `/things`, `/render-again`, `/attach-board`, `/attach-frame`, `/open-last`, `/chat-context` come first.
49. **In the Lab**: the Lab's area row comes first and "In Three.js Lab" starts with your habits there (Save, Shuffle, Tap, Freeze, frame sizes, Live sound, Sequence); Video Review starts with the editor and frame reading; the board with its vibe commands.
50. Typed words rank the commands of the place you're in first (in the Lab, `/s` lists the Lab's s-commands before the rest), after the exact name, your pinned and recent ones.
51. The menu's footer says what the keys do in each view (→ open an area · ← all areas · type to filter).
52. The command bar (Ctrl/⌘+;) gets the same short view (its Alt+1…9 for pinned commands still show).

## D. Projects in chats (chat-context.js)
53. Each chat remembers the board, Lab scene, sequence, video project, captures and renders it worked with (from its cards, its linked board, its own scene and its project; kv `chat-context`).
54. **A context line over the chat box** (▦ board · ◭ scene · ▤ sequence · 🎬 project · ◉ captures · ⇪ renders): it shows only while you point at or type in the chat box, over the bottom of the chat (nothing moves).
55. Hold Alt for its details (linked or used, reference counts, the newest capture's name).
56. Board chip: attach its vibe, Only…, open the board, the drawer, link / unlink it to this chat.
57. Scene chip: attach its frame, attach the scene, open it in the Lab, add it to the Lab sequence.
58. Sequence chip: ⇪ Render it again, open the sequence, finish it in the video editor.
59. Project chip: show its card here, ⇪ Render it again, status.
60. Captures / renders chips: each one → attach, open, show in folder.
61. Forget it here (per chip, or Forget these here), without touching the board, scene or files.
62. **"use the board"** (also "my refs", "the moodboard"…): your message carries one line naming the chat's board, and an agent without board tools gets its vibe (as `/board-use`), unless a vibe is attached already.
63. **"render it again"** / "the sequence" / "the project": the line names the chat's sequence and video project.
64. **"the last capture"** (recording, screenshot, take, render): the line gives its path.
65. **"this scene"** / "the sketch": the line names the chat's scene.
66. A ⌖ mark on your message when something went along; point at it for exactly what was sent.
67. Continuing a chat elsewhere carries its context: handoff to Astra or Claude, Continue with…, Branch, a fresh chat from a summary (the line starts with ⇄ there). A director switching engine keeps it (same chat).
68. **Works with ›** in the chat's ⋯ menu (its board, scene, sequence, project, captures, renders).
69. `/chat-context [show | auto on|off | strip on|off | forget <what> | clear]` (alias `/works-with`): what this chat works with and how your words use it.
70. `/render-again` (alias `/rerender`): render this chat's Lab sequence (or its video project) again, locally.
71. Right-click the context line: each thing ›, "Your words point at them" on / off, Hide this line.
72. The app map has a **chats** topic (also `context`, `cards`, `attach`), read on demand by both engines: what the cards and the `[Hearth context: …]` line mean (no extra prompt tokens).

## E. A calm chat surface (chat-calm.js, chatcore.css, native.js)
73. Tool calls fold to one line, "⚙ 3 steps · three", instead of every tool name in a row; click it for the list (repeats counted ×n).
74. Right-click the steps line: show / fold the steps, copy them, the director's activity (in a dock).
75. Right-click an attachment on a message you sent: open the picture, attach it again, show exactly what was sent, copy its name.
76. Right-click a suggestion chip: run / send it, put it in your message, copy it, what the command does.
77. Right-click a plan card: copy the plan with ✓ / … marks.
78. Right-click a second-opinion card: copy it, quote it in your message, ask to use it.
79. Right-click the "context compacted" divider: read / fold the summary, copy it.
80. Right-click the reply being written: ■ Stop, watch the thinking, stop / start following the reply.
81. Right-click the pinned-messages strip: next pin, pinned messages…, unpin them all.
82. Right-click a day line or the "New" line: first message, latest message, jump to….
83. Right-click a "Saved to memory" chip: undo, what it remembers….
84. Right-click an answered question: copy the question and answer.
85. Right-click the ⌖ mark: what went along, this chat works with…, never add it.
86. Right-click the marks badge (📌 🔖 🔥): clear the marks on this message, bookmarks….
87. Right-click the long-chat / imported banners: compact, new chat from a summary, what each message costs.
88. Right-click a hub note (command output): copy it, dismiss it, dismiss every note.
89. Quieter until you point at the message: attachment chips, the steps line, the marks badge, day lines.
90. The keys button lists all of it under "Chat": Alt+A, ＋ and Shift+click ＋, the cards (point, ← →, drag, right-click), drops and pasted paths, the context line (Alt, chips), right-click on any part of a message.

## The chat view, counted (declutter count, `dev/checks/chatcore-count.js`)
Same conversation in this tree and in the tree before this stream (thinking, a fake tool, three steps with suggestions,
a real capture_shot), counted like `dev/checks/declutter-count.js`:

| | Before | After |
|---|---:|---:|
| Chat header | 1 | 1 |
| Controls in the messages (tidy) | 14 | 15 (the steps lines are now a fold you can open; +1 card, its ⋯ shows on hover) |
| Older message feet (tidy) | 4 | 2 |
| Chat box, not focused | 4 | 4 (＋ replaces 📎) |
| Chat box while typing | 4 | 5 (the context line's one chip: this chat has a capture) |
| Characters of tool-call lines always on screen | 128 | 65 (−49 %) |

Streaming stays as smooth: the cards are added once per tool result (never per streamed piece), the context line only
redraws when what it shows changes (compared before writing), and the new rules are plain selectors
(`dev/checks/smooth-chat.js`, run back to back on a shared, loaded test machine, so read the
numbers as "the same"): a streaming reply, before → after: DOM changes 61 → 63–67 a second, style 11 → 11–13 ms,
layout 46 → 28–36 ms, paint area 72 → 72–73 Mpx; wheel scrolling and switching chats within the run-to-run noise.

## For development (not counted)
- `Native.hooks.finish(event, chat, extras)` (add fields to the reply about to be saved) and `Native.hooks.compose(agentId,
  chat, text, message)` (may return the text for the engine; awaited), `Native.liveCard(chatId, node)`, `Native.toolLabel`,
  `Native.renderChips`; chats continued elsewhere carry `contextFrom`.
- `ChatThings` (fromCall, pathsIn, cardEl, openThing, ofChat), `ChatAttach` (menu, labFrame, labScene, screen,
  recentRenders), `ChatContext` (gather, note, paint, compose, renderAgain), `ChatSlash.rows`.
- Checks: `dev/checks/chatcore.js` (cards from a real capture_shot, frame-exact scrub and step, the ＋ menu, drop and
  paste, the "/" view, the context line, "use the board" / "the last capture" / auto off, inheritance on continue,
  right-clicks, a plain message sent as typed), `dev/checks/chatcore-lab.js` (Three Director cards live and kept,
  scene drag type, sequence and board cards, the dock's strip, "render it again", the Lab-first "/" view),
  `dev/checks/chatcore-count.js` (the table above). `dev/run-checks.sh chat` runs the first two.
- `dev/checks/chat-look.js` waits up to 40 s for its "long" reply (it streams ≈ 15.2 s on the test machine, so the old
  15 s wait failed before this stream too).

## Tested
- `sh dev/run-checks.sh chat qa board capture smooth-chat journey-chat intro`: 29 / 31 passed. chatcore, chatcore-lab,
  chatcore-count, every chat check, cmdbar, clutter, declutter, declutter-count, qa-commands (no duplicate commands),
  qa-mac, polish, every board check, capture-extras / frames / lab / more / shots, smooth-chat, journey-chat and intro (the
  whole video-project flow) pass. The two failures belong to the loaded test machine (load ≈ 15 on 4 CPUs, other
  streams' checks running): capture-record ("Timeout starting video source", as noted in intro.md) and qa-keys (a
  different board / Lab key each run timed out; it passed in the first run).
- Screenshots looked at: the cards under a reply (a capture, a video card scrubbed to frame 76), the ＋ menu, the short
  "/" view, the context line while typing, the Three Director's dock with scene / frame / sequence / board cards and the
  Lab-first "/" view.
