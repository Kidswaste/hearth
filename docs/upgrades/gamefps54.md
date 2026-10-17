# Round 54 fix: ▶ Play at full frame rate with the round-54 page scripts (gamefps54)

The owner, after round 54: "play does look best but the framerate is abysmal" (Clink, a Windows PC with an RTX
4090-class card, a 240 Hz screen at 1440p / 4K). Measured on a throwaway game that works like a real one (160 boxes,
a sun, a spot and a point light casting shadows, 6 projectiles a frame each with its own cloned material, sparks,
decals, a DataTexture and a CanvasTexture rewritten every frame, 2000 particles), each round-54 page script alone:

`dev/checks/gamefps54.js` in ▶ Play, the work around the game's render a frame vs off (main-thread frame ≈ 3.2 ms):

| Script | Round 54 as shipped | Fixed |
|---|---|---|
| Loads during play (gamestream) | +0.79 ms (24.5 %), and **every projectile held and drawn hidden** (356–406 holds in 6 s: bullets that live 0.8 s were barely seen) | +0.05–0.09 ms, nothing held |
| Look, Best (gamelook) | +0.02 ms on average, but a whole-scene sweep inside a frame every second (2.3 ms on this scene, more on a big one; every frame when a game makes textures as it plays); 4096² sun / spot + 2048² point shadow maps on a 4K screen | +0.04 ms, no whole-scene sweep mid-play, ≤ 0.35 ms in any frame; 2048² / 1024² at most |
| Sound (gameaudio) | ≈ 0 | ≈ 0 (unchanged) |
| All (Best as it ships) | +0.71–0.74 ms (22–23 %) | +0.07 ms (2.1–2.2 %: under 2 % of a 240 Hz frame) |

(A shared software GPU and a slow CPU here; the owner's CPU does the same work about three times faster.)

1. **Loads during play leaves a game's steady work alone.** Before, every object a game added during play (a bullet, a
   spark, a decal) whose material had no shader yet (a cloned material) was compiled with `renderer.compile(obj,
   camera, scene)` (which walks the whole scene), fenced with a flush, and drawn hidden for 2+ frames: projectiles were
   invisible and each one cost a scene walk. Now an added object is compiled only when its material is of a kind not
   compiled before (type, maps, shader, defines, geometry; a geometry + material type found 3 times as already compiled
   is not looked at again), at most 4 a frame, and held only if that compile actually
   made a new program. A canvas / data / video texture the game rewrites every frame is never re-sent through the
   one-per-frame / strip path (only pictures never sent to the card are). Removed-before-drawn objects are dropped at
   once. It also turns on without waiting for the game to load a file.
2. **The look never sweeps the whole scene inside a frame of play.** The whole scene is looked at once, before its first
   frame; then only what the game adds (before it's drawn: a few µs a projectile), plus a background walk of at most
   0.15 ms a frame, every 2 s and 240 frames (1 s and 120 frames after new textures), that still finds a picture put on an existing material later.
3. **Shadow maps capped at 2048² (point lights 1024²).** Past that PCF blurs the difference away while each shadow
   light redraws the scene into a map four times bigger: a 4K screen got 4096² sun + spot and a 2048² point light
   (six faces), 58 M shadow texels a frame.
4. **The smoothness guard reacts faster and keeps watching.** 60 frames a measurement (a quarter second at 240 Hz),
   steps of 200 ms; then every 5 s while the shadows are above the game's own size, 60 frames: if frames miss the
   refresh again (a heavier scene later), a step down, kept only if it helps. A size that didn't help is never tried
   again (a game with its own frame cap doesn't get its shadow maps made again every few seconds).
5. **A check that fails on the regression**: `dev/checks/gamefps54.js` (group `gamefps54`, also in `gamelook` /
   `gamestream`) plays the fixture off / Best twice and each script alone and fails when Best's own work is over 2 % of
   the frame, when a steady projectile is held / hidden / compiled again, when the look sweeps the whole scene in a frame of play,
   when a shadow map is over 2048² (point 1024²) or frames are slower than off. `dev/gamefps54-test.js` (unit): the
   caps on 720p → 4K screens, no whole-scene sweep while a projectile a frame is added, a late picture still found.

## For the patch notes
- **▶ Play is smooth again with the Best look.** Projectiles, sparks and anything your game adds every frame are no
  longer held back and hidden for a few frames by "loading during play", and that part no longer costs your game frames:
  it only steps in for things that are really new (a level, a model, a big picture).
- Shadows sized for your screen now stop at 2048 (1024 for a point light): the same look, a lot less work for the
  graphics card at 4K / 240 Hz, and Hearth keeps watching while you play and steps them down if your game gets heavier.
- The look checks your scene without ever pausing a frame to do it.
