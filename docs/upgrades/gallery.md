# gallery (round 27): a beautiful place to start from

The Lab's **New** used to open a plain list of twelve code templates. Now it opens a gallery: one window of picture
cards to start a music visual from, grouped by mood, with a search on top. Hover a card and it plays; click it and it
becomes a new scene (at the frame size you're on, 9:16 included); "＋ Layer" puts it on top of the scene you have.
26 new built-in starting points were made for it (six of them on new layers written for this round), each with
plainly named sliders and something that follows the music (the demo beat until a song is loaded).

Files: `tools/three-gallery-data.js` (the starting points and the new layers), `tools/three-gallery.js` (the window,
the pictures, the preview, starting from one, `/gallery`), `tools/three-gallery.css`, `tools/three-gallery-hook.js`
(the ways in, loaded with the Lab), `dev/checks/gallery.js` (in the `lab` group).
Small hooks elsewhere: one line in `tools/three.js` (New asks the gallery first), the `gallery` lazy group and one
file in the lab group (`lazy-data.js`, manifest regenerated), one row in `tools/three-easy-data.js` (where `/gallery`
lives, for the Lab audit), two lines in `mcp/hearth-map.js` (the directors know it), the check in `dev/run-checks.js`.

Light by design: the gallery's code loads the first time it's opened (not with the first screen, not with the Lab);
pictures are drawn **one at a time in one hidden preview page** (never a WebGL page per card), only for the cards you
scroll to, then kept as small JPEGs on disk (`lab-gallery-thumbs`, up to 500) and reused next time; your scenes use
the stills the Lab already keeps; the page goes blank a minute after the window closes.

## The gallery window
1. **Start from something like…**: one window of picture cards (3:4) instead of the plain template list.
2. **Search** across names, descriptions, moods and tags; a whole sentence works too ("something like a pink chrome blob" finds the closest ones first).
3. **Mood chips**: All · ✦ Starting points · 🌆 Neon & retro · 🪩 Chrome & glossy · ☁ Soft & dreamy · 🌀 Dark & hypnotic · ⚡ Club energy · 🅰 Type openers · Your scenes · History · Library.
4. **Every card is a picture** of what it looks like, drawn once and kept on disk (the next time it opens, they're there at once).
5. **One shared preview page** draws them, one at a time, only for the cards in view (no pile of WebGL pages, nothing drawn for cards you never scroll to).
6. **Hover to preview**: the card plays live for a few seconds (the same single page, laid over the card), then shows its picture again (a fresh one if it had none).
7. **Click: a new scene from it**, opened right away, at the frame size you're on (9:16 stays 9:16), named after it.
8. **＋ Layer** (on the card when you point at it): its layers go on top of the scene on screen; a starting point's look filters stay out so they don't restyle your scene.
9. **Right-click a card**: a new scene from it · add it as layers · open it (your own scenes) · draw its picture again (under More…).
10. **Keys**: Enter starts from the first result, ↓ goes from the search to the cards, arrows move between cards, Esc closes.
11. **The frame size** new scenes will get is shown at the bottom.
12. A picture that didn't come out the first time is **tried again** once, later.

## What's in it
13. **Your scenes**, newest first, with the stills the Lab already keeps; starting from one makes a copy with its song, timeline and frame size.
14. **From history: deleted scenes** (the Lab's trash) to start again from.
15. **From history: how your recent scenes began**: the first version in the time machine of your 8 latest scenes.
16. **Library: every layer template** that makes a whole picture: Backgrounds, Visualizers, 3D scenes, Shaders, Particles, Physics, Kinetic type, Text & HUD.
17. **Library: the node presets** (as node layers, open in the Nodes view).
18. **Library: the code sketches** (the twelve templates the old New list had).

## Ways in (no command needed)
19. **The Lab's New** (Sketch ▾ › New…, the sketch list's ＋ New sketch, Ctrl/⌘+K "Lab: New sketch from a template") opens the gallery; New's right-click keeps the plain list.
20. **A new chat's starter** shows "🖼 Start from something like…" on the preview (× hides it for that scene).
21. **◎ mission "Start from something like…"** in the Three Director's chat: your words search the gallery; the scene you pick opens and your message then goes to the director as written, under one visible line saying what you started from; closing the gallery puts your words back in the box.
22. **The directors know it** (the app map, read on demand: no tokens added to any message) and can start one for you.

## Chat (the app's internal API)
23. `/gallery [words]`: the gallery, searched.
24. `/gallery start <name>`: a new scene from a starting point (or a library item) right away.
25. `/gallery layer <name>`: its layers on top of the scene on screen.
26. `/gallery list`: the starting points by mood.

## New layers written for the starting points (each a normal layer: sliders, Save, Shuffle, looks, keyframes)
27. **Outrun sunset**: a striped sun, mountains, stars and a neon grid racing to the horizon (Sky top / at the horizon, Sun top / bottom, Grid, Ground, Mountains, Sun size / height, Horizon, Stars, Grid speed; Music: Kick lights the grid, Bass swells the sun).
28. **Hyper tunnel**: neon rings and lanes rushing at you, round or 3–8 walls (Colors, Sides, Lanes, Width, Speed, Twist, Roll, Darkness far away; Music: Kick flashes the rings, Snare lights the walls; the bass pushes you forward).
29. **Liquid gradient**: four colors folding like paint in water (Deep color, Main color, Highlight, Accent, Size, Folding, Flow, Sheen, Grain; Music: Kick glow; the bass stirs it).
30. **Chrome blob**: a liquid-metal blob in a studio of colored light panels, rippled on the graphics card (Metal tint, Light 1–3, Size, Wobble, Ripple size, Roughness, Flow, Spin; Music: Kick puff, Bass wobble); steps back in tall frames.
31. **Beat burst**: a cloud of up to 120,000 glowing particles bursting out on every kick (Particles, Size of the cloud, Particle size, Brightness, Colors, Swirl, Spin, Drift; Music: Kick burst, Bass breathing).
32. **Kinetic opener**: one big word per beat (or every few), letters rising in one after another, outlined echoes that swell on kicks, a flash on every bar (Words, Font, Beats per word, Size, Position, Text, Echo & flash colors, Echo outlines, Letter rise; Music: Kick punch, Flash on each bar).

## The 26 built-in starting points
### 🌆 Neon & retro
33. **Outrun sunset**: the outrun layer with bloom and soft scanlines.
34. **Hyper tunnel**: the hyper tunnel with bloom and chromatic aberration.
35. **Wire mountains at dusk**: wireframe mountains under a vapor sun, bloom, grain.
36. **Arcade equalizer**: mirrored spectrum bars over a synthwave grid on an arcade CRT.
### 🪩 Chrome & glossy
37. **Chrome blob**: the chrome blob over a dark liquid backdrop, halation.
38. **Molten gold**: the blob in warm gold light over an ember gradient, bloom.
39. **Chrome knot**: a turning chrome knot over a soft mesh gradient.
40. **Disco mirror ball**: a mirror ball flashing with the hi-hats under sweeping spotlights.
### ☁ Soft & dreamy
41. **Liquid gradient**: warm colors folding, with a vignette.
42. **Aurora night**: northern lights over twinkling stars, film grain.
43. **Bokeh dream**: out-of-focus lights over a flowing gradient, dream glow.
44. **Pastel flow**: a slow pastel gradient with light leaks for lo-fi and chill tracks.
### 🌀 Dark & hypnotic
45. **Pulsar lines**: stacked waveform lines in black and white, grain, vignette.
46. **Particle galaxy**: a spiral galaxy of 30,000 stars pulsing with the kick.
47. **Hypno spiral**: a turning op-art spiral split into color on hits.
48. **Fractal dive**: an endless fractal zoom that morphs with the bass.
### ⚡ Club energy
49. **Beat burst**: particles bursting on the kick over a deep backdrop, bloom.
50. **Spectrum crown**: a 3D crown of spectrum bars inside a spectrum halo.
51. **Hyperspace**: stars streaking past over deep space, a zoom blur on the bass.
52. **Laser show**: sweeping lasers in a haze, bloom, a flash on every snare.
53. **Ember burst**: warm embers bursting on the kick over a fiery gradient.
### 🅰 Type openers
54. **Kinetic opener**: NEW MUSIC OUT NOW word by word on the beat, RGB split.
55. **Glitch title**: a glitching title over a violet mesh gradient, scanlines.
56. **Out now poster**: OUT NOW punching on kicks over a vapor sun.
57. **Word flash**: a word on every beat over swirling ink.
58. **Friday live**: an event opener (FRIDAY 9 PM LIVE, two beats a word) over the hyper tunnel.

## For testing (not counted)
- `sh dev/run-checks.sh gallery` (`dev/checks/gallery.js`, fake engines, ≈ 130 s here): the gallery group isn't loaded on the first screen nor with the Lab; the Lab's New opens it; 26 starting points in all 6 moods, your scenes and the library; pictures in ONE preview page; search (a word and a sentence); a mood chip; hover preview laid over its card; a new scene (3 layers, plain slider names, no errors); ＋ Layer; `/gallery start`; the starter's chip; the ◎ mission (search → pick → the director gets "🖼 Started from …" + your words); then **every built-in starting point run in the preview page: drawn, no errors, ≥ 3 sliders, something reading the music, a picture that isn't black**; pictures kept on disk.
- Also run: `labeasy` (the Lab audit knows `/gallery`) and `lazy` (the manifest) pass.
- Not verified here: the look on a real GPU (SwiftShader draws the preview at a few frames a second, so the hover preview is slow here); fonts are the Mac's (Arial Black / Impact fall back to a serif on this Linux box).
