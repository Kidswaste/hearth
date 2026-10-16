# gpu52 (round 52): the best graphics path on each computer, for the Lab and ▶ Play

Hearth never told Chromium anything about the graphics card: no switch at all in `main.js`. That's mostly fine (Chromium's
defaults are good), with three gaps that matter for a three.js game on a big 240 Hz screen: a laptop with two graphics
cards drew the Lab on the small built-in one; nothing said what Hearth was drawing with; and a start that fell to
software drawing on a real card (a driver Chromium distrusts) was never told. This pass fills those gaps and keeps
everything else on Chromium's defaults. No new button, nothing added to any prompt (0 tokens).

Where it lives: `gpu52-core.js` (the decisions, no Electron), `gpu52main.js` (before Electron's 'ready', the start marker
`data/gpu52.json`, Windows' own graphics choice, `gpu52:info`), `gpu52.js` (Settings line, `/graphics …`, the note; loads
with glrecover after the first screen), small hooks in `main.js`, `preload.js`, `appui.js` (the Graphics fold),
`glrecover.js` (`/graphics`), `tools/three-sandbox.html` and `tools/three.js` (the Lab's contexts).

## What each computer gets now

| | Windows | Mac |
|---|---|---|
| Which card (two-card laptops) | The fast card for all of Hearth (`force_high_performance_gpu`; Windows can't switch per page), and Windows' own per-app choice (Settings › Display › Graphics) set to High performance — **only when you never set one**: a choice you made there is never changed, and Hearth then stops asking app-wide | No app-wide switch: the Lab's (and a game's) WebGL contexts ask for `high-performance`, so macOS wakes the fast card while they draw and lets it sleep afterwards (chats stay on the battery-friendly card) |
| WebGL path (ANGLE) | D3D11 (Chromium's default): the most tested path for WebGL2 / three.js, hardware video overlays work, fewest shader-compile stalls. Vulkan is there to try (`/graphics backend vulkan`), not the default | Metal (Chromium's default). OpenGL (`/graphics backend gl`) is the old path, only for trying |
| Frame rate | Nothing caps or uncaps it: no `disable-frame-rate-limit`, no `disable-gpu-vsync` (these tear and run the card at 100 %). Chromium follows the refresh of the screen the window is on (240 / 165 / 144 Hz); in full screen G-Sync / FreeSync work as the driver allows | Same; ProMotion and external high-refresh screens follow their own refresh |
| Covered / on another screen | The main window keeps Chromium's occlusion (a fully covered Hearth rests: battery, fans). The ▶ Play window gets `backgroundThrottling: false` (`gpu52main.playWindowPrefs()`): never slowed when partly covered, on a second screen, or behind another app | Same |
| GPU raster, zero-copy, hardware video | Chromium's defaults (GPU raster on; video decoded by the card through D3D11) — the Settings line shows whether hardware video is on | Chromium's defaults (GPU raster, zero-copy IOSurfaces and VideoToolbox decode are on by default) |
| Driver blocklist | Kept (it guards drivers with known crashes). When it turns your card off, Hearth says so once; `/graphics blocklist ignore` tries without it, with the same way back | Same |

A picked path (or the blocklist off) that doesn't work is undone by itself: each start with it writes "pending" to
`data/gpu52.json`, and a few seconds in it is marked ok (on the card) or failed (software). A start that never got that
far (a crash, a hang) is treated as failed: the next start uses the default again and says once "Graphics: Vulkan didn't
start last time, so Hearth went back to D3D11". A command-line `--use-angle` (a test, your own shortcut) always wins.

## Upgrades
### The fast card
1. **Two-card laptops draw the Lab on the fast card**: every Lab WebGL context asks for `high-performance` unless the
   scene asks for something itself (three.js' own 'default' isn't asking). On a Mac the fast card wakes only while the
   Lab draws.
2. **Windows: Hearth on the fast card** (`force_high_performance_gpu`) and Windows' per-app graphics choice set to High
   performance when you never set one (your own choice there wins, always; Hearth remembers what it wrote).
3. **`/graphics power auto | high | saver`**: auto (above), always the fast card, or always the power-saving one (the
   whole app on the small card, and the Lab's contexts ask for `low-power`). Takes effect at the next start.
4. **For ▶ Play (gamemode)**: `gpu52main.playWindowPrefs()` (never throttled) and `gpu52main.pagePatch()` (a game build's
   WebGL asks for the fast card too, run before its scripts; the game's files are never changed).
### The path to the card
5. **Safe defaults kept on purpose**: D3D11 on Windows, Metal on the Mac, the blocklist on, nothing touching vsync or the
   frame rate; written down and tested for every platform and choice (none adds a frame-rate or GPU-off switch).
6. **`/graphics backend …`** (hidden, advanced): Windows `d3d11 | vulkan | d3d11on12 | gl`, Mac `metal | gl`, `auto`
   back; a path the platform lacks is refused.
7. **The way back**: a picked path that never reached the card (or drew in software) goes back to the default at the
   next start by itself, and says so once.
8. **`/graphics blocklist ignore | keep`** (hidden): for a driver Chromium distrusts, with the same way back.
### Seeing it
9. **Settings › Advanced › Graphics**: one plain line, "Graphics: NVIDIA GeForce RTX 4090 (D3D11) · 240 Hz · hardware
   video ✓" — the card and the path in use (ANGLE's own words), the refresh of the screen Hearth is on, hardware video
   decode, and on a two-card laptop which card the Lab gets. Under it: your picks, if any.
10. **The real pace measured**: when Settings opens, ~40 frames are timed; a 240 Hz screen drawn at 60 says "240 Hz
    (drawing 60 fps)" (a capped window shows at once).
11. **`/graphics`** starts with the same line (then glrecover's restarts and the Lab); its suggestions list the choices.
### Problems
12. **Started without the card, told once**: a start in software on a computer with a real card (not a VM / remote
    desktop) gets one calm note with why: the card stopped while starting (Restart), a picked path didn't reach it
    (Restart goes back), or Chromium turned it off for this driver (update the driver). Never repeated for the same
    card, driver and reason. A fall to software later in a session stays glrecover's note (not told twice).
### Checks
13. `dev/gpu52-test.js` (UNIT, 88 tests): every platform simulated (`process.platform` overridden): the switches per
    choice, the way back, Windows' own choice (fake `reg`), ANGLE strings → card + path, two-card laptops, the line,
    the note once / never on a VM, the page patch.
14. `dev/checks/gpu52.js` (own group `gpu52`): the flags in effect on this machine read like chrome://gpu (nothing
    capping the frame rate, none of Hearth's own on Linux, the test's `--use-angle` wins), the Settings fold and
    `/graphics` line, the Lab's context asking for the fast card, the hidden choices set and back, a pretended start in
    software: one note, not twice.

Count: 12 upgrades + 2 checks.

## Not done (on purpose)
- No `CalculateNativeWinOcclusion` switch: turning Windows' occlusion off makes a covered Hearth keep drawing (fans,
  battery); the game window opts out with `backgroundThrottling: false` instead.
- No `enable-zero-copy` / `enable-gpu-rasterization` / `ignore-gpu-blocklist` by default: Chromium already enables
  what's safe per card; forcing them is how drivers with known bugs crash.
- Vulkan isn't the Windows default: Chrome doesn't ship it for WebGL on Windows, and it costs hardware video overlays.
- VRR (G-Sync / FreeSync) can't be read from Electron; it's in the list below.

## What to try on your Mac and PC
1. Settings › Advanced › Graphics: does the line name your real card (e.g. NVIDIA GeForce RTX… on the PC, Apple M… or
   AMD Radeon Pro… on the Mac), your screen's refresh (240 Hz), and "hardware video ✓"? If it says "(drawing 60 fps)",
   tell me which screen it was on.
2. PC with the 240 Hz monitor not set as the main display: drag Hearth onto it and open Settings again; the line should
   show 240 Hz without "(drawing … fps)". If it's stuck at 60, try making the 240 Hz screen the main display.
3. A laptop with two cards: open the Lab with a heavy scene; Windows' Task Manager › Performance (or the Mac's Activity
   Monitor › Window › GPU History) should show the fast card working. On the PC, Settings › System › Display › Graphics
   should list Hearth as High performance (unless you had set it yourself).
4. G-Sync / FreeSync: play in ▶ Play full screen; with "G-SYNC for windowed and full screen" (NVIDIA) or FreeSync on,
   your monitor's refresh counter should follow the game's frame rate.
5. Optional: `/graphics backend vulkan`, restart, compare a Lab scene's smoothness, then `/graphics backend auto`. If
   Vulkan doesn't start, Hearth goes back to D3D11 by itself the next time.
6. Mac on battery: chats alone shouldn't wake the fast card (Activity Monitor › Energy, "Requires High Perf GPU"
   only while the Lab draws).

## For the patch notes
- **Hearth uses your fast graphics card for the Lab**: on a laptop with two cards, the Lab (and ▶ Play) draw on the fast
  one (on a Mac only while they draw; on Windows Hearth also sets Windows' own graphics choice when you never did).
- **Settings › Advanced › Graphics** says what Hearth draws with in one line: "Graphics: NVIDIA GeForce RTX 4090 (D3D11)
  · 240 Hz · hardware video ✓", and whether the window keeps up with your screen.
- **Calm about problems**: if Hearth ever starts without the graphics card on a computer that has one, it tells you once
  why and what helps (Restart, or a driver update).
- **For the curious**: `/graphics power auto|high|saver`, `/graphics backend …` (D3D11 / Vulkan on Windows, Metal / OpenGL
  on a Mac) — a choice that doesn't work goes back to the default by itself.
