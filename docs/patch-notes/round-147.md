# Round 147: a scene that crashes never locks you out
*November 2026*

## 🛟 Safe open
- If a heavy scene makes the Lab preview crash or freeze, Hearth notices by itself: the graphics card dropping the
  picture, the preview's page dying or running out of memory, or the preview not answering at all for a while.
- The **first time**, Hearth simply brings the picture back, as before (nothing to click).
- If the **same scene crashes again**, or it **crashed the last time you opened it** (even if Hearth itself closed),
  it opens in **Safe open** instead: the preview is at its lightest (low resolution, 1× pixels, no shadows) and every
  layer is held back, so you can always get in.
- A small note at the top of the picture says so, for example:
  **"vizualizer2 crashed last time · opened safely · [Bring layers back one by one] [Open normally]"**.
  - **Bring layers back one by one**: each click turns one more layer back on, the lightest first and the one Hearth
    suspects last. The cost of each layer shows on its row in **Layers & knobs**, so the heavy one stands out. If a
    layer crashes the preview again when it comes back, Hearth keeps it off and names it on the note.
  - **Open normally**: everything back at full quality, exactly as your scene is saved.
  - **–** folds the note into a small "🛟 Safe open · 2/5" pill; click the pill to unfold it.
- Safe open only changes the **preview**. Nothing is written into your scene: your code, layers, eyes and quality
  choice stay exactly as they were, and renders are untouched.
- Your edits are safe: a change you made just before a crash is still there afterwards.
- While Safe open is on, the AIs working on that scene are told once (in their next Lab answer), so a chat doesn't
  blindly run the heavy code again.
