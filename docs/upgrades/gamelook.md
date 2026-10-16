# ▶ Play, the look (round 54, gamelook): your game at its best on this screen, never slower

The owner: Clink should run "buttery smooth at max graphical fidelity" in ▶ Play. Round 52 gave the window max
fidelity (the screen's pixel ratio, MSAA, the fast GPU, no cap) and GameReady sharpened the textures it found while
getting ready. This round, Hearth also takes care of what three.js leaves at a plain default, **only where the game left
it at that default**, and checks that it costs no smoothness. Nothing goes into any prompt (0 tokens); the game's files
are only read.

## What you see
1. ▶ Play as always. **Best** is the default: nothing to choose.
2. Press **F** in the game: under the fps line, one plain line says what the look did, e.g.
   *"Best look: textures 16× sharp (4) · true colour on 1 picture · shadows 512 → 2048"*.
3. The performance doctor (`/game-perf`) shows the same line at the top (and "wide-colour screen: colours shown as made"
   on a P3 / XDR / HDR screen).
4. One choice, in ▶ Play's right-click: **Graphics: Best / Balanced** (also `/game look best | balanced`; `/game look`
   tells what it is and what the game playing got). Balanced = sharp textures only; colours and shadows exactly as the
   game sets them.

## What Best does (gamelook-preload.js, inside the game's page, before its scripts)
1. **Sharp textures everywhere**: every mipmapped texture the game left at anisotropy 1 gets the graphics card's best
   (16× here) before it goes to the GPU, including the ones it makes later (a level streaming in): three's own
   `Texture.DEFAULT_ANISOTROPY` is raised when the game left it at 1. Before, only the textures GameReady found while
   getting ready were sharp. (Both looks.)
