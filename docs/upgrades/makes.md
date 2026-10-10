# Makes (round 11): one name, one mark, rooms made ahead of time

You asked: "when we create something or it's in the middle of being created, give it a chatroom or a category whenever
needed, name it and allow me to navigate it ahead of time even if nothing has been made in it yet (for example if
we're about to make a three.js animation that then cuts into a video, make the video chat and the three.js chat with
the same name and logo ahead of time), and make sure to keep consistency across all things that get created through
Commands."

What changed:
- Everything Hearth creates for you is now a **make**: one name, one color and one mark, a category, who made it
  (the command, the run or the agent), its parts and their rooms, its outputs, a status and a progress.
- **Rooms ahead of time**: `/makes plan a three.js animation that cuts into a video` makes a **Three Director chat
  "Rose Bloom · Lab"** (with its own scene, in the make's color) and a **Video Director chat "Rose Bloom · Video"** at
  once, grouped under **■ Rose Bloom** at the top of your chats list. Both open right away and say what they'll hold
  ("planned · waiting for Lab"). Nothing is sent until you start.
- **One place**: Makes on the Commands page (☰ Commands, Ctrl/⌘+Shift+F) lists every make with its rooms, parts,
  outputs and status. Right-click any make for its rooms, rename (every room follows), hand off, dismiss / restore.
- **Every creation joins it**: a `/dispatch` comp, an `/intro` video project, a jam, a run on the Commands page that
  renders or records, a screenshot or recording made in a room. Files made in a room carry its name.

Token frugality: nothing is added to any prompt by default. A room's agent gets one short line about its make (≈ 45
tokens) only on its first message, or when your words point at the other rooms ("hand off", "the video room", "next
step"). Directors gained one line in `three_do`'s list (`make {op: plan|list, text}`, ≈ 20 tokens per director
message, measured with `node dev/director-cost.js`: 3,158 → 3,178).

Counted honestly: one line per thing you can see or use.

