# smooth32 (round 32): smoothness and weight after rounds 26–31

You asked for "a smooth 240 Hz at all times" and a light app. Rounds 26–31 added ⋯ AI setup, ◎ Missions, resizable
grid chats, Chrome views, the pinboard, Activity, recall, budget, quickstart cards and patch notes. This pass measured
the everyday stretches around them, found what cost frames or styled the page for nothing, and fixed each with a small
edit. Nothing looks or behaves differently.

## How it was measured
- `dev/checks/smooth32.js` (new, in the `smooth` group): real input events (CDP) under a timeline trace
  (dev/trace-stats.js), in the Forgeheart look, with a docked Three Director and a busy Lab scene loaded:
  typing 72 keys in a 300-message chat · a long streamed reply in that chat (fake engine) · ⋯ AI setup ×5 ·
  switching chats from the chats list ×6 · the grid view (4 chats) with a column gap dragged · the Lab on screen while
  its docked director chat streams · the Lab playing the chat's own scene (keyframed orb) for 3 s. Plus DOM mutations
  per streamed reply and per second of Lab playback.
- Small probes for single causes (stack of whoever wrote the Lab's keyframe buttons, the Chrome view's loading sweep
  painting alone).
- Before = this branch's starting commit (bc55ffe) from a copy, run interleaved with the after runs on the same
  machine: 3 before / 3 after (4 CPUs, software GL, 60 Hz Xvfb; timings move ±20–30 % between runs, the counts —
  elements styled, forced layouts, mutations — are the reliable numbers). Ranges below are min–max of the runs.

## Numbers (before → after)

