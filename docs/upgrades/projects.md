# Projects (round 23): a home for everything

You have many chats, Lab scenes, boards, renders, makes and files, on two computers. A **project** now gathers one
piece of work, whatever it's made of, and **Home** (⌂ in the rail) shows your projects as cards with a picture and
"continue where you left off". **Search everything** (Ctrl/⌘+Shift+K) finds anything across all of it.

Nothing is added to any prompt: suggestions come from names, links and timing (no tokens), and the agents only learn
about projects when they look them up (the "projects" topic of the app map). Everything is lazy: the projects code loads
after the first screen, Home draws only while it's on screen, and search reads its sources on the first keystroke.

Counted honestly: one line per thing you can see or use.

## A project
1. **A project groups** chats of any agent (Claude, Astra, the Three Director), Lab scenes and their sequences, boards, renders, captures, files and folders of the chats' workspace, app downloads and deploys.
2. **One identity**: a name, a color and a mark from the makes' palette (never the same as the projects on screen).
3. **A cover**: the latest render or still, else the latest scene's picture, a board's cover, a chat's scene still; or the one you pick (right-click an item › Use as the cover).
4. **Notes**, synced with your other computer.
5. **A status**: active, paused, done, archived (archived ones leave Home and the chats list; Home › ⋯ › Archived projects).
6. **Look ›**: next color, next mark (or click the mark on its page; right-click it for the next color).
7. **Works on both computers**: kept in `data/kv/projects.json` (names, references and times only: about 1 KB a project, no pictures), synced like your other data; two computers adding things to the same project merge item by item; the sync conflict view calls it "Projects".
8. **Deleting a project only forgets the grouping**: its chats, scenes and files stay where they are; Undo in the toast.

## Three ways to make one
9. **By hand: `/project new <name>`** in a chat: the chat comes along (with its scene).
10. **Home › ＋ New project**.
11. **Right-click a chat in the chats list › Project ›**: put it (and its scene) in a project, a new one, or take it out.
12. **Right-click a sketch in Your sketches (▦) › Project ›**.
13. **From a make, automatically**: a make with rooms becomes a project with the make's name, mark and color, its rooms, their scenes, its board and its outputs; it follows the make's renames (until you rename the project); a project you deleted isn't made again.
14. **Your existing makes with rooms** become projects the first time.
15. **Suggested, without tokens**: "3 chats and 2 scenes are about “Stoop Ronin”: make it a project?" from words the names share (workspace folder names too: `stoop-ronin`), links (a chat's scene, a board's linked chats) and timing (things months apart stay out; recent groups first).
16. **A suggestion on Home**: Make it (opens the new project), or × (never suggested again).
17. **`/project suggest`** lists them; **`/project suggest 2`** makes one a project.

## Things join by themselves
18. **A scene linked to a project's chat** (a director chat's scene) joins the project.
19. **Screenshots and recordings** made while a project is in front of you (its chat, its scene, its page) join it.
20. **Renders** started while a project is in front of you join it when they finish.
21. **A make's new rooms and outputs** join its project.

## Home (⌂ in the rail, `/home`, Ctrl/⌘+K "Home: your projects")
22. **Your projects as cards**, latest first: the cover, the mark and name in its color, its status, what it holds ("3 chats · 2 scenes").
23. **Continue where you left off** on each card: its last chat, last scene and last render, one click each.
24. **Light**: 24 cards at a time as you scroll, pictures load lazily and decode off the main thread, nothing is drawn while Home is hidden.
25. **One search box** on Home: the same search as Ctrl/⌘+Shift+K, results in place of the cards.
26. **⋯**: a new chat, open the Lab, search everything, suggest projects, group chats by project, archived projects.
27. **When there are no projects** it says what a project is and how to make one.
28. **A project's page** (click a card): the cover, the mark (click: next mark), the name (click: rename), the status, how and when it was made.
29. **↻ Continue**: the last chat, else the last scene, else the last render.
30. **＋ Add**: this chat, the scene on screen, the board on screen, or a recent chat, scene, board, render, capture, workspace folder, download or deploy, or a file from disk (a folder too on the Mac).
31. **Notes** right on the page (saved as you type).
32. **Everything in it by kind**, latest first, with pictures for scenes, renders, captures and boards; a click opens it where it lives; things deleted (or not arrived from your other computer yet) show faded.
33. **Right-click an item**: Open, Reveal in Finder / Show in Explorer, Copy path, Use as the cover, Project ›, Take out.
34. **Right-click a card**: its page, continue, only its chats, add, rename, status, look, notes, delete.

