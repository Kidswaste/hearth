# Round 152: the Lab's new look, "Hearth Redux"
*November 2026*

You asked for Forgeheart's gold / orange / dark grey, a cleaner and more futuristic Lab with far fewer buttons on screen,
pretty animations when things come and go, and good performance again. Here is what changed.

## 🎨 The colours

- Dark graphite grey everywhere in the Lab (no more navy blue).
- **Gold** is the main colour: ▶ Run, ▶ Play on the timeline, the panel numbers (01 · 02 · 03), sliders, the stage's
  corner marks.
- **Orange (ember)** is the "hot" colour: the playhead, the selected layer, an open menu button, warnings, and the
  little dot next to 01 PREVIEW when the scene is playing.
- Labels are small, mono, warm off-white / grey. No scanlines, dot grids or glows any more.

## 👀 What you see when you're not touching anything

- **Lab bar:** the scene name, **▶ Run**, **▶ Play**, and **⋯** on the far right. That's it.
- **Timeline:** the big **▶** and the time, the song's tracks.
- **Layers & knobs:** the title, your layers, and the open layer's knobs (Shuffle, Save and "Find a slider" stay).
- **The picture:** only the picture and four small gold corner marks.

## 🧭 Where everything else is

Nothing was removed and nothing moved; it just waits until you're in that area:

| Point at… | What comes in |
| --- | --- |
| the **Lab bar** | Sketch ▾, ⚑ Finish line, ✦ Direction, ⚡ Sliders, ⚙ Inspect ▾, ▣ Present, 🔎, your palette / references |
| the **timeline** | the song button and name, ✦ Map, ♩ Beat ▾ and the BPM, ⚡ Sync ▾, Sections ▾, View ▾, ⋯, Sequence, Render, and the tempo / bar / time readout next to 02 TIMELINE |
| the **Layers & knobs panel** | ＋ Layer and ⋯ |
| a **layer row** | its 👁 eye (the selected layer always shows it; a hidden layer always shows ◌) |
| the open layer's **knobs** | ★ and ⋯ next to "Sliders" |
| the **picture's top-right corner** | Freeze, Fit, 9:16 · 16:9 · 4:5 · 1:1, More… (as in round 150) |
| the **picture's bottom edge** | the fps / quality line (as in round 150) |

- Press **I** (or type "show scene controls" in Ctrl+; , or `/stage show`) to show **everything** at once, everywhere in
  the Lab. I again (or "clean stage") tucks it all away.
- Using the keyboard? Tab onto a control and it shows itself.
- Want the old "everything visible" Lab? **Lab ⋯ › View & help › Lab look: Plain** (flat, every button in sight, no
  animation). Click it again for Forgeheart. (Round 148's "Plate" look is gone; if you had it, you get Forgeheart.)

## ✨ The animations

- When an area wakes up, a thin **gold → orange line** draws across it and its buttons fade and slide in one after
  another, left to right (about a fifth of a second). They leave faster, all together.
- Menus that fold out (♩ Beat ▾, ⚡ Sync ▾, ⚙ Inspect ▾) unroll from their edge with the same gold → orange line, their
  rows coming in one by one; they close at once.
- Opening a layer's knobs: an orange → gold line runs down their edge.
- The BPM readout's little flash on each beat is now a light lift (it used to make the whole timeline redraw).
- The "Slow" and "Safe open" notices wipe in from the left with an orange edge.
- Nothing ever loops: no pulsing, no sweeping, nothing moving while you're not doing anything or while the scene plays.
- Reduced motion (Windows' setting) or Hearth's **Appearance › Motion: calm / off** turns all of it off (things just
  appear).

## ⚡ Lighter to draw

The Lab window now draws a lot less: in our test (a heavy scene with its timeline, the same computer) the number of
"layers" your graphics card puts together for the Lab window went from **45 to about 25 at rest and 45 to about 24
while playing**, and the drawing work per second went down too (about 6 → 4 thousandths of a second at rest, 8 → 7
while playing). The looping glints, pulses, scanlines and glows that cost something on every frame are gone for good.
