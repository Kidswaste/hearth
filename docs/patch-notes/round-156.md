# Round 156: ⚡ Lite mode, one click for busy days
*November 2026*

You asked for a one-click **Lite mode**: always 30 fps, no glow or effects, a half-resolution preview. Here it is.

## Where to click

Pick whichever is closest; they are the same switch:

- **In the Lab:** the **⋯** at the right end of the Lab bar → the first row, **⚡ Lite mode**.
- **Anywhere in Hearth:** the **⋯** in the left rail → the first row, **Lite mode** (ticked while it is on).
- **Settings → Look & size:** the **⚡ Lite mode** tick box.
- **Keyboard:** **Ctrl+Alt+L** turns it on and off (⌘+Alt+L on a Mac).
- **Command bar (Ctrl+;):** type **lite mode on** or **lite mode off** (or just **lite**). `/lite on` and `/lite off`
  work in any chat too.

While it is on you see a small **LITE** label at the right of the Lab bar (next to ⋯) and in the left rail. **Click
either one to turn Lite mode off.** It stays on after you close and reopen Hearth, until you turn it off.

## What it does

**The Lab preview (the picture you watch while you work):**
- **30 frames a second, always**, even with Hearth in front.
- **Half resolution** (the picture is a little softer).
- **No glow or effects in the preview:** bloom / glow passes, blur, grain, vignette and similar effects step aside,
  **no shadows**, no edge smoothing (antialias).

**Everywhere in Hearth:**
- **No animations** or sliding / fading transitions (same as Motion: Off), no blurred see-through panels, no textures
  or glow on the app's look.
- The Lab's reactive stage (the frame that pulses with the music) is off.
- Background checks (updates, usage limits, and so on) run three times less often.

## What it never touches

- **Renders and exports are full quality, exactly as before.** The check renders the same still and the same short MP4
  with Lite mode on and off: they come out identical (same size, same frames, same picture with glow and smooth
  edges).
- ▶ Play's own window and the Stage window are untouched; ▣ Present, screenshots and recordings of the preview keep
  their full frame rate, resolution and glow.
- **Turning it off gives back exactly what you had:** your Quality choice (Smooth / Balanced / Force high quality),
  your Lab look, your Motion setting and the rest. Lite mode never changes those settings; it only sits on top of them
  while it is on.

## Hearth may offer it

If the Lab preview stays under about 20 frames a second for a while, or Hearth freezes several times in a minute,
you may see one small note: **"Things are slow — turn on Lite mode?"** with a button to turn it on. It shows **at most
once each time you open Hearth**, the **×** dismisses it, and Hearth **never turns Lite mode on by itself**. (Ctrl+K
→ "Lite mode: don't offer it when things are slow" stops the note for good.)

## How much it saves

MEASURE_TABLE