## Rooms made ahead of time
1. **`/makes plan <what>`**: plans a make and makes all its rooms now (also ⌘/Ctrl+K → "Makes: plan a make…", the Commands page's ▶ Use this command, and the directors' `three_do make`).
2. **Plain words become rooms**: "a three.js animation that cuts into a video" → Lab, then Video; "board refs, then a Lab scene, then the edit with captions" → Board, Lab, Video; a script / captions → a Chat room; "Astra art-directs" → an Astra room (up to 6 rooms).
3. **The make's name comes from your words** ("a neon tunnel three.js animation…" → **Neon Tunnel**; "…called Launch Day" → **Launch Day**), else a generated one from its color ("Rose Bloom", "Sky Spark").
4. **A Lab room** is a Three Director chat "<Name> · Lab" with its own scene made right away (the orb, in the make's color, named after the room).
5. **A Video room** is a Video Director chat "<Name> · Video".
6. **A Board room** is a frame on your board titled "<Name> · Board" in the make's color (Open zooms to it).
7. **Chat and Astra rooms** are plain Claude / Astra chats "<Name> · Chat" / "<Name> · Astra".
8. **The directors a plan needs are set up for you** (no question; the same Three / Video Director as `/director-setup`).
9. **Rooms are real chats**, saved at once (not "New chat" drafts) and empty until you start.
10. **The room card**: open a room before anything is in it and its top says what it is ("■ Rose Bloom · Video"), where it stands ("planned · waiting for Lab (three.js animation)" or "planned · ready to start") and what it will hold, and who works there.
11. **The make's chain on the card**: one chip per room (◭ Lab → 🎬 Video); a click opens that room; done rooms carry ✓.
12. **✎ Start here** puts the room's part in the chat box (nothing is sent).
13. **Once a room started** the card shrinks to one line with its status.
14. **⇢ Hand off to <next room>**: marks this part done, opens the next room with what was made here in the chat box (not sent) and, for a Video room, the make's latest output attached.
15. **`/makes next`** does the same from the chat.
16. **Plan another room ›** (Lab / Video / Board / Chat / Astra) in a make's menu adds a room to it, with the same name and mark.
17. A Lab room opened before the Lab was loaded gets its own scene the first time you open it.

## Grouped in the chats list
18. **Each make is a collapsible group** at the top of the chats list: its mark in its color, its name, and planned / % / ✓ / stuck.
19. **Its rooms leave their agent's group** (no rooms twice); a filter (⏷, `/filter`) still shows them under their agents.
20. **Under its make a row says only its room** ("Lab", "Video", "Lab 1/2 · red pulse"); the full title is in the tooltip.
21. **A tag on each room row**: planned (dashed), working, stuck, ✓ done.
22. **Same mark and color on every room**: rows, the dock header, the Lab scene's frame and tag, notifications (the per-chat identity from round 4 now comes from the make).
23. **⋯ on a make's group, or right-click it**: its menu (below).
24. **Alt+right-click a room row**: the make's menu instead of the chat's.
25. **Tidy**: at most 8 make groups, then "N more makes ›" (opens the Makes list); makes without rooms (renders, runs) stay out of the chats list.
26. **Search finds makes**: typing a make's name in the chats search shows its rooms.

## One identity, the same rules everywhere
27. **One identity generator**: a make's color and mark come from its id (the same make looks the same everywhere, on every computer) and never repeat those of the makes on screen.
28. **One naming scheme**: "<Name> · Lab", "<Name> · Video", "<Name> · Board", numbered when there are two ("Lab 2"), parts of a comp "Lab 1/2 · red pulse".
29. **Screenshots and recordings made in a room carry its name** ("Rose Bloom · Lab 2026-10-10 11-31-45.png"), on the Mac and on Windows (file-safe names).
30. **A Lab room's scene is named after the room**, and follows when the make is renamed (renders of that scene carry the name too).
31. **A jam in a Lab room names its scene "<Name> · Jam"**.
32. **A board room's frame** has the make's name and color.

## Every creation is a make
33. **`/dispatch` comps are makes**: named after the main chat, each part's chat titled "<Name> · Lab 1/2 · <part>" with the make's mark; dispatched from a make's room, the parts join that make.
34. **A comp's parts follow its card**: working → waiting → done / stuck, with the last thing each said.
35. **`/intro` video projects are makes**: the project's steps (Plan → Vibe → Scenes → Captures → Edit → Review → Render) are its parts, with their progress (beats done of total) and its renders as outputs; your existing projects become makes too.
36. **Renaming a project's make renames the project.**
37. **Jams are makes** (or a part of the make whose room they run in): the rounds are its progress, its end its status.
38. **Runs that make something** (the Commands page, Flows: renders, recordings, video projects, dispatches…) are makes, with the run's step progress and status.
39. **The Commands audit**: 23 creator commands are routed (`/dispatch`, `/intro`, `/film`, `/jam`, `/sequence-render`, `/edit-render`, `/render`, `/render-again`, `/export-all`, `/cut-export`, `/cut-export-all`, `/comp render`, `/record`, `/tour`, `/make`, `/still`, `/screenshot`, `/shot`, `/board-new`, `/scene new`, `/footage-sequence`, `/motion-intro`, `/makes`); the big ones make a make when run outside a room, the rest join the make whose room you're in.
40. **Outputs**: screenshots and recordings made in a room (or by a creator command) become the make's outputs.
41. **A make knows what made it**: the command (or "an agent"), when, and the chat it came from.

## One place: Makes on the Commands page
42. **"Makes" at the top of the Commands page** (the newest six; the page's search finds makes by name too).
43. **Click a make**: its mark big in its color, name, category, status and %, its idea, every part with its state and ↗ Open, its outputs (Open, show in folder), who made it.
44. **All makes ›**: every make, newest first, dismissed ones faded.
45. **Right-click a make** (Commands page or chats list): ↗ Open, Rooms ›, ⇢ Hand off, Rename…, Plan another room ›, Outputs › (open, show in folder, attach to the chat), Show in Makes, More › (copy the name, mark it done / not done, the chat it came from), Dismiss / Restore.
46. **Rename the whole make**: every room's title, its board frame, its scene and its project follow.
47. **Dismiss a make**: its rooms go to the trash (30 days) together, one toast with Undo; scenes, files and frames stay.
48. **Restore**: every room comes back, grouped again.
49. **Mark it done** (or not) by hand.

## Chats and agents
50. **A room's agent knows its make in one line** ([Make “Rose Bloom” · this room: Lab (1 of 2: Lab → Video) · next: Video · name what you make “Rose Bloom · Lab”]) on its first message, or when your words point at the other rooms; never otherwise.
51. **A room's status follows its chat**: working while it answers, ready after a reply, stuck on an error.
52. **Directors plan makes**: `three_do make { op: "plan", text }` makes the rooms (not opened over your work) and says which; `list`, `status`.
53. **App map topic "make"** (also makes, rooms, plan) for both engines, read on demand.
54. **`/makes`**: the list in the chat and the Makes page.
55. **`/makes open <make> [room]`**.
56. **`/makes rename <make> = <name>`** (in a room: `/makes rename <name>`).
57. **`/makes dismiss <make>` / `/makes restore <make>`**.
58. **`/makes status [make]`** and **`/makes progress <make> <pct> [label]`**.
59. **⌘/Ctrl+K**: "Makes: everything Hearth makes, with its rooms".
60. **The keys sheet** lists the make menu (right-click) and Alt+right-click on a room.

## For the progress bars (and anything else)
61. **`Makes.progress(makeId, partId?, { pct, label, eta })`** stores a part's (or the whole make's) progress and tells `Makes.onChange` listeners and the window event `hearth:makes`; the make's group and its page show the %.
62. **Makes sync** with your other computer like chats and scenes (`data/kv/makes.json`).

## For development (not counted)
- `makes-core.js` (`MakesCore`, no DOM, Node-testable): `identity(seed, avoid)`, `genName`, `nameFor`, `roomTitle`,
  `fileBase`, `slug`, `parsePlan`, `create` / `addPart` / `rename` (returns the rooms to retitle) / `progress` /
  `pctOf` / `statusOf` / `waitText` / `contextLine` / `dismiss` / `restore` / `addOutput`, `CREATORS` + `creatorOf`.
- `makes.js` (`Makes`, `window.Makes`): kv `makes`; `plan`, `addRoom`, `openRoom`, `rename`, `dismiss`, `restore`,
  `handoff`, `progress`, `setPart`, `addOutput`, `onChange`, `show`; adapters `compMake` / `fromComp`, `fromIntro`
  (Intro.onChange), `fromJam`, `fromRun` (Flows.onChange); `identFor` (chat-scenes.js), `fileHere` (capture.js),
  `nameIn` (jam.js); `three_make` (HubBridge); the Commands page section; `makes.css`.
- Small hooks outside the lane: `panel.js` (`hooks.skip`, `hooks.top`, `data-agent` rows in highlight),
  `commands.js` (`Commands.onBefore`), `cmdpage.js` (`CmdPage.ext` sections / pick / menu, `refreshList`),
  `chat-scenes.js` (identity asks Makes first), `comp-dispatch.js` (part titles + state), `jam.js` (sketch name +
  rounds), `capture.js` (file names), `mcp/three-mcp.js` (`make` in `three_do`), `mcp/hearth-map.js` (topic),
  `dev/run-checks.js` (`makes` group, unit test), `index.html` (2 scripts, 1 stylesheet).
- Tests: `node dev/makes-test.js` (15 tests: identity determinism and no clashes, naming, plans → rooms, waiting text,
  rename cascade, dismiss / restore, progress, outputs, the context line's size, the creators audit, unique ids);
  `dev/checks/makes.js` with `--fake-engines` (plan → two rooms with the same name, mark and color, grouped before any
  message; both navigable with their card; the Lab room's scene; a fake director turn; the context line once; a
  screenshot named after the make and kept as its output; hand off; rename cascade incl. the scene; the progress API;
  a `/dispatch` and an `/intro` as makes; the audit against the live registry; dismiss / restore; the Makes page and
  its right-click; `/makes`; no duplicate commands; then a reload: names, marks, statuses, progress, outputs, groups).
  `sh dev/run-checks.sh makes` runs both.

Count: **62** upgrades.
