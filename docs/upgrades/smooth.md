# Smooth (round 5): the music timeline's smoothness everywhere else

Same rules that fixed the Lab timeline: nothing moves every frame from JS (compositor animations), no DOM write that
doesn't change anything, no backdrop blur over moving content, work batched to one per frame. No new settings,
no new controls: everything looks and works as before, only cheaper. Nothing here needs a command.

**How it was measured.** New checks in `dev/checks/` drive each surface with real input and record, over a fixed
window: frames (rAF gaps), Long Animation Frames, DOM mutations (MutationObserver) and the harness trace (paints,
painted area, raster / style / layout time and laid-out objects). "Before" is the commit this round started from
(`5eacc2f`), run with the same check; "after" is this branch. All numbers come from Xvfb + SwiftShader in a 4-CPU
container, so frame rates are noisy and low: trust the work counts (mutations, paints, layouts, ms), and compare
rows, not absolute fps. The node editor is measured with software compositing (`SMOKE_GPU_FLAGS="--disable-gpu
--disable-gpu-compositing"`), where SwiftShader's GPU compositing wasn't the bottleneck.

    node dev/smoke.js --lib dev/checks/smooth-lib.js --script dev/checks/smooth-video.js
    node dev/smoke.js --fake-engines --lib dev/checks/smooth-lib.js --script dev/checks/smooth-chat.js
    node dev/smoke.js --fake-engines --lib dev/checks/smooth-lib.js --script dev/checks/smooth-lab.js
    SMOKE_GPU_FLAGS="--disable-gpu --disable-gpu-compositing" node dev/smoke.js --lib dev/checks/smooth-lib.js --script dev/checks/smooth-nodes.js
    node dev/smoke.js --fake-engines --lib dev/checks/smooth-lib.js --script dev/checks/smooth-app.js

(add `--check-timeout 400000`; `--eval "window.SMOOTH_DEBUG=1"` also lists the busiest mutations / layers / scripts)

## Video Review
1. The playhead glides on the compositor while a video plays: one linear animation to the end of the clip, restarted
   only on a seek, a loop jump, a speed or size change (it was `left: x%` written every frame). Playing: DOM
   mutations 84 → 28 /s, area repainted 2.64 → 0.16 Gpx per 3 s (−94 %).
2. The time readout is its own layer and its own layout boundary (it changes every frame while playing): the player
   around it no longer repaints with it (that's most of the painted-area drop above).
3. Scrubbing seeks once per frame however fast the pointer moves (each seek starts a decode): mutations 133 → 98 /s,
   painted area 2.18 → 0.86 Gpx, paint 53 → 21 ms per 1.5 s drag.
4. Dragging a loop on the ruler redraws the timeline once per frame, no longer rebuilds every note marker per pointer
   move, and doesn't reallocate the canvas each time: paints 162 → 83, layouts 81 → 41 (1258 → 658 objects), style
   recalcs 122 → 42, mutations 146 → 52 /s.
5. Compare while playing (wipe / onion): mutations 94 → 31 /s (wipe), 83 → 34 /s (onion); painted area 2.6 → 0.15 Gpx
   (wipe), 2.36 → 0.21 Gpx (onion).
6. Library hover-scrub thumbnails: the gold progress line moves by transform and the picture is only swapped when the
   frame changes: layouts 62 → 1 (992 → 16 objects) per sweep, mutations 76 → 39 /s. The timeline's hover preview
   moves by transform too.
7. A loop that ends at the clip's end keeps looping when a frame comes late (it could stop at the end: the per-frame
   check missed the last frame and the video ended). Found by the measuring run itself.
8. The scopes panel (over the playing video) no longer blurs what's behind it.

## Chats
9. Auto-scroll follows a streaming reply only while you're at the bottom; your own scrolling (wheel, keys, the
   scrollbar, touch) decides: up stops it, back to the bottom starts it again. Before, a small scroll up (within
   80 px of the bottom) got pulled back down at the next paint (measured: scrolled to 400 px, pulled to 582 px a
   second later; now it stays at 286 px where it was left).
10. Streaming: the live reply writes only what changed (thinking text, its label, the "Writing · 12 s" line, tool
    step), scrolls once per frame after the paint instead of forcing a layout per paint: mutations 105 → 58 /s, Long
    Animation Frames 20 → 4, style 50 → 11 ms, painted area 233 → 101 Mpx per 2.5 s; frames 16 → 36 fps.
11. Long chats (320 messages, every 5th reply long enough to fold): replies are measured first and folded after, in
    one pass (folding between measurements laid the whole chat out again per folded reply): switching chats 4× there
    and back: layouts 179 → 44, layout 313 → 183 ms, style recalcs 222 → 78, LoAF blocking 907 → 702 ms; opening
    the long chat 353 → 275 ms.
