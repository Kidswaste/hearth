# Round 178: new scenes draw only what moves
*November 2026*

## Layers that don't change are no longer redrawn

- In a new-format (v2) scene, every layer used to be drawn again on every frame, even a backdrop that never moves.
  Now a layer whose picture can't have changed is drawn once and its picture is reused.
- The still layers at the bottom of a scene (a backdrop, a set) are kept as one finished picture; the moving layers
  are drawn on top of it. When nothing in the scene moves at all, the Lab draws nothing: a still scene costs next to
  nothing while it sits there.
- Hearth only does this when it is sure. A layer that follows the music, uses time, or moves anything is drawn every
  frame as before. When a still layer changes (you edit it, move a slider it uses, change its opacity or the frame
  size), it is drawn again straight away.
- The Lab's stats line tells you: "2 of 4 layers still (not redrawn)". Claude and Astra see the same number and know
  how to build scenes that benefit: what never moves goes in its own layers at the bottom.
- Renders, recordings and stills are not affected: every layer is drawn for those, exactly as before.

## Good to know

- A still layer that sits above a moving one (a frame or a logo on top) is still redrawn every frame. Keeping those
  too is not built yet.
- If a layer changes in a way Hearth can't see coming (a picture that finishes loading late), it shows up to a third
  of a second later than before.
- Old-format scenes are untouched.

## Slow scenes lighten themselves: checked for new scenes

- You asked for Hearth to watch how long frames take and lower the resolution when a scene falls behind. It already
  does: it is the Lab's QUALITY › Smooth, the default. This round checked that it works for new-format scenes too.
- Measured on a deliberately heavy new-format scene at 4K: 12 frames a second with Force high quality; with Smooth the
  resolution went down in steps to half and the scene ran at 27 frames a second (30 was the most it could show
  there). When the load went away, the resolution came back by itself, a step at a time. A light scene was left alone.
- You see it in the stats line ("Quality: auto · 85 %") and can turn it off in the same menu (Force high quality).
  Stills, recordings and renders are always made at full quality.
- One thing old scenes have that new ones don't yet: drawing the single heaviest layer every other frame as a last
  resort.
