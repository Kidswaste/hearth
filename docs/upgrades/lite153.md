# ⚡ Lite mode (round 153a, lite153): one switch for busy days

The owner (Windows, RTX 4080, 240 Hz, many apps in the background) asked for "a one-click Lite mode", defined as:
always 30 fps, no glow or effects, a half-resolution preview. perf151 had named it as the first lever ("a stricter
Lite mode switch … one click for busy days").

## The switch

- **One stored value**, `localStorage['hub.lite']` (the renderer store's own `hub.` prefix: `store.get('lite')`), self-
  contained so the "Trim Hearth" panel and the Lab-window rounds can't collide with it.
- **`window.HearthLite = { on, set(v), toggle(), stats(msg) }`** in `powerwise.js` (first screen, ≈ 2 KB),
  read **before the first paint** (`<html data-lite>` is set when powerwise.js runs, ahead of DOMContentLoaded: the check
  sees it set at DOMContentLoaded and at the first frame after a reload). A change fires `hearth:lite` (`{ on, why }`)
  and another Hearth window's change arrives through the `storage` event, so a separate Lab window only has to load
  powerwise.js (or read `hub.lite`) to follow it.
- **Nothing else is stored or changed.** Lite only sits on top of the owner's choices: quality mode (Smooth / Balanced /
  Force high quality), Lab look, stage setting, theme / Motion / glow / textures are never written, so off gives back
  exactly what was there (checked: every stored value and every attribute equal before / after, the preview's frame cap,
  ⚡ settings, pixel ratio and antialias back to their old values).

## Where it is

| Place | What |
| --- | --- |
| Lab bar ⋯ | first row **⚡ Lite mode** (ticked while on; the menu stays at 11 rows, no folding) |
| Rail ⋯ (simplify.js) | first row **Lite mode** (ticked) |
| Settings › Look & size | **⚡ Lite mode** tick box |
| Ctrl/⌘+; command bar | "lite mode on / off", "turn on lite", "enable lite mode", "lite" (toggle) — also inside the Lab (read before the Lab's plain words) |
| chat / F1 | `/lite [on \| off \| status]` (keywords: lite, fast, slow, lag, performance, glow, animations…) |
| Ctrl/⌘+K | "Lite mode: on / off", "Lite mode: don't offer it when things are slow" |
| key | **Ctrl/⌘+Alt+L** (free: no Alt+L binding anywhere in the app or the Lab; in the keys sheet) |
| indicator | a quiet gold mono **LITE** tag beside the Lab bar's ⋯ and in the rail's status corner; a click turns Lite off |

Lazy group **`lite`** (`lite.js`, asap: right after the first frame): /lite, the actions, the key, the rail tag, the offer.
The Lab's row and tag are in `tools/three.js` (group `lab`); the command bar's words in `cmdbar.js` (`CmdBar.litePhrase`).
First screen: after trim153 it stood at exactly 1,547 / 1,547 KB; Lite's eager part (the reader in powerwise.js ≈ 0.8 KB,
look.js, the manifest lines: ≈ 2.2 KB) is paid for by moving Power-wise's main-process half out of the window: the
holds' blocker, its reasons and the Mac / Windows battery-saver readers are now `powerwise-hold.js`, required only by Node
(powerwise.js merges it into its exports for powerwisemain.js and dev/powerwise-test.js, unchanged: 83 / 83). Result:
**1,543 KB of 1,547**, 62 scripts, 27 sheets (the CSS in powerwise.css). The lazy group `lite` is registered as core in
Trim Hearth (`trim-data.js`, "Screen, accessibility and calm"). The Lab window (labwin153) loads powerwise.js, so it reads
and sets the same switch (its `LabWinHost.lite()` reads `HearthLite.on`); a flip in either window reaches the other
through the `storage` event, and a flip re-sends the frame cap, so the Lab window's own full rate behind other apps
comes back when Lite goes off.

## What it does

**The Lab preview** (`tools/three-sandbox.html` "lite153", `tools/three.js`): the `lite` message (and a `lite` field on
every frame-cap message, so a warmed preview page taken at the Lab's first open gets it too)
- **30 fps always** (`applyCap`: focused or not; Auto's 60 / the screen's rate never reached);
- **half resolution**: each renderer at ≤ ½ device pixel per CSS pixel (`prQ`: a 2× scene draws at 0.5);
- **glow / effects stepped aside**: a layer's own EffectComposer draws only its RenderPass and OutputPass (bloom and
  every other pass disabled for that frame, their `enabled` put back after it, so the scene's code sees nothing:
  `cpxLite`); the Lab's own identity-able filters (bloom, blur, grain, vignette, sharpen, zoom / motion blur) step aside
  as at amount 0; other filters (grades, lens) at half size;
- **shadows off, antialias off** (the ⚡ settings' lightest: `sh: 0`, `noAA`, `px1`, `fxHalf`; antialias from a fresh
  page, since a context's antialias is fixed when made: one quiet reload when Lite flips);
- Never in renders: the export page (`?xp=1`) ignores the message (its own checks), stills / screenshots / recordings
  draw at full size and rate (`fullRes`, `recNow`), ▣ Present (RDY.lock) keeps its rate, resolution and glow, ▶ Play
  and the Stage window ignore it.
- The ⚡ Speed check's "Slow" chip doesn't count Lite's 30 as slow; the jank watch doesn't also suggest 🪶 Light mode.

**The UI** (`powerwise.css`, `look.js`, `tools/three-hudstage.js`): Motion: off (look.js, not saved) — every
animation and transition off; `backdrop-filter`, `will-change` forced off everywhere; no textures, `--glow: 0`; the
press ripples (juice layer) and the stage's glow / flash layers not drawn; the reactive stage off (no colour reading:
`fx() → 'none'`, which also drops the stage frame's decorations). The Lab keeps the look the owner picked (Hearth Redux,
contextual controls) — with no motion it is as flat as Plain, without moving his controls around.

**Background** (`powerwise.js`): Power's policy with `lite`: background timers (Power.every: updater, usage limits,
cost coach, sleeping websites, routines, hooks…) at a third of their pace (as battery saver), no warm Lab preload
(`warm: false`); the usage pass waits 4 s instead of 0.8 s after a change (`usage.js`). Hidden views already did nothing
(parked preview, backgroundThrottling).