## Search everything (Ctrl/⌘+Shift+K, `/everything <words>`)
35. **One search across your work**, results as you type, ranked (title words first, then the rest, recent first).
36. **Projects**: names and notes.
37. **Chats**: titles at once, then their messages (the store thread's index from round 20, so typing never stalls).
38. **Lab scenes**: names, layer names, code, and named sliders (shown under the result: "sliders: katana, dusk"); a code hit shows the line around it.
39. **Boards**: names and every item's title, caption, text and link; opening one zooms the board on the item.
40. **Renders and captures** by name.
41. **Workspace files and folders, downloads and deploys**.
42. **Commands**: a command result goes in the chat box (nothing runs until you press Enter).
43. **Kinds as chips** (All, Projects, Chats, Scenes, Boards, Renders, Files, Commands); Tab / Shift+Tab moves between them, or start with `scene:`, `chat:`, `board:`, `file:`, `cmd:`.
44. **Keys**: ↑ ↓ Enter, Esc; right-click (or Shift+F10) a result for its menu (its project, reveal, cover…).
45. **Each result says its project** (mark and name in the project's color) and how old it is.
46. **`/everything <words>`** (also `/search-all`) opens it; from a director (`three_do run`) it answers with the top hits.

## The chats list
47. **Grouped by project**: each project with chats is a collapsible group above the agents (its mark, name and count); rows drop the project's name ("characters" under ❖ Stoop Ronin) and show their agent's mark.
48. **A project's chats aren't repeated** under their agents.
49. **A make's project replaces the make's group** and keeps its status and progress bars.
50. **⋯ on a project's group, or right-click it**: its page, continue, only its chats, add, its make ›, rename, status, look, notes, delete.
51. **⏷ › Group by project** on / off (`/project group on|off`).
52. **⏷ › Only one project ›**: just its chats; the chip names it (`/project filter <project>`, `/project filter off`).
53. **Long projects**: "N more in Stoop Ronin ›" shows them all; past 8 projects, "N more projects ›" opens Home.
54. **The chats search box finds a project** by its name (all its chats show).

## The Lab
55. **The sketch picker groups scenes by project** (the project's name and mark over its scenes, the others after).
56. **Your sketches (▦) › All projects ▾**: show one project's scenes (remembered).
57. **A project's mark on its scenes' cards** in Your sketches.

## Chat commands and the rest
58. **`/project`**: the project of this chat (and its page on Home), else Home.
59. **`/project add [chat | scene | board | render | <path>] [to <project>]`** and **`/project remove … [from <project>]`**.
60. **`/project open <project>`** and **`/project continue [project]`**.
61. **`/project rename <project> = <name>`**, **`/project status <active|paused|done|archived>`**, **`/project note <text>`** (no text: open the notes).
62. **`/project list`**, **`/project delete <project>`**, and **`/projects`** (the list + Home).
63. **`/home [project]`**: Home, or a project's page.
64. **Ctrl/⌘+K**: Home, Search everything…, Projects: new project…, Projects: suggest projects.
65. **The keys sheet** lists Ctrl/⌘+Shift+K and the project menus.
66. **The app map** has a "projects" topic (also project, home, everything) for Claude and Astra, read on demand.

## For development (not counted)
- `projects-core.js` (`ProjectsCore`, no DOM, Node-testable): `create`, `addItem` / `removeItem`, `rename` / `setStatus` / `setNotes` / `setCover` / `setIdent`, `normalize`, `suggest`, `search` / `snippet`, `sliderNames`, `cover`, `latest`, `countText`.
- `projects.js` (`Projects`): kv `projects`; sources read on demand and cached (`Src`: sketches, Lab stills, boards, renders, captures, workspace, downloads, deploys); makes adapter (`fromMake`, `syncMakes`, `hidesMake`); `sceneLinked`, `madeHere`, `onRenderJob`; `suggestions`; `openItem`; menus; the chats-list hooks; `sketchGroups` / `sketchBrowse` / `sketchMenu` for the Lab. `projects-search.js` (`ProjectsSearch.open / view / find / messages`), `projects-home.js` (`ProjectsHome`, the `home` rail tool), `projects-cmds.js` (commands, wiring), `projects.css`. A lazy group `projects` (lazy-data.js, 'soon').
- Small hooks outside the lane: `panel.js` (`hooks.view` / `hooks.menu` / `hooks.itemMenu`, the chip's label), `makes.js` (a make whose project shows its rooms has no group), `chat-scenes.js` (`hearth:scene-link` event when a chat gets its scene), `tools/three.js` (optgroups in the sketch picker; the filter, card mark and menu in Your sketches), `renderer.js` (Ctrl/⌘+Shift+K), `sync.js` (the store's name), `mcp/hearth-map.js` (topic), `dev/run-checks.js` (`projects` group, unit test), `lazy-data.js` (+ regenerated manifest).
- Tests: `node dev/projects-test.js` (12: model, identity, normalize, a real three-way merge through sync-merge.js, keys, suggestions incl. links / timing / dismissed, search ranking and filters, sliders, covers, continue). `dev/checks/projects.js` (smoke, fake engines, 39 steps: by hand, from a make, from a suggestion; Home's suggestion, cards, covers, continue; search across projects / chats / messages / scenes / sliders / board items / commands, `scene:`, Ctrl+Shift+K, Tab, Enter opens the scene; the chats list grouped, collapsed, filtered, grouping off / on, right-click › Project; the Lab picker's groups; the kv file). `sh dev/run-checks.sh projects`.

Count: **66** upgrades.
