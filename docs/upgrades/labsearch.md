# 🔎 Lab search (round 36, labsearch): one box for everything the Lab can find

The Lab has grown many places to find things: ✦ More and its submenus, the toolbar's ⋯, Sketch ▾, a layer's
right-click, the effects picker, the gallery, My templates, looks, frame sizes, ▦ All formats, 🩺 Fix my scene,
export, the director's menu, the keys. **Lab search** is one box over all of them. Press **/** in the Lab (or click the
small **🔎** next to ⋯ in the Lab toolbar), type a few words, and pick from one ranked list. **Enter** does exactly what
the menu row would do, because it runs that row: nothing is copied out of the menus.

## Ways in
1. **/** anywhere in the Lab opens it (a key the preview passes on works too). In the sliders column, / still finds a slider there, as before.
2. A small **🔎** in the Lab toolbar, just left of ⋯.
3. **Ctrl/⌘+K → "Lab: Search the Lab (/)"**.
4. **/lab-search [words]**: typed by the owner it opens the box with the words; an AI (three_do run) gets the matches as text ("Glow (Effect: Effects › Filter)"), so the director can tell the owner where something lives. No new director tool, no prompt tokens (one on-demand line in the app map's lab topic).
5. The keys sheet lists **/** under Lab.

## What it finds
6. **Every row of the Lab's menus as they are right now**: the preview's right-click (Freeze, ✦ More with ♪ Music / ✨ Look & motion / ⇪ Make / 🩺 / ⇪ Share / 📐, ◇ Shader, ◐ Grade, ⇪ Export, Frame size, Capture, Sliders, View…), the toolbar's ⋯ (Variations, All formats, Director ›, Code, Console…) and Sketch ▾. Each row shows where it lives ("Right-click the preview › ✦ More › ♪ Music").
7. **The selected layer's right-click** (hide, solo, rename, duplicate, react to the music, a filter above, blend, animate, delete…), with that layer's own handlers.
8. **Submenus are rows too**: Enter on "Frame size" or "◐ Grade" opens that submenu right there.
9. **The Lab's Ctrl/⌘+K actions** (playback speed ½× / ¼×, console modes, contact sheet…).
10. **Effects, filters, looks, palettes, trigger presets, animations, eases and blends** from the effects picker's catalog, **with its small pictures** (a filter's picture once the picker drew it, palette and look swatches, ease curves, trigger bands). Enter applies it the picker's way; **Shift+Enter** the other way (e.g. a filter on top of everything).
11. **This layer's saved looks** (Enter applies one).
12. **The layers of this scene**: Enter selects the layer and lights its row in the Layers list.
13. **Sliders**: Enter opens the sliders panel on that slider.
14. **📐 My templates**, with their pictures: Enter opens the template's form.
15. **Gallery starting points** (built-in moods, the library, node presets, code sketches), with their pictures once the gallery drew them: Enter makes a new scene from one.
16. **Recent scenes**, with their pictures: Enter opens one.
17. **Help**: 16 short "How do I…?" answers (react to the music, change the frame size, add an effect, save sliders, render, start from something, a template, black screen, freeze, present, tap tempo, ask the director, loop, share, keys). Most have a **Show me** button that runs the row they talk about.
18. **The Lab's keys** (Lab, timeline, sliders & layers, Present, director dock): Enter does the key's action when it has one, else opens the keys sheet.
19. **An empty box** shows what you picked lately, then the scene's layers.

## How it understands you
20. **Plain words**: little words are dropped ("make it brighter" → brighter), and ~50 groups of words mean the same here (glow ↔ bloom ↔ glare, vertical ↔ portrait ↔ 9:16 ↔ tiktok, render ↔ export ↔ mp4, random ↔ shuffle ↔ surprise, fix ↔ broken ↔ doctor…).
21. **~40 phrases**: "slow motion" → playback speed ½, "vertical video" / "tiktok" / "reels" → ▦ All formats + 9:16, "black screen" / "not working" → 🩺 Fix my scene + Restart, "make it pop" / "look finished" → ✨ polish, "react to the music", "start over", "depth of field", "color grade", "second screen"…
22. **Typos**: one wrong, missing, extra or swapped letter in words of 4+ letters, two in words of 7+ ("blom", "glwo", "partcles", "vhs tpae"), plus prefixes while typing ("partic", "fix my sc").
23. **Ranking**: a name that matches wins over a description; a whole name found ("Glow") beats a longer one ("Glow amount"); a sentence may miss one word; your recent picks rise among equals; filters and layers lean ahead of other effect families; Delete rows sink. The same row found in two menus is listed once.
24. **Nothing found**: the last row is **"Ask the director: <your words>"**. Enter puts your words in the Three Director's box, **not sent** (the director is made first if there is none, like 🩺 does). The row is also at the end of every list.
25. **Instant**: the index is built the first time the box opens (≈ 1 500 rows from the menus, the catalog, layers, sliders, scenes, help and keys in ≈ 90 ms), the gallery and your templates join a moment later (their groups load then), and the menus are read again on each open (they change: Freeze ↔ Unfreeze). A few silent searches warm it up while you start typing. Measured per keystroke (search + the list) in the app: **avg ≈ 1.6 ms, max ≈ 5 ms** on ≈ 1 900 rows; in Node, 3 000 rows: avg ≈ 0.4 ms, max ≈ 2 ms.
26. Light: nothing loads before the first use (lazy group **labsearch**, tier "use"; the small hook rides with the Lab). Rows are made once per open and reused as you type.

**26 upgrades.**

## Keys: Ctrl/⌘+F was not free
Ctrl/⌘+F is "Find in the current view" everywhere (keys sheet, `renderer.js` handleShortcut), so the Lab does not take it.
**/** was the Lab's "Find a slider": Lab search lists sliders too, and / inside the sliders column still focuses that
panel's own search, so nothing was lost. The keys sheet says so ("/ (in the sliders column)" for the slider search,
"/" in Lab for the search). `qa-keys`: Lab area 38 pressed, 0 dead, 0 global conflicts.

