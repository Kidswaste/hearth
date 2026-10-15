# menucalm (round 43): the menus, calm

AI setup, Settings and the chat were calmed in rounds 33, 39 and 40. This pass does the same for the **menus**,
which grew round by round. The biggest was the Lab picture's right-click: 23 rows, with ♪ Music three levels down. I
counted every menu you point at, looked at them on screen, and gave each one an order: most used first, the same
action under the same name and icon everywhere, groups with a line between them, rare rows one level down. Pointing
at a submenu inside a flyout now opens it too, so most rows are one click away. Nothing was removed. Every row from
before is still in a menu, under its old name or its new one (listed below). Lab search and Find anything read the
menus as they are, so they find the moved rows where they now live.

## Audit: every menu, before → after
Counted by `dev/checks/menucalm.js` (new). It reads each menu the way it shows: showMenu's "More…" and its tidy-up
(danger rows last), popMenu's folds, and the chats / rail / board menus through a real right-click with the menu
calls caught. "Top" is the rows you see when the menu opens (separators and headings not counted; "Customise this…"
counted). "Depth" is the deepest submenu level. "All" is every row at every level. "Before" is the same reading run
on the base commit (4992f1a). Screenshots looked at before and after: the picture's right-click, both flyout levels,
the toolbar ⋯ and Sketch ▾.

| Menu | Top before | Top after | Depth before → after | All before → after | What changed |
|---|---|---|---|---|---|
| **Lab picture, right-click** | **23** | **11** | 4 → 5 | 403 → 401 | most used first; 13 module rows went into ＋ Add / ✨ Look & motion / ⇪ Make & export / ✦ More; ♪ Music one level up |
| Lab ✦ More (inside it) | 8 | 8 | 3 → 4 | 56 → 158 | Music / Look / Make moved up; it now holds the rare ones (Fix my scene, Restart, 🎚 Live, Share, templates, recipes, keys) |
| **Lab toolbar ⋯** | **17** | **11** | 2 → 2 | 62 → 62 | two parts (Make · This Lab); Console in Code & console; View & help |
| **Lab Sketch ▾** | 6 (11 hidden behind "This sketch ›") | **9**, none hidden | **3 → 2** | 24 → 24 | History ›, ⇪ Share & export ›, More › |
| Lab layer, right-click | 8 | 8 | 2 → 2 | 15 → 15 | already calm (its More… holds 7) |
| **Lab waveform, right-click** | 12 (+4 with footage) | **7** | 1 → 2 | 12 → 21 | Lab menu with submenus; trim / save / the 1 / zoom out in More ›; section names a submenu |
| Chat ⋯ (right-click) | 10 | 10 | 2 → 2 | 49 → 49 | already calm |
| A message's ⋯ | 6 | 6 | 3 → 3 | 40 → 40 | "Copy “/jump 2”" → Copy a way back here |
| Chat box, right-click | 6 | 6 | 2 → 2 | 17 → 17 | |
| Chats list, right-click | 9 | 9 | 2 → 2 | 26 → 26 | |
| A chat group, right-click | 4 | 4 | 2 → 2 | 16 → 16 | |
| Rail: an AI / a tool | 6 / 3 | 6 / 3 | 2 → 2 | 11 / 5 | |
| Rail, right-click | 8 | 7 | 2 → 2 | 18 → 19 | Find anything…, Typed actions…; Your usage + Import in More… |
| Board, right-click | 10 | 10 | 5 → 5 | 1097 → 1096 | |
| **Board ▾** | **20** | **12** | 3 → 3 | 236 → 236 | Organise ›, Use it ›; your boards and new ones first |
| Board ＋ Add | 13 | 13 | 4 → 4 | 510 → 510 | one 📌 Find images like this… |

Other counts, before → after (the same check):
- **The same action twice in one menu tree**: 3 in the picture's right-click (✨ Make it look finished at the top
  *and* in Look & motion; ▦ All formats in ⇪ Export *and* in Make; "Contact sheet" in Capture *and* in Export) → **0**.
  Same action twice in one list: 0 → 0. The same action in different menus is fine and stays (🎲 Variations is in
  the toolbar ⋯ and in Look & motion).
- **Different names / icons for the same action across menus** → 0: "📷 Screenshot" / "Save a screenshot" (now
  🖼 Save a screenshot), "The capture menu…" / "◉ More capture…", "Guides" / "⌗ Composition guides", "Duplicate" /
  "⧉ Duplicate", "Export HTML…" / "Web page (one .html)", "📌 Images like this board…" / "📌 Find images like this…",
  "⧉ Make a batch" / "⧉ Make a batch…", "⌘ Command palette" for what is Find anything since round 37.
