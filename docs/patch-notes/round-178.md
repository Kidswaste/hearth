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
