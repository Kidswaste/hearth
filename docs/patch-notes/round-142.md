# Round 142: render what you looped
*November 2026*

## ⟲ What to render
- The top of the Render card now says **What to render**: **♫ Full song · ⟲ Loop · ▤ Sequence · ✎ Custom**.
- With a loop on the timeline, it opens on **Loop** and says "Your loop: 0:32 – 0:48 (16 s, 8 bars)": the render is
  exactly the loop, frame for frame, with the sound cut to match. Seamless-loop formats use it too.
- **Full song** renders the whole song (before, with no loop and no preset, you only got 10 seconds from the
  playhead). **Sequence** is offered when the scene is in a Lab sequence. **Custom** takes a "from – to".
- Presets keep their own choice and show it (the vertical reel picks the drop; you can override it). Your choice is
  remembered for each project, and the check before rendering shows the range.

## ⚡ Layers & knobs in one panel
- The right column is now **one panel, Layers & knobs**, with one scroll. Click a layer's row: its knobs open right
  under it, and the one open before folds away. **▸ / ▾** opens or folds a layer in place.
- **📌** (shows when you hover a row) keeps a layer's knobs open while you pick others.
- **★ Favourites** and **🎛 Dials** are folded rows at the top of the panel instead of floating cards (in Perform ◉ they
  still float). **Layer settings** (opacity, blend, mask…) is one folded line above the knobs.
- Less lag: a chat reply that edits one layer now rebuilds only that layer's row, not all of them, and dragging a knob
  sends at most one update per frame to the preview.

## ▶ Smooth playback first
- The **Quality** chip under the preview now offers **Smooth (auto)** · **Balanced** · **Force high quality**.
- **Smooth (auto)** is the new default: while the scene plays, the preview drops resolution and shadow detail as far as
  it needs to stay fluid, and the timeline and readouts redraw less often. On our slow test machine that was about 2×
  the frame rate and frames 5× shorter.
- **Force high quality** never lowers anything, for when you need to judge the real look. **Balanced** is the old
  behaviour. Renders are always full quality whatever you pick.
