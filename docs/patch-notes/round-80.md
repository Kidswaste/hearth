# Round 80: scene errors reach the AI, picture and sound back together after a hitch
*October 2026*

## ⚠ Scene errors reach the AI
- **The AI now finds out when your scene breaks after a change**: if a layer starts throwing errors a few frames
  later, a shader doesn't compile, the camera goes blank, a file is missing or the graphics card resets, Claude or
  Astra is told in its next step, in one short line. When everything is fine, nothing is added.
- **"⚠ Scene error · Ask Claude to fix"**: under the last reply of a chat whose scene broke. One click sends Claude the
  error and the code around it; it never sends by itself. The × hides it.
- **A layer that errors on every frame is paused** so the Lab stays smooth: a note at the bottom left of the preview
  says which one, with **▶ Resume**. Editing the layer runs it again.
- **Calmer console**: an error that repeats shows once instead of filling the console, and shader errors read in words.
- Works the same for scenes that run in the background (a chat's scene you're not looking at).

## 🧪 Steadier checks (and one Lab fix)
- Lab sound sync after a hiccup: when the Lab stalls for a moment (a busy computer, coming back from another tool),
  the next picture now matches what you hear right away, instead of briefly showing the old spot after a jump, or
  leaping ahead for one frame and stepping back.