## How it's built
- `tools/three-search-core.js` (`LabSearchCore`, no DOM, Node-tested): words (fold, light stems, "9:16" kept whole), synonym groups, phrases, an optimal-string-alignment typo distance stopped early, the index (word → items with the best field weight: name 1, tags .6, hint .5, path .4; a sorted word list for prefixes; word lookups memoised), `search` (terms with alternatives, phrases adding up their words, one miss allowed in a sentence, name coverage, kind / boost / recent / danger), and the HELP answers.
- `tools/three-search.js` (`LabSearch`, lazy group **labsearch**) + `tools/three-search.css`: the sources (menus walked from both menu formats, `{label, items, action}` and `[label, hint, fn | rows, checked]`), the box (a modal dialog near the top, ↑↓ / PgUp / PgDn / Enter / Shift+Enter / Esc, hover), what each kind does, the director's box, `/lab-search`, the Ctrl/⌘+K action, timing in `LabSearch.last`.
- `tools/three-search-hook.js` (`LabSearchHook`, in the **lab** group): the 🔎 button, `open()` (loads the group), the keys-sheet line.

## Edits outside the new files (small, additive)
- `tools/three.js`: `api.search` (the menus as built now: `previewMenuItems()`, `labMoreItems()`, the Sketch ▾ rows now in their own `sketchMenuRows()`; a layer's menu handlers; layers, sliders, reveal a slider, looks) and `ThreeLab.search`; the 🔎 in the toolbar's Assets group; / opens the search (the sliders column keeps its slider search); the Lab keys sheet line for /.
- `tools/three-layers.js`: the layer right-click's handlers in one `menuHandlers(L)` (same behaviour) and `panel.menuFor(id)`.
- `tools/three-fx.js`: exports `thumb`, `hint` and `thumbCached` (the picker's small pictures).
- `tools/three-easy-data.js`: where `lab-search` lives (the labeasy audit).
- `keys-ui.js`: the slider search's line now says "/ (in the sliders column)".
- `lazy-data.js` (hook in the lab group, the new group, the regenerated manifest), `index.html` (`labsearch` on the existing lazy-at.js tag), `mcp/hearth-map.js` (one lab-topic line + aliases), `dev/run-checks.js` (the check first in `lab:`, the unit test in UNIT), `FEATURES.md` (a short section).

## Tests
- `node dev/labsearch-test.js` (unit group), **13 tests, all pass**: words and stems, the typo distance, a name wins (glow → Glow, bloom by synonym, the Glow slider), typos (blomm, glwo, partcles, vhs tpae; slow ≠ glow), prefixes while typing, plain words (slow motion, vertical video → All formats then 9:16, tiktok, make it brighter → Adjust, react to the music, black screen → Fix my scene, copy this layer → Duplicate), a sentence may miss one word, little words only, nothing found, layers / templates / gallery / scenes / help by name, recent picks and Delete rows, the help answers, and **< 16 ms per keystroke on 3 000 rows** (warmed up, best of 3 on a busy machine).
- `dev/checks/labsearch.js` (lab group, ≈ 1 min), **21 steps, all pass**: not loaded before use; the 🔎 next to ⋯ and the keys-sheet line; **/ pressed for real** opens it (the group loads, the / isn't typed), Esc closes, the 🔎 opens it; typing "vertical video", "make it brighter", "glwo" letter by letter with **each keystroke timed (max 5.3 ms, avg 1.6 ms)** and the right first rows; effects' small pictures; **"freeze" → the preview's ❚❚ Freeze row, Enter freezes**; "frame size" → Enter opens that submenu; **"vhs" → the VHS tape filter, Enter adds the layer**; **"backdrop" → Enter selects the layer and lights its row**; "glow amount" → the slider shown in its panel; **a template → Enter opens its form**; gallery and help found; **nothing found → one row, Enter fills the director's box, still unsent a moment later**; `/lab-search glow` as an AI → matches as text.
- Also run: `sh dev/run-checks.sh lazy unit:boot-test unit:director-mcp-test labeasy` all pass (manifest regenerated, 0 duplicate commands, the director's lean tool budget unchanged, the labeasy audit places /lab-search); `qa-keys` full run: one "dead" Lab key (| pin a frame, keys at the preview frame) that is not this change's; the Lab area run again on its own: 38 pressed, 0 dead, 0 global conflicts (the flaky-key note from round 30).
- Screenshot looked at: the box over the Lab with "glow" (Glow filter with its picture, the Glow blend, the Glow amount slider, Glow border, Glow orb, a gallery starting point, an action from the 📷 Camera menu…), the 🔎 next to ⋯.

## Caveats
- The menus are read as they are when the box opens; a row that only appears in a certain state (e.g. while a song plays) is found only in that state. Submenus built later from a promise aren't listed.
- Actions of other layers' right-clicks aren't listed (only the selected layer's): select the layer first (search its name, Enter).
- Filter pictures show once the effects picker drew them (the search doesn't render new ones); otherwise the category shows.
- Sliders are listed for layers whose sliders panel exists (the selected layer at least).
- "Ask the director" makes a Three Director first when there is none (the same as 🩺 Fix my scene's Ask).

## For the patch notes
- New in the Lab: **🔎 Lab search**. Press **/** in the Lab (or click the small 🔎 next to ⋯) and type what you want in plain words.
- One list finds menu actions, effects, looks and palettes (with their little pictures), your layers and sliders, My templates, gallery starting points, recent scenes, and short "how do I…" help.
- **Enter does it**: runs the menu row, applies the effect, selects the layer, opens the template's form or the scene.
- Plain words and typos are fine: "glow" finds bloom, "make it brighter" finds Adjust, "slow motion" finds the ½ speed, "vertical video" finds All formats, "blom" still finds Bloom.
- Nothing found? The last row puts your words in the director's box (not sent) so you can ask it instead.
- Inside the sliders column, / still finds a slider like before. Ctrl/⌘+F stays "Find" everywhere.
- Light and instant: it loads the first time you use it and answers in a few milliseconds per key.