12. Finished replies' Markdown is cached (the same text renders the same HTML), so going back to a long chat doesn't
    re-parse hundreds of replies.
13. Switching chats replays the `.chat-enter` slide without forcing a layout of the chat you're leaving.
14. The chat list is a layout boundary (`contain: strict`; it's sized by its panel, never by its messages): a reply
    streaming in the docked director chat beside a playing Lab: paints 318 → 216, painted area 1.26 → 0.74 Gpx,
    mutations 126 → 77 /s, laid-out objects 1652 → 1435 per 2.5 s.
15. Scrolling a long chat: no attribute rewrites per scroll event (the selection bar and the ↓ button were set on
    every event): mutations 5 → 0 /s while wheeling, painted area 355 → 93 Mpx.
16. The ↓ jump button, the pinned strip and the in-chat find bar no longer blur the messages scrolling under them.

## Node editor (120 nodes, 160 wires, all flowing)
17. Wires are patched in place: dragging a node rewrites only its own wires (all of them were rebuilt every frame):
    node drag 16 → 48 fps, style 1381 → 45 ms, laid-out objects 32022 → 332, raster 9264 → 940 ms, LoAF 39 → 5.
18. No blur behind every node (each node re-blurred the flowing wires under it every frame), nor behind the HUD
    buttons and the minimap.
19. The flowing dots of live wires are on their own layer (their animation no longer repaints every glowing wire
    under them) and hold still while you pan, zoom or drag; they flow on as soon as you let go.
20. The dotted grid slides by transform while you pan (it was the editor's background, re-rastered over the whole
    view every frame) and the view is applied once per frame: pan 17 → 29 fps, paints 24230 → 973, raster 5052 →
    528 ms, LoAF 37 → 5; zoom 14 → 29 fps, raster 13388 → 5107 ms, style 982 → 292 ms, LoAF blocking 1723 → 174 ms.
21. Live values on node sockets (Lab nodes) are written only when they change.
    Idle with every wire flowing stays about the same (the dots' own animation is the cost: ≈20 fps here on
    software rendering; a real GPU rasters it easily).

## Three.js Lab
22. Slider moves reach the sandbox once per frame (only the latest value per slider; any other message sends them
    first, so the order is kept): with two input events per frame, tweak messages 121 → 61 per 1.5 s drag; the
    sketch's onChange no longer runs for values nobody sees.
23. The sliders panel repaints only what changed while you drag (save / reset / undo buttons, the status line, the
    group counters were rewritten on every move): mutations 479 → 60 /s during a drag.
24. The FX picker's live thumbnails render one at a time on one reused renderer, with frames between (six shader
    compiles in one go, on a new WebGL context each time, froze the preview): the preview's longest frame while the
    picker loads 1283 → 700 ms and it drew 3 → 17 frames in those 2.5 s (SwiftShader; much shorter on a GPU).
25. The Present hint / info line no longer blur the live picture, nor the scene tag and the scene-editor panel.
26. The meter pill writes only what changed (it rewrote its title and fill every tick, ~8×/s, beside the playing Lab):
    pill attribute writes 14 → 2 per 1.5 s of streaming.
27. The meter pill's live dot turns its rainbow with a transform on the compositor (it animated the gradient angle:
    a restyle and repaint on the main thread every frame of a reply, the same thread as the Lab preview).

## App-wide
28. Forgeheart: the chat list's hover nudge and the palette's selection nudge move the text with a transform
    (animating padding laid the list out every frame of the transition).
29. Rainbow loops that never moved are off: the rail, the ask-all bar, the streaming reply edge, the palette card and
    the focused composer's underline animated an angle that their rainbow (worked out once on the page root) never
    used, so they only restyled themselves every frame, at idle too whenever the composer had the cursor
    (Forgeheart 2 idle: style work 29 → 5 ms per 2.5 s; they look exactly the same). Same for the Swirl skin's
    swirls and the meter strip in Forgeheart 2.
30. Measured, already fine, unchanged: idle in a chat (0 frames of work, 0 mutations), menus, the palette, dialogs,
    toasts and tooltips (transform / opacity animations, 0–4 layouts each for the insertion only).

## For the next person measuring
31. `dev/checks/smooth-lib.js` (M.measure / M.brief) plus the five `smooth-*.js` checks above; `dev/smoke.js` trace
    results now also give layout / style counts and laid-out objects, and count painted area within the screen
    (an "infinite" layer clip made the totals meaningless).

Not changed, worth knowing: entering Present still costs one long preview frame while the canvas resizes to full
screen (≈0.9 s on SwiftShader, before and after); the Forgeheart header glint is a transform / opacity loop that
still ticks at idle (≈2 ms/s here).
