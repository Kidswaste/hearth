# labcalm (round 48): a calmer Lab screen

Rounds 40–46 added a lot to the Lab (camera moves, recipes, batch, variations, A/B, search, groups, solo, kinetic
type, direct handles, keyframe diamonds and cards, doze, the director dock…). menucalm (round 43) calmed its menus;
this pass calms the screen itself. I took screenshots of the Lab in its five common states (a fresh Lab, a scene with
three layers, a song with its timeline, the director docked, a 🧊 model picked on the picture) at 1280×800 and
2560×1440, with the pointer away from the Lab, counted every control in sight, looked for things over the picture,
tips that stay, duplicates and crowded rows, and folded what you rarely touch one step deeper. **Nothing was
removed**: every folded control is one point or one click away, and Lab search (🔎 or /) finds it.

## Audit: what the Lab shows, before → after
Counted by `dev/checks/labcalm.js` (new): visible buttons, selects, inputs, summaries, links, sliders (the way
simplify2 / chatcalm count), pointer away from the Lab. "Before" is the same reading on the base commit (ea03b29).

| State | 1280×800 before → after | 2560×1440 before → after |
|---|---|---|
| A fresh Lab (Basic scene) | 47 → 46 | 64 → 62 |
| A scene with 3 layers (16:9) | 49 → 46 | 59 → 56 |
| A song with its timeline | **68 → 59** | **80 → 69** |
| The director docked | 48 → 48 | **87 → 76** |
| A 🧊 model picked | 48 → 48 | (its 85 sliders show) |

| Part | Before | After | What changed |
|---|---|---|---|
| The picture's pill (at rest) | 10 | **6** | ❚❚ Freeze + Fit 9:16 16:9 4:5 1:1; More…, Safe, 📷, ⋯ show while you point at the picture |
| A layer's settings (with a song) | 14 + a hint | **8** | start / here / end / here / fades / Animate ▾ in one fold, "When it plays · whole song" |
| The timeline | 22 | 21 | 🎬 waits in the timeline's ⋯ (it's also in the picture's right-click) |
| Toolbar rows, director docked at 1280 | **2** | **1** | the View buttons show their icons only when the Lab is narrow |
| The pill over an exact frame (song, director, model at 1280) | covered the frame's top (titles, the ✥ 3D chip) | **0 px** | the frame sits below the pill when it would reach under it |
| Opaque things over the middle of the picture | 0 | 0 | (only the title-safe outlines, which don't count) |
| Words that stay on the picture | "lighter to stay smooth · full quality in renders" for as long as it was lighter | 6 s, then a small ◐ (once in 10 min) | |
| Words that stay on the timeline | "A: all curves" whenever a layer has a lane | none | A is in a track's ▾ menu and the keys sheet |
| The pick tip | 4 lines, 7 s | 1 line, 5 s (How for the rest) | |

Duplicates and names found:
- **▤ twice** under the picture: Full timeline (▤) beside ▤ Sequence. Full timeline is now **▥** (with ▭ compact
  and ▁ strip).
- **Console was the only View button without an icon**: now ›_ Console, like ⚡ Sliders, </> Code, ✥ Edit, ▣ Present.
- 🎬 Make a music video was on the timeline *and* in the picture's right-click › ⇪ Make & export: the timeline one
  waits in ⋯.
- "120 BPM" beside Tap and the grid's tempo field show the same number: kept on purpose (the one by Tap is the live
  readout that blinks on the beat; the grid's is the field you type in).
- Kept as they are (you use them: Tap 58, Save 46, Shuffle 31, Live 30, Freeze 16, the frame sizes…): the toolbar,
  Save / Shuffle, Tap / Kick / Snare / Hit, Live / Triggers / Presets / Auto bars, the grid row.

Screenshots looked at before and after (all five states, both sizes).

## Upgrades

### The picture
1. **The frame-size pill is calmer**: at rest it shows ❚❚ Freeze and your five sizes (10 → 6 controls).
2. **More…, Safe, 📷 still and ⋯ come while you point at the picture** (or tab into it), on a second row under the
   sizes, so the size you aim for never moves under the pointer.
3. **An exact frame (9:16, 16:9, 4:5…) sits clear of the pill**: when the picture would reach under it, the frame
   moves down by the pill's height and fits the rest. The top of your frame (titles, captions, a picked layer's
   handles and ✥ 3D) is never covered. Only the picture on screen moves: renders and stills are the same pixels.
   Presenting and full screen keep the whole room.
4. **"lighter to stay smooth" says it for 6 seconds, then becomes a small ◐** in the corner (its tooltip keeps the
   words); a preview that goes lighter and back often only shows the ◐ (the words at most once in 10 minutes).
5. **The pick tip is one line**: "Picked: drag to move · corners scale · ◯ turns · double-click: its sliders" (How
   has the rest), 5 s instead of 7.