- **Command names on screen in menus**: 4 ("Copy “/jump 2”", the waveform's "/cut-loop", "/calm" on Customise
  this… › Show everything, "/dispatch makes some") → **0**.
- **Rows that mean nothing right now** but showed: Board ▾ "Show hidden (0)", "Compare with another board" with one
  board, "Move to board" / "Copy to board" with one board, Select › "With tag" with no tags, a second cue row on
  footage → hidden until they mean something.
- **Rows deeper than 2 clicks** (before, pointing opened one level; a click opened each level after that): in the
  picture's right-click, everything three levels down needed 2 clicks and four levels down 3 (✦ More › Look & motion ›
  Surprise me › …, ✦ More › Make › Make it loop › …, Live's lists). Now pointing opens two levels, and every row is
  within 2 clicks except 🎚 Live (VJ)'s settings of settings (Transition › Length › 1 bar…), which were 3 clicks
  before and still are. Sketch ▾ had rows 3 clicks away (This sketch › Publish & Adobe › …) → 0.
- **Rows with a cut-off hint and no tooltip**: every one (menus had no tooltips) → 0. The picture's right-click and
  its submenu rows now each have a one-sentence tooltip.

## Upgrades

### The Lab picture's right-click
1. **23 rows → 11, most used first** (your counts: Freeze, the frame sizes, Save / Shuffle, the music): ❚❚ Freeze ·
   Frame size › · Sliders › · ♪ Music › · Capture › · View ›, then a line and what you add or make: ＋ Add › ·
   ✨ Look & motion › · ⇪ Make & export › · ✦ More ›.
2. **♪ Music is one level up** (it was ✦ More › ♪ Music). Make it react, the drops, cues, the beat: one click.
3. **＋ Add** gathers what puts something into the scene: another scene as a layer, picture in picture, add this
   scene to the sequence, then ◇ Shaders, ✦ Particles, 🅰 Type, ⚛ Physics, 🧊 3D model, 🗂 Assets, 📷 Webcam, then
   the comp's own rows (dispatch, precomps, render the comp). A precomp's settings stay two levels down.
4. **✨ Look & motion**: ◐ Grade and 🎥 Camera moves first, then 🎲 Variations, Surprise me, Make it look like this,
   Describe it, Make it look finished, Hearth on screen, a motion intro, a cursor tour, fade to black.
5. **⇪ Make & export**: ▦ All formats, ⧉ Make a batch, 4 variations, render again, a music video, ∞ Make it loop,
   then ⇪ Export… and **Other formats ›** (4K, ProRes, GIF, print, GLB, web page, sliders, contact sheet).
6. **✦ More keeps the rare ones**: 🩺 Fix my scene, ⟲ Restart from scratch, 🎚 Live (VJ), ℹ What's going on,
   ⇪ Share, 📐 My templates, 📜 Recipes, Lab keys.
7. **In the sequence view, ▤ Sequence › is the first row** (Back to the scene, Render, Reload). Outside it,
   "Add this scene to the sequence" waits in ＋ Add.
