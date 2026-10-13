# 🎲 Variations (round 32, labvariations)

From the Lab scene on screen, a grid of 6 takes to click, made on this computer with 0 tokens. Each take nudges
the scene's own values: every layer's sliders (the ◐ Grade / ◐ Film & lens sliders too) and the sketch palette.
Each one leans on one group so the set reads as clearly different takes: **New colors**, **Livelier / Calmer**,
**Another angle**, **New look**, **A bit of everything**. Click one and it applies as one undo step. Hover one and
the preview shows it live until you leave. **More like this** makes a closer set around what you picked. A lock per
group (**Colors · Motion · Camera · Look**) keeps those values as they are.

How to get there, no commands needed: **right-click the preview › ✦ More › ✨ Look & motion › 🎲 Variations** (first
row), **the Lab toolbar's ⋯ › 🎲 Variations**, the director's **◎ mission "Quick variations (free)"** (your words
steer it), and ⌘/Ctrl+K "Lab: Variations of this scene". The app's internal command is `/variations`, and the director
reaches it through `three_do run` (the app map's lab topic explains it, read on demand, so it adds no prompt tokens).

New files (lazy group **labvar**, tier `use`: nothing loads until the first time you open it):
`tools/three-variations-core.js` (the math, Node-testable), `tools/three-variations.js` (the card, applying, locks, the
command), `tools/three-variations.css`.

## How the takes are made (no tokens)
1. **Every layer's sliders are read**, including the grade's. Values that are only read at setup and keyframed values are left out, because a quick picture couldn't show them and keyframes would overwrite them.
2. **Four groups, from the names**: colors (color sliders, hue numbers, the palette) · motion (speed, spin, flow, wobble, pulse, orbit speed…) · camera (camera, distance, zoom, FOV, angle, tilt, orbit…) · look (light, glow, bloom, grain, materials, shapes, seeds, the grade: the rest).
3. **New colors** turns every color the same step around the wheel (40–180°), so the scene keeps its harmony, plus a small saturation / lightness touch. Greys stay grey.
4. **Livelier / Calmer** multiplies the motion values (×1.35–1.9 or ×0.4–0.7). Something standing still starts moving.
5. **Another angle** moves the camera values within their ranges.
6. **New look** moves the light / material / grade values, and sometimes flips an on/off or switches a choice.
7. **A bit of everything** moves every group halfway.
8. **Every take differs** from the scene and from the others (duplicates are re-rolled). Values stay in range, and whole numbers stay whole.
9. **Seeded**: the same seed gives the same set (Node-tested).

## The card (over the preview, top left)
10. **6 pictures in a 3 × 2 grid**, shaped like your frame (9:16, 1:1, 16:9…), each labelled with what it leans on.
11. **Click a picture**: its values land as **one undo step** (the sliders' own ↶ once puts them back), the palette turns with the colors, and the tile gets a ✓.
12. **The toast's Undo** and the card's **↶ Undo** put back the values and the palette in one go. They also notice if you moved a slider in between.
13. **Hover a picture**: the preview shows it live. Leave and it's back. Peeks leave no undo steps.
14. **More like this**: a new, closer set around what you picked ("New colors, a little"…). Right-clicking any picture gives the same for that one.
15. **↻ New ones**: another set around what you have now.
16. **Keep: 🎨 Colors · 〰 Motion · 🎥 Camera · ✨ Look**: lock a group and a new set comes at once without touching it. Locks are remembered. A group the scene doesn't have isn't shown.
17. **Keys while it's open**: 1–6 use that take, Esc closes it (what you picked stays). Both are listed in the keys sheet.
18. **"Save keeps it in the code"**: it's ordinary slider values, so Save, Shuffle, slots, looks and the time machine all work on it (a version is noted in the time machine).

## Light and smooth (the 240 Hz rule)
19. **No extra WebGL context**: the pictures come from the preview's own renderer, one after another. Hearth sets the values without an undo step, waits for a frame, then takes a small JPEG (≤ 220 px) the preview makes itself. A set takes about a second on a real GPU (3.7 s here on a software GPU, including the first load).
20. **No flicker**: a still of the scene covers the preview while the pictures are made, then it's lifted.
21. **A frozen preview** thaws for the pictures and freezes again after.
22. **Closing frees everything**: the pictures, the cover, the key handler, the peek (the scene goes back to what you picked). A set still being made stops there.
23. **A newer set wins**: clicking New ones or a lock mid-set stops the old one cleanly (no stray cover).

## Ways in
24. **✦ More › ✨ Look & motion › 🎲 Variations** (first row; the Lab audit lists it).
25. **The Lab toolbar's ⋯ › 🎲 Variations**.
26. **◎ mission "Quick variations (free)"** in the Lab director's chat: your words steer it. "warmer" / "cooler" turn the colors toward orange / teal; "calmer" / "livelier" set the motion's direction in every take; "another angle", "more glow", "new colors" pick the groups the takes lean on. Nothing is sent to the AI.
27. **⌘/Ctrl+K "Lab: Variations of this scene"**.
28. **For the AI**: `/variations [words] | use N | more [N] | again | undo | lock|unlock <group> | close | status`, and a line in the app map's lab topic.

## Edits outside the new files (small, additive)
- `tools/three-easy.js`: the ✦ More row, the toolbar ⋯ row, the mission and a lazy loader (`LabEasy.variations`).
- `tools/three-tweaks.js`: `setMany(byKey, { remember: false })` lets a passing preview set values without an undo step. The default is unchanged.
- `lazy-data.js` (the group + the regenerated manifest), `index.html` (the `labvar` name on the existing lazy-at.js tag), `mcp/hearth-map.js` (one lab-topic line), `dev/run-checks.js` (the check in `lab:`, the unit test in UNIT).

## Tests
- `node dev/labvariations-test.js` (unit group), 12 tests. They cover the grouping (the grade counts as look) and what's left out (setup-only, keyframed). They check 6 distinct takes leaning colors / motion / camera / look / mix, values in range (whole numbers whole, colors hex), colors turning clearly, motion by a factor, the same seed giving the same set, locks holding, everything locked giving none, "More like this" staying closer than a fresh set, words steering it ("calmer colors", "warmer"), and the palette turning with greys kept.
- `dev/checks/labvariations.js` (lab group, `--fake-engines`) runs on a 2D probe scene with color, speed, camera-distance and glow sliders. **19 steps, all pass.** It covers the ways in (✦ More first row, the audit, toolbar ⋯, the mission for the Lab director only), the lazy load on first use, and the grid (6 pictures, 4 locks). The takes differ: 6 value sets, 6 different pictures. After the pictures are made, the scene is back as it was, and there are no new canvases or iframes. It also checks the hover peek, the click (values land, palette turns, tile ✓), and ONE step: the sliders' own ↶ once restores every value. Then Variations' ↶ restores values and palette even after an outside slider undo. 🔒 Colors holds, then Colors + Motion, and More like this stays close. Closing frees the card, pictures, cover and keys, and undoes the peek. The mission with "calmer, another angle" gives motion / camera takes with the speed down. `sh dev/run-checks.sh lazy unit:boot-test labeasy`: all 3 pass. `node dev/director-mcp-test.js` passes (the app-map line).
- The screenshot of the card over a 1:1 scene was checked by eye: compact, the preview still visible beside it.

## Risks / not done
- Sliders the sketch reads only at setup (counts, seeds in most sketches) aren't varied, because changing them would rebuild the layer for each picture. Scenes whose look lives only in setup values get fewer meaningful takes.
- Grouping is by name. A slider with an unusual name lands in "look".
- The pictures are a single instant. Motion takes ("Livelier") show their effect best by hovering, which plays them live.
- The sliders' own ↶ restores values but not the palette. Variations' ↶ does both.
- Tested on SwiftShader with a 2D probe scene; real WebGL scenes on the owner's GPU weren't seen.

## For the patch notes
- New: **🎲 Variations**. Six takes on your Lab scene, side by side, made on your computer with 0 tokens.
- Each take leans on one thing: new colors, livelier or calmer, another camera angle, a new look, or a bit of everything. It uses your scene's own sliders, grade and palette.
- Click one to use it, as one step: ↶ Undo or the toast's Undo puts it all back. Hover one to see it play live in the preview.
- **More like this** makes a closer set around the one you picked. **Keep: Colors / Motion / Camera / Look** locks those so they don't change.
- Find it under right-click the preview › ✦ More › ✨ Look & motion › 🎲 Variations, or in the Lab toolbar's ⋯. Or pick the ◎ mission "Quick variations (free)" and type a few words like "warmer, calmer". Nothing goes to the AI.
- It's light: the pictures come from the preview itself, one by one, behind a still of your scene, and everything is freed when you close it.
- Caveat: values the scene only reads when it starts (like particle counts) aren't varied, and an oddly named slider may land in the wrong group.