### The toolbar
6. **One row with the director docked**: a narrow Lab shows the View buttons as icons (⚡ </> ›_ ✥ ▣); their
   tooltips and names for screen readers stay. At 1280 with the director docked the toolbar was two rows.
7. **›_ Console** has an icon like the others (and its count of new errors still shows: the icon turns red).

### Layers
8. **"When it plays" folds**: a layer's start / end (and their "here"), Whole song / Loop only, fade in / out and
   Animate ▾ are one row that says where it stands ("whole song", "0:02.000 → 0:08.000", "load a song to time it");
   one click opens it, and it stays open if you leave it open.
9. **A layer's right-click › More… › ⏱ When it plays…** opens that fold (and Lab search finds it by "when it plays"
   or "fade in").
10. The "Load a song to time layers" and "over this layer's time (or the loop)" hints no longer stand under every
    layer: they are inside the fold.

### The timeline
11. **Full timeline is ▥**, not the ▤ of ▤ Sequence beside it.
12. **🎬 Make a music video waits in the timeline's ⋯** (every timeline control); right-click the picture › ⇪ Make &
    export › 🎬 A music video from this song has it too.
13. **No standing "A: all curves"** at the top of the lanes' headers: A still shows every curve (a track's ▾ menu says
    so, and the keys sheet).

**13 upgrades.**

## How it's built
- `tools/three-media.js`: `place(W, H, s)` in `stage()` puts an exact frame (and `stage.rect`, which overlays read)
  clear of the pill when its top would be under it (`PILL_ROOM` 44 px, `PILL_W` 340 px; not while presenting);
  `videoBtn` gets `.mb-adv`; the size icon; no gutter text.
- `tools/three.js`: `LabCalmBar` (icon span + label span, aria-label) on the View group; `syncConsole` writes into the
  label span; `paintAdapt` folds the note (`.quiet`) after 6 s, words at most once in 10 minutes.
- `tools/three-layers.js`: the `.ly-plays` fold (`three.layerPlays` remembers it open).
- `tools/three-easy.js`: ⏱ When it plays… in a layer's More… (`openPlays()`).
- `tools/three-direct.js`: the shorter tip.
- `tools/three-lab.css` (end): the pill at rest / pointing, the ◐, icon-only View buttons under 640 px, the fold.

## Edits outside my lane (small)
`dev/checks/autoedit.js` (🎬 is checked with the timeline's ⋯ on: same strength, new place), `dev/run-checks.js`
(labcalm in `lab:` and its own `labcalm` group).

## Tests
- `dev/checks/labcalm.js` (new; in the `lab` group and its own `labcalm` group): the five states at 2560×1440 and
  1280×800 with the pointer away; budgets of controls in sight per state at 1280 (46 / 46 / 60 / 48 / 50) and per part
  (toolbar ≤ 10, pill ≤ 6, layers ≤ 9); nothing opaque over the middle half of the picture; the pill clear of an exact
  frame; one toolbar row with the director docked at 1280; one name + icon per View button; the timing fold with its
  state and its controls inside; 🎬 folded; Full timeline's icon not ▤; the lighter note folding to ◐; pointing at the
  pill shows its extras without moving the sizes; Lab search finds safe zones, more frame sizes, still, when it plays,
  fade in, music video, animate. After: PASS.
- Targeted runs: see the final report.

## Risks
- The frame moving down under the pill shrinks the on-screen picture a little when the preview is short (at 1280 with
  a song, a 16:9 frame ≈ 14 % smaller on screen). Renders are unchanged. A check that compares the frame's on-screen
  position with a hard-coded centre would see it move; `stage.rect` follows.
- The pill's extras show on hover / focus only: a check that looks for Safe / 📷 / More… *visible* at rest would not
  find them (the existing ones click them programmatically or find them by selector).
- Icon-only View buttons depend on the Lab's container width (`.tabpane` container, ≤ 640 px).

## For the patch notes
- The Lab is calmer: at rest the picture's pill shows Freeze and your five frame sizes; More…, Safe zones, Still and
  ⋯ appear when you point at the picture.
- A 9:16 or 16:9 frame no longer sits under that pill: the top of your picture (titles, captions, a picked layer's
  handles) stays in view. Renders are unchanged.
- With the director docked, the Lab toolbar stays on one row (its view buttons show as icons when the Lab is narrow);
  Console got an icon, ›_.
- A layer's timing (start, end, fades, Animate) is one folded row, "When it plays · whole song"; right-click a layer ›
  More… › When it plays… opens it.
- "lighter to stay smooth" shows for a few seconds, then shrinks to a small ◐ in the corner.
- The timeline: Full timeline has its own icon (▥, not the ▤ of Sequence), 🎬 music video waits in its ⋯ (the
  picture's right-click has it too), and the standing "A: all curves" note is gone (A still works).
- Nothing was removed: Lab search (🔎) and Ctrl/⌘+K find everything that moved.
