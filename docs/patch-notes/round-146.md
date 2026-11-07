# Round 146: which layer costs the frames?
*November 2026*

## ▦ The cost of each layer, on its row
- When a scene is slow, the small **"Slow: 21 fps · Why? · ▦ · ✕"** chip under the picture now has a **▦** button.
  Click it: Hearth measures your scene for a few seconds on your computer (no AI, no tokens) and shows **what each
  layer costs** right on its row in **Layers & knobs**: a little bar and "12 ms". The heaviest one glows ember.
- You can also turn it on from the ⚡ card (**⋯ › This Lab › ⚡ Speed check**, or **Why?**): the **▦ Cost on layers**
  button at the bottom. Click it again to hide the badges.
- The badges show only while you have it on, and they don't measure anything while the scene plays, so playback stays
  as smooth as before. Click a badge to jump to that layer in the ⚡ card.

## ⚡ One click to lighten a heavy layer
- The ⚡ card now lists **Each layer's cost, heaviest first**, with its share of each frame.
- Next to a heavy layer:
  - **Fewer**: halves its count slider (particles, instances, stars…), when it has one.
  - **½ res**: draws only that layer at half resolution in the preview.
  - **No shadows**: turns that layer's shadows off in the preview.
  - **Hide**: hides the layer (as its eye would).
- **½ res** and **No shadows** are for the preview only: your renders and exports keep full quality.
- After each click the card measures again and shows the layer's cost before → after (for example "✓ Fewer · 40 → 12 ms").
- Each one is a single undo: the ↶ beside it, the toast's **Undo**, or **Ctrl+Z** (⌘Z) in the Lab.