| What | Before | After |
|---|---|---|
| **Dragging a gap in the grid view** (4 chats, 40 moves): elements restyled · style time | 66,563–67,304 el · 1,832–2,123 ms | **7,556–9,236 el · 210–305 ms (−89 %)** |
| Same drag: layout objects | 4,173–4,181 | 2,282–2,328 |
| **The Lab playing the chat's scene** (keyframed orb, 3 s): DOM changes per second | 493–1,080 /s | **182–217 /s** (what's left: the 4 animated knobs moving) |
| Same: forced style / layout in scripts | 29–74 · 42–101 ms | **14–25 · 9–19 ms** |
| **The Lab on screen while its director chat streams** (14 s): forced style / layout | 330–391 · 386–421 ms | **91–167 · 129–142 ms (−65 %)** |
| Same: the keyframe timer's style reads (10×/s) | 150 ms style + 100 ms layout | **0** |
| A streamed reply in a long chat (14 s): forced style / layout | 113–141 · 28–50 ms | **39–46 · 15–18 ms** |
| Same: DOM changes (the Lab hidden behind the chat) | 574–585 | 520–526 (the hidden Lab's key hint no longer rewritten on every pointer move) |
| Typing 60 letters + 12 Backspaces: forced style / layout · layouts | 205–210 · 78–88 ms · 101–102 | **157–159 · 69–80 ms · 77** |
| The Chrome view's loading bar (2 s, alone) | 184 repaints · 234,637 kpx painted | **0 repaints** |
| Whole smooth32 run: style recalcs · elements · ms | 1,788–1,917 · 91.8k–94.0k el · 2,738–3,086 ms | **1,444–1,510 · 32.2k–33.2k el · 1,051–1,068 ms (−63 %)** |
| Whole run: forced style / layout in scripts | 1,048–1,105 · 755–821 ms | **602–648 · 443–465 ms (−43 %)** |
| Whole run: tasks over 50 ms · frame p95 | 29–45 · 52–79 ms | **5–10 · 26–33 ms** |
| ⋯ AI setup ×5 · switching chats ×6 · idle | unchanged within noise (see Not fixed) | |
| First-screen JS / CSS, startup | no change (no file moved; +≈2 KB of comments) | `lazy` + `boot-test` pass |

## Upgrades

### Resizing chats in the grid
1. **Dragging the gap between chats restyles one element, not the whole grid.** The sizes it writes on every frame
   were inherited custom properties, so each move restyled every message of every chat on screen (≈ 67k elements per
   drag here); they're now non-inherited (`@property`), so only the grid itself is restyled. `app.css`
2. The grid's saved sizes are written only when they change (every layout pass wrote them again). `grid-resize.js`

### The Lab while it plays (your main tool)
3. **The keyframe diamonds (◆ / ◇) and animated layer values are written only when they change.** A scene with
   keyframes (every new chat's orb) rewrote every diamond's text, class and tooltip 10 times a second while it played.
   `tools/three-tweaks.js`, `tools/three-layers.js`
4. **The keyframe timer no longer asks the page "is the preview on screen?" 10 times a second**; it uses what the
   preview's parking already knows (it still checks while a recording runs). That question styled the whole window
   each time, heavy while a chat streams beside the Lab. `tools/three.js`
5. **The timeline draws its canvases before writing the time**: the canvas text font needs the page's style, and the
   time written just before it (it changes on every draw while playing) made each draw style the page first. The beat
   light's flash restarts without asking the page for its animations (it styled the page on every beat).
   `tools/three-media.js`
6. The preview's frame sizer (Fit / 9:16 / …) reads the preview's size before writing anything and writes only what
   changed: on a resize of the window, the chats panel or the grid it no longer styles and lays out the page again.
   `tools/three-media.js`
7. The Lab's key hint (the little key badge on hover) is hidden only when it's showing: it was rewritten on every
   pointer move anywhere in the app, even with the Lab hidden. `tools/three.js`

### Chats
8. **Backspace in a message box at its smallest skips measuring it** (deleting can't make it taller): two layouts of
   the whole chat less per Backspace. `native.js`
9. The jank watch asks "is something animating?" right after the next frame instead of inside its long-frame report,
   where it styled the whole page first (a few ms each, up to once a second while a reply streamed). `jank.js`

### Chrome views
10. **The Chrome view's loading bar moves on the compositor**: it was a background-position animation that repainted
    the whole window every frame while a page loaded (234 Mpx in 2 s here); now 0 repaints, same look. `chromeview.css`

## For the next measurer (not counted)
- `dev/checks/smooth32.js` (`sh dev/run-checks.sh smooth32`, in the `smooth` group): the stretches above, per-stretch
  work, frames, forced style / layout with the JS line, mutations per streamed reply and per second of Lab playback.
- `dev/trace-stats.js` now takes the window's main thread from the check's `hz240:` marks: a heavy Lab scene on
  software GL could keep the preview's own renderer busier, and the numbers then described the wrong page.

## Not fixed (measured, left as is)
- ⋯ AI setup: its click runs ≈ 3 ms of script; the 60–90 ms per open here is the software rasterizer drawing the
  sheet (no blur or animation in it). The first open includes loading it (round 26 already preloads on pointing).
- Switching chats: 30–45 ms per switch here, mostly the style / layout / paint of the 40 messages drawn (already
  windowed, folded and content-visibility'd in earlier rounds); the script part is ≈ 9 ms.
- Typing: the remaining forced layout is the text box's own editing (inside the browser's keypress), not Hearth's code.
- The Lab's own "is the preview on screen" check after a switch (syncPark) and the stats line's visibility check still
  style the page when something else just changed it; that work would happen in the next frame anyway (moved, not
  doubled), so they were left.
- Weight: no eager script from rounds 26–31 was worth moving. ◎ Missions (36 KB) draws result cards in chats as they
  render and Smart routing (router.js, 15 KB) hooks every send, so both must be in before the first chat; everything
  else from those rounds (AI setup, activity, pinboard, recall, budget, quickstart, patch notes, Chrome views) already
  loads on first use.
- `labframes` fails now and then on both the starting commit and this branch (frame-exact stepping under load); it
  passed 4 of 6 runs here and 3 of 4 on the starting commit.

## Tested
`node --check` on every touched JS file; `sh dev/run-checks.sh lazy unit:boot-test grid-resize chromeview smooth-lab
orb labframes sequence-smooth perfectloop jankwatch smooth26 smooth32` (all pass; labframes flaky as noted above);
screenshots of the Lab with the docked director after the runs look as before.

## For the patch notes
- Resizing chats in the grid view is much lighter: dragging a gap now restyles one element instead of every message
  on screen (about 9× less styling work while you drag).
- The Lab runs lighter while a scene plays: the keyframe diamonds and animated values are only rewritten when they
  change, and the Lab no longer re-checks the whole window ten times a second.
- A chat streaming next to the Lab costs about two thirds less page work than before.
- The music timeline draws without making the page recalculate its styles on every frame and on every beat.
- The loading bar of Chrome views (Google sign-in pages and the like) no longer repaints the whole window while a page
  loads.
- Backspace in a message box is a bit cheaper, and the smoothness watch no longer adds work while replies stream.
- Nothing looks or works differently; it's the same app doing less behind the scenes.
