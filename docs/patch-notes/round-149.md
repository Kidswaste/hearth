# Round 149: heavy scenes play smoother
*November 2026*

You said playback was "smoother(ish), still laggy overall on heavy scenes". This round measured where a heavy scene's
frame time still goes while it plays, in the preview and in the Lab window around it, and cut the biggest parts.

## ✨ Glow and bloom scenes now get lighter when Smooth steps down
- This was the big one. Most glowing scenes do their glow with three.js's "bloom" effect (EffectComposer and
  UnrealBloomPass: the Bloom template, the node editor's post effects, and most scenes the AIs write). When Smooth
  lowered the resolution, that glow kept drawing at full size, so Smooth (auto) at its lightest step was **no faster
  than Force high quality** on these scenes.
- Now the glow follows Smooth's resolution. Together with the shadow change below, on our heavy test scene at the same
  Smooth step the graphics work per frame dropped by a quarter to a third and the frame rate went up by about half. Your RTX 4080 has more headroom than our test box,
  so expect it to keep the scene at a higher step instead (sharper picture, same smoothness).
- It also works the other way: a glow scene opened while Smooth was already low used to stay soft after Smooth climbed
  back to full quality. Now it sharpens again with the rest.
- **Force high quality** draws exactly as before, and renders are untouched.

## 🌗 Moving shadows at half rate, only when Smooth is at its lightest
- When Smooth has already had to shrink the shadows (its last steps), shadows of moving things now refresh every
  other frame. The shadows can trail one frame behind on fast motion; the rest of the picture is unchanged.
- Shadows of things that don't move were already drawn only once (since an earlier round). Force high quality and
  Balanced always draw shadows every frame.

## 🖥 Less work around the preview on a fast screen
- On a 120, 144 or 240 Hz screen the timeline under the preview now updates at most 60 times a second while the song
  plays (it was every screen refresh: 240 times a second on yours). The playhead still glides smoothly. With the click
  track on, it keeps every refresh so the clicks stay on time.
- The beat light on the BPM readout now flashes as a glow the graphics card handles by itself, instead of making the
  Lab window redo its layout twice a second.
- We checked the other moving touches from the last rounds: everything else pauses while the scene plays.

## What to try
- Open your heaviest glow scene (vizualizer2, for example), leave the quality chip on **Quality: auto** and press play.
  It should hold its frame rate at a sharper step than before. Pointing at the chip says what Smooth lowered right now.
- If you need the exact full-quality look while you work, **Force high quality** is still in the same menu.