**The offer** (`lite.js`): "Things are slow — turn on Lite mode?" once a session at most, when the preview stays under
20 fps for 12 s of its stats while it moves (not hidden, not still), or the window froze (≥ 0.5 s, jank.js's list)
three times in a minute (checked once a minute, only while on screen). One click turns it on, × dismisses, never
switched automatically; Ctrl/⌘+K can stop it for good (`lite.noOffer`).

## Measured

MEASURE_SECTION

## Check

`dev/checks/lite153.js` (ONE check, own fixture + temp data): switch (a real click on the Lab ⋯ row), preview (cap 30,
pixel ratio 0.5 of a 2× scene, antialias off, the spot light's shadow held off, the composer's bloom bypassed), ui (no
running animation after a menu and the Lab bar's reveal, no backdrop-filter / will-change, layers on ≤ off, both LITE
tags, Settings' row), renders (a still and a 1 s MP4 with Lite on = with Lite off), words (command bar, /lite, the key),
persist (reload: on before the first frame, preview 30 / half again), restore (the Lab bar tag turns it off, every
setting as before), offer (a 70 ms-a-frame layer: the offer once, not switched on).

CHECK_SECTION

## For Codex

Nothing: no Codex-owned file was touched.

Release: round 157 (owner notes `docs/patch-notes/round-157.md`), merged on top of labwin153 (round 153), trim153 (round 154), the memory round (155) and the faster-start round (156). After round 156's cut the first screen is 49 scripts, 1,168 KB of 1,207 (Lite's eager part included).
