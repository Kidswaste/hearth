# Board eyes (round 14, eyes stream)

Your chats can now **see** the mood board, not only read its vibe: pictures go to Claude and Astra as real images,
clips and gifs as a few well-chosen frames with timestamps, the whole board as one picture with item ids on it.
Small pictures by default (the chat asks for bigger ones when detail matters); nothing is attached to your messages
by itself; every look shows in the reply as a quiet card saying what was sent (pictures, size, ≈ tokens).
You can also show things yourself (right-click › Show to a chat), and find more references on **Pinterest** in a
Hearth window where you add pins with one click.

Start: in a chat, `/board-tools on` (the chat's board tools, opt-in as before), then ask "look at my board". Or, with no
tools on, right-click a reference › **Show to a chat**, or type `/board look`.

## What a chat can see (board tools: board_look, board_watch, board_do)
1. **The whole board as one picture** (`board_look` with no target): every item drawn where it is, item ids in a corner of each, frames and links drawn too; small (768 px) by default.
2. **One item** as a real picture (`board_look { item }`), 512 px by default.
3. **Bigger on request**: size `medium` (1024 px) or `large` (1568 px) — the chat asks only when detail matters.
4. **Close-ups**: `region [x, y, w, h]` crops a part of a picture at full sharpness.
5. **The selection** you made on the board as one labelled sheet (`selection: true`).
6. **A frame** of the board as one picture (`frame: "name"`).
7. **Several items** as one labelled sheet (up to 12).
8. **Side by side** (`compare: true`, 2–4 items) with how their vibes differ ("i2 darker, softer, cooler · 0.39 apart").
9. **Watch a clip** (`board_watch`): six frames as one contact sheet, each with its time and frame number.
10. **At exact moments**: `times: [0.5, 2.5]` (frame-exact through the frame reader).
11. **One frame per shot** (`mode: "scenes"`), with each shot's length; the board's own cut finder fills in cuts ffmpeg misses (two flat colors).
12. **Separate frames** instead of one sheet (`as: "frames"`, up to 8).
13. **Gifs over time**, decoded in the page with their real frame timings (no ffmpeg needed).
14. A clip looked at with `board_look` says "board_watch shows it over time"; a large look at a clip uses a real frame, not the poster.
15. **Every result says what was sent**: "1 picture 512×384 ≈ 262 tokens".
16. Notes, text, colors, shapes and stickers are drawn as cards in overviews (their text is in the result too).
17. Items named by words work too ("golden" finds "golden-hour").
18. **Find by description** (`board_do find`): words, tags, notes, color words (pink, teal), light and temperature (dark, warm, cold), saturation, texture (grainy, minimal), motion (fast, still) and kinds (clip, site, gif).
19. **Captions written once** (`board_do caption { item, text }`): a chat that looked keeps one line on what it saw; every later vibe text carries it ("seen …"), so nobody pays to look again; find reads it.
20. **Found pictures with credit**: `board_add { kind: url, url, source, credit }` keeps where a picture came from and whose it is (Info shows it, the vibe text says "by …").
21. The app map (`three_help app` / hearth-map) explains all of it to both engines; the board tool line asks chats to name items by id.
22. Astra (Codex) sees the board through the same MCP server as Claude.

## In the chat
23. **A card per look** while the reply runs: a thumbnail, the board, what was sent (pictures, size, ≈ tokens) and the items it looked at.
24. **Items in the card are links**: click one to jump to it on the board.
25. **Three or more looks fold into one line** ("👁 Looked at the board 3× · 3 pictures ≈ 1,235 tokens"), open for the cards.
26. **Item ids in a reply become links** (i3 → the item): click to open the board, select it and zoom to it.
27. The item you jump to **pulses** once so you see it.
28. **The reply remembers what you showed** it (a "You showed" card).
29. Looks are no longer saved as "made" frames under the reply (the cards say what was seen instead).

## Showing things yourself (nothing is sent until you send)
30. **Right-click an item › Show to a chat › Claude / Astra**: its picture (small) and its id go with your next message.
31. **Ask about it…**: type a question; the picture goes with it and it is sent.
32. **A clip › Show its frames** (a contact sheet with timestamps).
33. **A clip › One frame per shot**.
34. **Two to four items › Side by side**.
35. **Bigger (1024 px)** when you want the chat to see detail.
36. **A frame › Show this frame to a chat** (what is inside it, as one picture).
37. **Board menu › Show the board to a chat** / **Ask about the board…**.
38. **The drawer** (Ctrl+Shift+M): right-click a tile › Show it to a chat / Ask about it….
39. **Alt+drop a drawer tile on a chat**: the picture itself (a plain drop still attaches the vibe).
40. **Drag an item off the board onto a chat beside it** (a docked chat): shown there; the item goes back to its place.
41. **Write its alt text…** (right-click › More): one line chats read instead of looking again.
42. Item **Info** shows the source, credit and alt text.

## Chat commands
43. **`/board look [board | sel | frame <name> | ids | words] [small | medium | large]`**: show it to this chat (with your next message).
44. **`/board watch [clip] [n | scenes] [size]`**: a clip or gif as frames.
45. **`/board compare i3 i5`**: side by side.
46. **`/board find <description>`**: selects the matches on the board and lists them (free, nothing sent).
47. **`/board pinterest [vibe | aesthetic]`**: Pinterest searches as buttons (with words, the first one opens).
48. **`/board-show`** (also `/board-see`), **`/board-watch`**, **`/board-find`**, **`/board-pinterest`**: the same as their own commands.
49. **`/board-alt <text>`**: alt text on the selected pictures (no words clears it).
50. `/board` completes its new words, sizes and the Pinterest aesthetics.
51. The keys sheet lists Alt+drop, drag-onto-a-chat and click-an-id.

## Pinterest
52. **Searches from your board's vibe**, made locally (no tokens): mood + subject ("nocturnal cold photography"), colors ("deep blue and vivid pink aesthetic"), light, texture, tags, fonts, your brief.
53. **Color words and style words** listed with the searches.
54. **24 aesthetics** with the searches that find them (y2k, vaporwave, synthwave, cyberpunk, noir, dark academia, cottagecore, brutalist, swiss, bauhaus, minimal, japandi, memphis, grunge, film, retro, kinetic, chrome, glitch, wes anderson, ethereal, acid, editorial, anime); your words lead, the board's vibe follows.
55. **Clips on the board → cinematography searches**; sites → web design; type → typography.
56. **A Pinterest window inside Hearth** with its own signed-in session: sign in once with your own account (Hearth never sees the password); sign-in popups (Google, Apple, Facebook) work; other links open in your browser.
57. **"＋ Board" on the pin under the pointer**: one click adds it to the board on screen.
58. The **largest picture** of the pin is taken (from its srcset).
59. **The pin's link stays as the item's source**, with "Pinterest" as credit, a #pinterest tag and the pin's title.
60. **Drag a pin out** of the window onto the board: it keeps its pin link too.
61. Gif pins stay gifs (they animate on hover like other gifs).
62. The window's title and a small pill say **which board pins go to and how many were added**.
63. Safe by design: only real clicks add pins, nothing is read but the pin you click, no Pinterest API, no downloads or permissions in that window, and only Pinterest (or a local test page) can be loaded as it.
64. **Board menu › Pinterest: find more like this**: the searches, "Your own words…", "Open Pinterest (sign in)".
65. **Chats suggest searches** (`board_do pinterest { phrases | aesthetic }`): they show in the reply as buttons; a click opens the window.
66. **An app in the Apps menu** when the app windows registry is there (Pinterest, 📌).

## Tested
`sh dev/run-checks.sh eyes` (dev/checks/eyes-look.js, eyes-chat.js, eyes-ui.js, eyes-pins.js, dev/eyes-test.js): every
tool through the hub, real MCP calls from the fake Claude and Astra with pictures as MCP image content, the cards and
links in the reply, the menus and drops, the Pinterest window on a local Pinterest-like page with real (trusted) clicks.