2. **True colours**: a picture in a colour slot (map, emissive, specular colour, sheen colour, an 8-bit background /
   environment) that the game left with **no colour space** is read as sRGB, as it was painted. three.js otherwise reads
   it as linear data: washed-out colours (the test's #c83c28 red showed as 229, 133, 110; now 200, 60, 40). Only when the
   game uses three's colour management (sRGB output); data / compressed textures and anything the game marked are kept.
3. **Shadows matched to the screen**: a light whose shadow map the game left at three's 512² gets the screen's size
   (its long edge in pixels, nearest power of two, 1024–4096: 2048 on a 1080p / 1440p screen, 4096 on 4K / a 16" Retina;
   point lights half, they draw six faces). The game's own filter and softness are kept: three.js r182+ already softens
   every shadow (PCF, 5 taps); its old "PCFSoft" type no longer exists, so "soft where cheap" is already there.
4. **The smoothness guard**: once the game plays (after GameReady's card), Hearth measures its frames against the
   screen's refresh. If they miss it, the shadow maps step down toward the game's own size while each step measurably
   helps (≥ 8 %); if a step doesn't help, they go back up (the shadows weren't the cost). Nothing else changes mid-play.
5. **Never touched**: tone mapping, the output colour space, the shadow type / radius, the pixel ratio, or any value the
   game set itself (a 1024 shadow, a texture marked linear, anisotropy 4 all stay; a later write by the game always
   wins). GameReady's prep and the Lab's ready-scan used to raise a game's own anisotropy (4 → 16): they keep it now.
6. **Wide colour / HDR**: reported, not converted. three.js renders sRGB-mastered colours; macOS (P3 / XDR) and Windows
   HDR show them exactly as made through the system's colour management. Rendering into a P3 or HDR buffer would only
   re-tint or brighten the game (its lights and colours are authored in sRGB), with no visible gain to measure: the
   clean fallback is the default.
7. A Lab scene played as a page gets the same (its renderer, merged on one canvas or not); an HTML build too. The live
   route (scenes that need the Lab while they play, through the Stage window) is unchanged.

## Measured (dev/checks/gamelook.js, 960×600 screen, software GPU)
A throwaway three.js game (written next to ▶ Play's test game; never one of the owner's), played off (round 53),
Best and Balanced, measured inside the page on one frame read back:
| | off (round 53) | Best |
|---|---|---|
| Far stripes on a strip made after the start (contrast, 0–255) | 0 (a grey blur) | 73.5 (anisotropy 1 → 16) |
| A picture left with no colour space (#c83c28 = 200, 60, 40) | 229, 133, 110 | 200, 60, 40 |
| Shadow vs a 4096² reference (mean difference · pixels off by > 16 levels) | 0.049 · 0.110 % | 0.020 · 0.043 % (512² → 1024², −59 %) |
| Frame gap, median of the calmest 2 s window (ms) | 133.3 (an earlier, calmer run: 66.7) | 116.7 (66.7) |
| The game's render() on the CPU, median | 0.57 ms | 0.43 ms |
| The look's own work | — | 23 looks at the scene, 0.06 ms each on average, 0.61 ms at most (the one that made the shadow map again) |

On this software GPU (7–15 fps, shared with other work) the guard measured 167 → 133 ms with the shadow map at 512²
and put it back to the game's own size, so Best's frame time matches off's (the picture row shows the 1024² map, as
where it fits). In the Lab scene the smaller map didn't help ("not-shadows") and 1024² stayed. On a real graphics card at 240 Hz the bigger map fits and stays. Balanced: the late
texture sharp too (16×), colours and shadows as the game sets them. The game's file is byte for byte the same after
three plays.

## Files
- `gamelook-preload.js` (new): `gameLookPage()`, registered by `gamemodemain.js` as a second preload of the game
  session (`registerPreloadScript`; sandboxed, it runs in the game's world through `executeInMainWorld`).
- `gamemodemain.js` / `gamemode-core.js` (`fidelity(d, look)`, `look()`), `gamemode.js` (Graphics submenu, `/game look`,
  store `gamemode.look`), `game-preload.js` (the F chip's second line), `tools/gameperf.js` + `gameperf-probe.js` (the
  doctor's line; the probe also listens on a devtools hook made before it and takes the look's renderers),
  `tools/gameready-page.js` + `tools/three-sandbox.html` (keep a game's own anisotropy), `tools/game-api.md`.
- Check: `dev/checks/gamelook.js` (group `gamelook` in `dev/run-checks.js`), `dev/gamemode-test.js` (the look in
  `fidelity`).

## Upgrades
1. Sharp textures on everything a game loads in ▶ Play, also the ones it makes after it started (both looks).
2. True colours for pictures a game left with no colour space (Best).
3. Shadow maps matched to the screen's pixels (Best).
4. A smoothness guard that steps the shadows back down only where that measurably helps (Best).
5. A game's own texture filtering kept when getting ready (GameReady, the Lab's ready-scan).
6. One "Graphics: Best / Balanced" choice in ▶ Play's right-click, Best by default; `/game look`.
7. What the look did, in plain words, under the F chip and in the performance doctor (with the screen's wide colour /
   HDR support).

## For the patch notes
- **▶ Play now makes your game look its best on your screen, with nothing to set.** Textures stay sharp far away
  (also the ones your game loads later), pictures your game left without a colour space show their real colours instead
  of washed-out ones, and shadows get a map sized for your screen (2048 on a 1440p display, 4096 on 4K or a Retina).
- Anything your game chose itself is kept exactly as it is: its tone mapping, its colours, its own shadow sizes and
  texture settings.
- It never costs smoothness: if bigger shadows would make the game miss your screen's refresh, Hearth steps them back
  down by itself, and only as far as that actually helps.
- Press **F** while playing to see what it did, in one line ("Best look: textures 16× sharp · true colour on 1 picture ·
  shadows 512 → 2048").
- One choice if you want it: right-click ▶ Play → **Graphics: Best / Balanced**. Balanced keeps your game's own colours
  and shadows and only sharpens textures.
- On a wide-colour or HDR screen (Mac Retina / XDR, Windows HDR) your game's colours are shown exactly as made, through
  the system's colour management.
