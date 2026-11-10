# Round 170 · switch170: a newly shown chat costs less to draw; Esc closes AI setup again

Two parts: a11y's "AI setup: Esc did not close it" (failing since before round 168), and paint167's remaining big
cost, switching to a chat or a project. The Lab, Scenes v2, the Lab's CSS and Codex's files were not touched.

Measured on this box as rounds 167–169: 4 shared CPUs, software GL (SwiftShader: every frame redraws the whole window),
Xvfb 1480 × 940; 3 projects × 2 chats of 200 turns (code blocks, lists, links). GPU = the graphics process' CPU,
main thread = the window's main-thread task ms (`Performance.getMetrics` TaskDuration).

## 1. Esc in AI setup

**Root cause.** Not a focus trap, a lazy-group move or an `inert` change: the Lab. Its ★ Favourites and 🎛 Dials cards
(the two folded sections at the top of the Layers & knobs panel since round 142, `tools/three-favs.js` /
`tools/three-dials.js`) add a window keydown listener in the capture phase while open, and on Esc they call
`stopPropagation()` and close themselves. They don't look at whether the Lab is on screen. a11y's Lab part opens every
fold in the Lab (those two sections too), then goes back to the chat: from then on every Esc anywhere was taken at the
window by the hidden cards, never reached the AI setup drawer (its Esc handler sits on the drawer, options.js) and
folded a section nobody could see. Found by recording each `stopPropagation()` on that Esc (stacks:
`three-favs.js:179 esc`, `three-dials.js:117 esc`). Settings, missions and Find anything still closed because a
`<dialog>`'s Esc is its default action and the others listen on the window too; the drawer was the one that listens
below the window. The same happens to the owner: open ★ or 🎛 in the Lab, go to a chat, and Esc does nothing in AI setup.

**Fix (app side, a11y.js; no Lab file edited):**

- *Esc goes to what's on screen.* When the Lab is hidden (`hearth:activate` / `hearth:view`), its open ★ / 🎛 sections
  are folded (`details.open = false`: the Lab's own toggle closes the card and drops its listener); when the Lab is
  shown again they open again, so its panel looks the same. Only the sections' `open` is touched. (The hidden cards'
  300 ms timers stop too.)
- *AI setup takes its own Esc first:* a window capture listener registered at start (before any card's) closes the
  drawer when the focus is in it (not in a text box, not the page version: the drawer's own rule), so with the Lab on
  screen behind a docked chat, Esc closes the drawer only, not the drawer and a card under it. Checked by hand both
  ways (docked chat in the Lab with both sections open: the drawer closed, the sections stayed open; Lab hidden: the
  sections folded, back in the Lab: open again).

**For the Lab's owner:** the clean fix is in the two cards' `esc`: return when the card isn't on screen
(`!S.pop.checkVisibility()`), as `three-abcompare.js` already does on `hearth:activate`.

## 2. What a chat switch cost

Per switch (this round's check, round 169's way vs this one in the same run, and a copy of round 169 vs this branch):

- **Nearly all of it was the chat's entrance, not drawing the new chat.** `polish.css .chat-enter` (the list fades in
  and slides up 10 px for 240 ms): on software GL every frame of it redraws the window. With the entrance turned off
  (diagnostic only) a switch between two kept chats cost 132 ms instead of 881.
- **Rastering a new chat was small.** A chat kept from before (round 45's parked lists) vs one drawn afresh: ≈ 70 ms GPU
  and ≈ 30 ms main thread apart; project switches through chats that were all kept cost the same as through new ones.
  Keeping more chats (or their raster) would not help, so nothing was kept longer: memory unchanged.
- **The fade drew the whole list offscreen every frame.** A list that fades is a group of layers (its box, its scrolled
  content, its scrollbar) with an opacity: drawn into an offscreen picture, then blended in. Transform-only frames cost
  the same as a solid cover's (−140 ms a switch), so that part was the offscreen pass.
- **Forgeheart: the window's layer under the chat was rasterised again twice a switch.** The entrance gave the list a
  layer for 240 ms and took it away: the list's box moved from the window's own layer to its own and back, and each
  time the window's layer under the chat was rasterised again. In the plain looks that is a flat colour; in Forgeheart a
  full-window picture of gradients and grain: a trace shows the first frame of a switch and the frame after the
  entrance at 150–190 ms each (others ≈ 20–35). Confirmed by giving the list a lasting layer: Forgeheart switches −36 %.
- Not the cause: code-block highlighting or pictures (nothing decoded in the switch), shadows / blur on cards, the
  caret (switches with the caret hidden cost the same).
- A project switch also painted the projects bar and the chats list in two frames, 40 ms apart.

## The fixes (no visible change)

1. **The fade is a cover** (native.js `enterAnim`, polish.css `.chat-cover`, `hx-chat-move`, `hx-chat-cover`): over a
   solid colour (the list's `--solid-back`: the plain looks and Forgeheart's ground base) a cover of that colour goes
   from opaque to clear over the list while the list only slides. α·list + (1−α)·ground either way. The cover is clear
   by itself (opacity 0), so where animations are off (`/motion off`, Lite, reduced motion in Forgeheart) it never
   shows; none is made with `/motion off` or Lite. It goes with the list's own animation end, and when the list is
   parked mid-entrance. Anything not over a solid colour fades as before.
2. **The chat on screen keeps its layer** (chatcore.css: `.messages.solid-back:not(.parked)` gets
   `will-change: transform`, not with `/motion off`): an opaque box already on a layer moves nothing when its entrance
   starts or ends. A still frame costs the same (plain 45 vs 45 ms, Forgeheart 50 vs 50), as do wheeling and typing
   (measured: 16 wheel steps 1,620 vs 1,630 ms plain, 1,300 vs 1,330 Forgeheart; typing within 5 %).
3. **A new chat's list starts with the solid colour of the list it replaces** (native.js `usePane`: same wrap, same
   ground; judged again at the next frame), and **a parked list is judged without the list on screen counting as
   "something drawn under it"** (`backdropOf`): a kept chat came back without its solid colour and took it a frame
   later, mid-entrance (its content drawn again on a new layer).
4. **The projects bar is painted with the list's own draw** (projchats.js `setScope`: with `Panel.soon`'s render, a
   400 ms fallback): one frame instead of two.