8. **"📷 Camera" is now "📷 Webcam"**, so it isn't mixed up with 🎥 Camera moves.
9. Nothing twice: ✨ Make it look finished only in Look & motion, ▦ All formats only in Make & export. ⇪ Export's
   contact sheet is **🎞 Contact sheet as a file** (Capture's 🎞 Contact sheet shows it).
10. View › **⌗ Composition guides** uses the same name as in the picture's ⋯ (it was "Guides").

### The Lab toolbar's ⋯
11. **17 rows → 11, in two parts.** **Make**: 🎲 Variations, ▦ All formats, ⧉ Make a batch…, 📐 My templates,
    📜 Recipes, Director. **This Lab**: 🩺 Fix my scene, Capture, **Code & console** (snippets, three.js version,
    live code, what the console shows), **View & help** (Focus, moving around, frame pace, key hints, Lab keys,
    What can I do here?).
12. One name per capture row: **🖼 Save a screenshot** (it was "📷 Screenshot" here and "Save a screenshot" on the
    picture) and **◉ More capture…** (it was "The capture menu…").

### Sketch ▾
13. **Nothing hidden behind "This sketch ›" any more**: 9 rows. New from a template…, ▦ All your sketches,
    📐 My templates, then Rename…, ⧉ Duplicate, **History ›**, **⇪ Share & export ›**, **More ›**, then Delete….
14. **History ›** gathers ⏱ Time machine…, Earlier versions and deleted sketches… (was "History…") and
    🛟 Recover lost scenes….
15. **⇪ Share & export ›**: save as a pack, open a pack, copy all the code, Web page (one .html)… (was "Export
    HTML…"), Publish as a web page…, Preview the web page here, Open the picture in Photoshop. Every row two clicks
    (Publish was three).
16. ⧉ Duplicate has the same icon as in a layer's menu.

### The waveform's right-click
17. **The Lab's menu look**: submenus, the filter, arrow keys, tooltips. What's at that spot comes first (the
    footage's Cut at f…, a 🎥 camera move from here), then Play from here, Loop this bar / this part, Remove the loop,
    Cue here, **Section here ›** (Intro, Build, Drop… right in the menu), **More ›**.
18. **More ›** holds loop 4 bars, Song starts / ends here, Untrim, Save … as its own file, The 1 is here, **Zoom
    out to the whole song** (was "Whole song").
19. Plain words: "Save the whole file as a file" → **Save the whole song as its own file**, and its hint says
    "next to the original (needs ffmpeg)" instead of "/cut-loop". On footage, one cue row (the footage's "Cue at f…").

### Every menu
20. **Pointing goes two levels deep**: a submenu row inside a flyout opens its own flyout beside it, so a row three
    levels down is one click away. Click, the arrow keys and ‹ back work as before.
21. **One-sentence tooltips**: a row whose note is cut short at the menu's edge says it whole when you point at it,
    as a sentence. The picture's right-click and its groups say what is inside them.
22. **What you use stays in sight**: a rare row that waits behind More… stays out of it once you have used it 5
    times on this computer. Clicks in flyouts now count as menu use (they counted as "Other").
23. **An empty submenu doesn't show.**

### The rail, the chat
24. The rail's right-click: **⌕ Find anything…** (Ctrl/⌘+K; it said "⌘ Command palette"), **Typed actions…**
    (Ctrl/⌘+; was "Command bar", the chat box's name for it), then ⚙ Settings. Your usage… and Import past chats…
    wait in More….
25. A message's ⋯ › Copy & save: **Copy a way back here** (it said "Copy “/jump 2”").
26. Customise this… › Show everything, always: no "/calm" on the row, and its note says where to tidy again.

### The mood board
27. **Board ▾: 20 rows → 12**: your boards, New board…, New from a template ›, then 📌 Find images like this…,
    Show the board to a chat ›, Export ›, then Rename…, Link to a chat ›, **Organise ›** (lock, brief, collections,
    group by vibe, style everything, starred, duplicate, views, untangle, background…), **Use it ›** (give the vibe
    to the director, palette → Lab look, clips on a timeline, ask a chat, chats get…, Pinterest, copy as a
    picture, save as a template, compare), More…, Delete last. Rows the board's add-ons put there land in the right
    group by name.
28. **One name for finding pictures**: ＋ Add says **📌 Find images like this…** like Board ▾ (it said "📌 Images like
    this board…"); the Pinterest phrases are **📌 Pinterest searches for this vibe**.
29. **Only what means something now**: Show hidden only when something is hidden; Compare with another board, Move
    to board and Copy to board only with another board; Select › With tag only with tags.
30. **Fixed**: an unticked "Starred" (and the unticked choices of Chats get…) showed as an empty row with the word
    on the right.

### Help that points to the right place
31. Lab search's "How do I…" answers, Find anything's camera-move answer, the app map the AIs read, FEATURES and
    the code comments name the new places (right-click the picture › ♪ Music, ✨ Look & motion › 🎥 Camera moves,
    ⇪ Make & export › ∞ Make it loop…).

**31 upgrades.**

## How it's built
- `renderer.js` (the menus): `menuTip` (a row's `tip`, else a hint over 24 characters, as one sentence; popMenu rows
  take it from `[5]` or the hint), `menuUses` + `MORE_STAYS_AT` (Usage's "Menus › label" count), empty submenus
  dropped, `showMenuFly(row, it, ctx, level)` with a second panel `#menu-fly2` (`hideMenuFly2`; the ‹ back chain is
  kept), and `menuArrange(list, { order, groups, seps })` for menus several modules add to (Board ▾).
- `polish.css`: `#menu-fly2` drawn like `#menu-fly`. `start.js`, `a11y.js`, `usage.js`: `#menu-fly2` beside
  `#menu-fly` (click-outside, focus return, usage area "Menus", the quiet / noisy lists).
- `tools/three-easy.js`: `musicItem()`, `lookItem(extra)`, `makeItem(extra)` (dedupes by name), `previewItem(extra,
  tail)` (✦ More), `previewGroups()` (the four rows, for checks); `placed()` walks them with their new paths.
- `tools/three.js`: `previewMenuItems()`, `labMoreItems()`, `sketchMenuRows()` rebuilt; the ⋯ and Sketch ▾ tooltips.
- `tools/three-media.js`: `waveMenu` on popMenu. `tools/three-motion-in.js` (📷 Webcam), `tools/three-export.js`
  (contact sheet), `tools/three-comp.js` (no "/dispatch"), `tools/three-batch-hook.js` (…).
- `board-menus.js` (`calmBoard`, `ck` without padding, state-only rows), `board-plus.js` (padding), `board-eyes-ui.js`,
  `pinboard-hook.js` (names). `declutter.js` (rail, "/calm"), `native.js` (Copy a way back here).

## Tests
- `dev/checks/menucalm.js` (new; in the lab group and its own `menucalm` group): reads 17 menus (above). Checks a
  budget of top rows per menu, no row twice in one list, every action within 2 clicks (pointing opens two levels;
  popMenu clicks every level; a row counts when any menu has it within 2), the Lab's menus within 2 clicks in the
  menu itself (except 🎚 Live's settings of settings, 3 as before), one name + icon per action (`CANON`), no old
  wording, no command names in rows or hints, **nothing gone** (≈ 230 rows of before by name or by their new name),
  state rows hidden, Lab search finding the moved rows, and Find anything finding the rail's renamed row. On the real
  picture it right-clicks, checks the order and the tooltips, points two levels deep (`#menu-fly2` shows), and
  clicks a row there (everything closes). On the base commit (run from a copy of 4992f1a): 13 of its 15 steps fail.
  The waveform's menu can't even be read there, because it wasn't a showMenu / popMenu. After: PASS.
- Updated for the moved rows without weakening them: `labeasy` (♪ Music, ✨ Look & motion, ⇪ Make & export beside
  ✦ More; What's going on inside; the ⋯ found by its data-feature), `autopolish`, `labvariations`, `perfectloop`,
  `autoedit`, `labbatch`, `multiformat`, `lookmatch` (`LabEasy.previewGroups()` instead of ✦ More's items), `packs` (Sketch ▾ › ⇪ Share &
  export), `scenesafe` (Sketch ▾ › History), `deploy-build` (Sketch ▾ › ⇪ Share & export › Publish as a web
  page…), `pinboard` (📌 Find images like this…).
- Run (`sh dev/run-checks.sh menucalm` + the updated ones): menucalm, labeasy, appsearch, chatcalm, a11y, labrecipes,
  labcamera, labtemplates, labbatch, multiformat, lazy, `unit:boot-test`, packs (+ unit), scenesafe (+ its units),
  autopolish, labvariations, perfectloop, autoedit, pinboard (+ unit), deploy-build: all pass.
- `labsearch` failed its per-keystroke timing step twice while other streams loaded the machine (p95 27–29 ms; the
  same word typed again took 0.8–2 ms). It passed when run again.
- `labvariations` once hit the harness's 540 s limit under the same load, and passed when run again (24 s).
- `qa-keys` fails on "Everywhere · Ctrl+2" (a key pressed in a text box). It fails the same way on the base commit
  (there with Ctrl+\ and Ctrl+Alt+P too), and this pass touched no keys. `lookmatch` was updated (Look & motion's rows
  come from `previewGroups()`) but not run.

## Risks
- Menus several modules add to are arranged **by name** (Board ▾'s `calmBoard`). A row renamed later lands
  ungrouped after the ordered ones. It stays visible, it is just not grouped.
- `#menu-fly2` is a new element. A check that looks for "the flyout" by `#menu-fly` alone won't see the second level.
  Nothing existing did.
- The "more than 5 uses stays out of More…" rule moves a row up as you use it. That is on purpose (your habits),
  but it means a menu can change slightly over time.
- The Lab picture's right-click now has 11 rows plus a filter field, because showMenu adds the filter from 9 rows.
  The filter also finds rows inside the submenus.

## For the patch notes
- The menus are calmer: the Lab picture's right-click went from 23 rows to 11, most used first: Freeze, Frame size,
  Sliders, ♪ Music, Capture, View, then ＋ Add, ✨ Look & motion, ⇪ Make & export, ✦ More.
- ♪ Music is right there in the right-click now (it was inside ✦ More).
- Pointing at a submenu inside a submenu opens it too, so most rows are one click away.
- The Lab toolbar's ⋯ (17 → 11) and Sketch ▾ (nothing hidden behind "This sketch" any more: History, Share & export)
  read in two short parts.
- The same action has the same name and icon in every menu (🖼 Save a screenshot, ⧉ Duplicate, 📌 Find images like
  this…, ⌕ Find anything…), and no menu shows a command name any more.
- Menu rows whose note is cut off say it whole when you point at them.
- The waveform's right-click is shorter (play, loop, cue, sections; the rest under More), and the board's Board ▾
  menu went from 20 rows to 12 (Organise, Use it).
- Rows that mean nothing right now (Show hidden (0), compare with only one board…) stay out of the way.
- Nothing was removed. Lab search and Ctrl/⌘+K Find anything find every row where it lives now.
