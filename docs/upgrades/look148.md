# Round 148c · look148: the Lab look → the owner's moodboard (instrument-panel HUD)

The owner sent a moodboard: a dense audio-visualiser HUD (near-black navy, electric-blue monochrome, numbered panels
with tiny mono small-caps headers and right-aligned meta, hairlines, dot grids, glowing readouts), a CRT/VHS node
graph, phosphor scopes and a light lavender "plates" sheet. "Keep it Forgeheart-themed but be creative."

## Before → after

| | Round 143 (Forgeheart) | Round 148 |
| --- | --- | --- |
| Palette | warm iron panels, ember → violet top rim | navy-black panels (`--fh-hud-panel`), electric blue (`--fh-hud`) as the main accent; ember kept as the one hot accent (playhead, selected layer, open fold, the top rim's tip, the heaviest-cost badge) |
| Panel chrome | scanlines + two corner glows | hairline 1 px frame, scanlines + a faint dot grid behind the content, corner tick marks (`::after`), square-ish corners; the room between panels (`.three-split`) gets the dot grid too |
| Headers | "LAYERS & KNOBS 5" | **01 PREVIEW** (new 14 px line above the picture) · **02 TIMELINE** (in the existing handle row) · **03 LAYERS & KNOBS** (CSS on the panel's own head) |
| Meta | — | preview: fps + 16-bar sparkline + quality; timeline: BPM · meter · beat meter · bar · time; layers: count "5 LYR" |
| Readouts | system font | mono stack (`--fh-hud-mono`), tabular / slashed-zero numbers, soft blue glow; the header number has a hair of CRT fringe |
| Accents | violet sliders / favourites | blue inside the Lab panels (`--ui-gold`, `--accent` scoped to the panels), AI rows a blue-violet |
| Motion | glint (9 s), playhead breathe | + header live dot (opacity 2.4 s) and header sweep (`transform` 7 s); all paused under `html.lab-playing`, none under reduced motion / Motion calm / off |
| Look menu | Forgeheart · Plain | **Forgeheart → Plate → Plain** (one row, each click the next) |

**Plate** (`html[data-lablook="plate"]`): the panels get a light variable set (the app's own `--bg / --text / --line /
--fh-iron-*` scoped to `.three-split`, `.three-toolbar`, `.rg-tray`), indigo HUD tokens, a fine square grid, "PL.01"
numbering; the preview and the song's lanes stay dark wells (the same vars reset there, as polish.css does for
Hearth's light looks).

**Plain** hides the headers (`display: none`, so the layout is round 143's exactly) and every texture / motion.

## Cost

- CSS mostly (`tools/three-regroup.css`); the headers are made once by `LabRegroup.apply` (`tools/three-regroup.js`,
  lazy group `lab`, no new file; `node dev/lazy-manifest.js --check` clean).
- Preview meta: written from `paintStats` only when the stats line itself changed (≤ 2 / s), text nodes in place,
  sparkline bars by `transform: scaleY`.
- Timeline meta: a MutationObserver on the time / BPM texts, coalesced to ≤ 10 / s, **disconnected while it plays**
  (re-read once when play stops). `ThreeMedia`'s bar got a `meta` getter (bpm, meter, bar, beat, time) — values it
  already held, no new measuring.
- Nothing is drawn over the preview's picture: the 01 line sits above `.three-preview`, its frame is an `outline`.

## Files

- `tools/three-regroup.css` (the look), `tools/three-regroup.js` (headers, meta, three looks)
- `tools/three.js`: `apply` gets the preview and the timeline; `paintStats` hands the reading to the header
- `tools/three-media.js`: the `meta` getter
- `dev/checks/look148.js`: the check

## The check

`dev/checks/look148.js` (realscene-lib's scene): three numbered headers in order, mono / uppercase / tabular; the 01
line above the preview and nothing of the look inside it; the preview's meta matches the stats line and follows a new
reading; the timeline's meta follows a seek (bar 006 at 0:10 for 124 BPM) and the beat meter matches; the live dot and
sweep run stopped, pause while playing (and the header is not rewritten while playing), catch up after; off under
reduced motion and Motion calm / off; the look row cycles Forgeheart → Plate → Plain → Forgeheart. Pictures:
`look148.png`, `look148-plate.png`.