## Before / after

A copy of round 169 (a5099db8) vs this branch, the same script (`dev/smoke.js --app`), two runs each, 3 rounds a run;
per switch, GPU / main thread:

| Switch | Round 169 | Round 170 |
|---|---:|---:|
| Plain, between two kept chats | 905 / 31 ms | **722 / 31 ms** (−20 %) |
| Plain, project switches through 6 chats | 988 / 64 ms | **786 / 62 ms** (−20 %) |
| Forgeheart, between two kept chats | 1,670 / 39 ms | **913 / 36 ms** (−45 %) |
| Forgeheart, project switches through 6 chats | 2,500 / 77 ms | **1,560 / 71 ms** (−38 %) |
| Window / GPU-process private memory after them | 115 / 115 MB | 114 / 109 MB |

The check's own in-run comparison (round 169's entrance and no kept layer put back with a style; the projects bar not
part of it), final run: plain kept 663 → 544 ms (0.82), plain projects 953 → 805 (0.84), Forgeheart kept
1,144 → 669 (0.58), Forgeheart projects 2,168 → 1,372 (0.63); all 0.69. Main thread within noise (a traced run of 4
kept switches: 114 vs 122 ms; the untraced plain kept number moved 17 → 30 ms in some runs and not in others).

## Pixels

Mid-entrance (both animations paused at 30, 100, 170 ms) and after it, this way vs round 169's: plain ≤ 2 levels of 255
(the scrollbar counted apart: the old way drew it inside the fading group); after the entrance identical (0 pixels).
Forgeheart ≤ 1 level at 100 and 170 ms, ≤ 4 at 30 ms in a 1–2 px line at the chat's top edge (the 10 px gap the slide
opens shows the ground's gradient, a few levels from the base colour the cover has), identical after.

## Check

`dev/checks/switch170.js` (`node dev/run-checks.js --exact switch170`; group `switch170`): the chat on screen is a
layer of its own (plain, Forgeheart); during an entrance a cover of the list's colour over exactly its box, the list
animates transform only, nothing left after it (also when switching again mid-entrance), none with `/motion off` or
Lite; pixels as above (≤ 3 levels; Forgeheart mid-entrance ≤ 6); a still frame ≤ 110 % of the old way; all switches
≤ 85 % of the old way's GPU-process CPU (each kind fails only > 105 %); memory reported (fails when the window holds
> 10 MB more). `window.S170_REPORT = 1` reports without failing; `window.S170_SHOTS = '<dir>'` keeps the pictures.

forge168's layer step took a tree with only the list's new will-change layer for a whole one (its "partial snapshot"
retry looked for any `div.messages` layer); it now waits for the list's scroller.

RUNS

## For Codex

No Codex-owned file was edited; nothing in them builds the chat list or its entrance.

## Next candidates

1. The rest of a switch is the entrance's frames themselves (≈ 8 full-window frames on software GL); only a shorter or
   no entrance would cut them, a visible change.
2. The same cover trick fits the surface entrance (`.surface.active` hx-scene: chat ↔ board, tools), where the surface
   is see-through over the ground: a cover there needs the ground's picture, not one colour.
3. The Lab's ★ / 🎛 cards: the guard above belongs in their own Esc handlers.
