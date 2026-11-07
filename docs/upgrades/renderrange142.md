# Round 142 · renderrange142: the render matches the loop (Full song · Loop · Sequence)

The owner's ask: "When I loop a timeline, make sure the render then matches the loop or set it as an option I can tick
(full song/loop/sequence)."

## What the Render card rendered before (checked in the code)
- **The card on its own (no preset ticked)** had no length field. `LabExport.render()` picked the length by itself:
  - a scene **with an A–B loop set** on the timeline: the loop, frame-exact, with its sound (so a loop already "worked",
    but nothing on the card said so);
  - a scene **with no loop**: **10 seconds from the playhead**. There was no way to render the full song from the card
    without ticking the Full song preset.
  - **▤ The sequence** (the old "What" row): the whole sequence.
  - A perfect-loop MP4 / GIF format: 2 bars at the playhead's bar (the song's grid), or the A–B loop without a grid.
- **The presets** (renderpre131) each work out their own length:
  - **Vertical reel**: the song's best 15–30 s (its drop with the build-up before it, on whole bars), whatever loop
    is set;
  - **Seamless loop**: the ∞ Make it loop loop when it is on, else the A–B loop, else 2 bars at the playhead;
  - **Full song** and **4K master**: the whole song (the whole sequence when the card is on the sequence);
  - **Square post**: 15 s from the drop (the first 15 s of a sequence);
  - **▤ sequence source**: every preset renders the sequence instead of the scene (the reel's range is then read on
    the sequence's clock).
  The preset's range showed as a line under the presets, with a ✎ to change it.

## What's new, and where the owner clicks
**The Lab › Render (⇪ Export…)**: the first row of the card is now **What to render**, a row of compact chips that
replaces the old "What: This scene / ▤ The sequence" row (no new row):

- **♫ Full song**: the whole song, start to end (a scene with no song: its whole timeline).
- **⟲ Loop**: shown whenever the timeline has a loop (the A–B loop, or ∞ Make it loop's). If looping is on when the card
  opens, **Loop is already picked**, and the line under the chips says e.g. **"Your loop: 0:32 – 0:48 (16 s, 8 bars)"**.
- **▤ Sequence**: shown when the scene is in a Lab sequence (the one open now, or the scene's own). Picking it loads
  that sequence (without showing it) and renders it whole.
- **✎ Custom**: asks "From – to (seconds)", e.g. 22.5-45.

How it behaves:
- **Exact**: the render starts on the range's first frame and is exactly `(end − start) × frame rate` frames long; the
  sound is the song from the same start, trimmed to the same length.
- **Perfect loops**: a perfect-loop MP4 or GIF of the Loop range takes the loop's start and length; with ∞ Make it loop on
  it renders through perfectloop's loop clock with its own fade (seamless), as ∞ Make it loop's own render does.
- **Presets keep their own logic**: when a preset is shown, the chips show what it chose (the reel's drop window lights
  **✎ Custom** and the line says "Vertical reel chose · 0:22 – 0:44 (22 s, 12 bars) · the drop at …"; Seamless loop lights
  **Loop**; Full song lights **Full song**). Clicking another chip changes that preset's range (e.g. a reel of exactly
  your loop).
- **Remembered per project**: the choice is kept on the project (`p.prefs.renderRange`, next to `renderLast`, it syncs).
  It is remembered with the loop it was picked for: a **new** loop opens the card on Loop again; the same loop keeps
  what he picked (e.g. Full song).
- **The check before a render** (preflight140) shows the range above the time and size: "▸ Your loop: 0:32 – 0:48 (16 s,
  8 bars)" then "⏱ about 40 s · ~12 MB" (for presets: one line per preset). The Render card's own summary line also
  estimates the chosen range.

## Files
- `tools/three-renderpre-core.js` (pure): `RANGES`, `loopOf`, `offered`, `lengthFor`, `kindOf`, `firstKind`,
  `rangeLine`, `lengthOpts`, `clock`.
- `tools/three-renderpre.js`: the What to render row (`rangeRow`, `choose`, `lengthOpts`, `range`), the scene's sequence
  (`seqOf`), the remembered choice, each preset's range sent to the check.
- `tools/three-export.js` `panel()`: the row at the top (the old What row stays as a fallback when the presets group
  can't load), and the chosen range passed to the render, the estimate and the check.
- `tools/three-preflight.js` / `.css`: `gate({ range })` shows it (`.pf-range`) and keeps it in `LabPreflight.last.range`.
- `tools/three-renderpre.css`: the row's chips and line.
- No new lazy group or file on the first screen (all of it is in the lazy `renderpre` and `preflight` groups).

## Tests
One check, `dev/checks/renderrange142.js` (group **renderrange142**: renderrange142, renderpre131, preflight140,
cuelooks139, labchat92, unit:boot-test). On a 16:9 scene with the fixture song and a 2-bar loop, in a project:
1. the card opens on Loop, at the top, with "Your loop: … (3.75 s, 2 bars)";
2. ⇪ Export on Loop: probed, exactly the loop's frames, the sound present, and the export asked the song from the loop's
   start to its end;
3. Full song: the whole song's frames;
4. the choice is on the project (and on disk); the same loop keeps Full song, a new loop opens on Loop;
5. reel / Seamless loop / Full song presets light Custom / Loop / Full song with "<preset> chose · …"; the Loop chip sets
   the reel's range to the loop;
6. with solo on, the check's card shows "▸ Your loop: …" and the time;
7. Sequence is not offered before the scene is in a sequence, is offered after, and renders the sequence's frames.
Renders are tiny (96×54, 24 fps). `renderpre131`'s "Presets row first" step now accepts it under What to render.

## Risks / not done
- A perfect-loop MP4 / GIF from the card stays silent, as before (∞ Make it loop's own render adds the sound).
- Custom on the sequence isn't offered (Custom, Loop and Full song are the scene's clock); the sequence's own In–Out
  range still comes from `/lab-export`.
- Chat renders (`/lab-export`, `three_*` tools) keep their own rules.

## For the patch notes
- **Your render now matches your loop.** The Render card starts with a new choice, **What to render**: **Full song**,
  **Loop**, **Sequence** (when the scene is in one) or **Custom** (from – to).
- If you have a loop on when you open it, **Loop** is already ticked, and it tells you exactly what you'll get:
  "Your loop: 0:32 – 0:48 (16 s, 8 bars)". The video is exactly that long, starting on the first frame of the loop,
  with the music cut to match.
- **Full song** really is the whole song now (before, without a preset, you got 10 seconds).
- The presets still choose for you (the reel picks the drop, Seamless loop uses your loop), and the chips show what
  they picked. Click another to change it.
- Each project remembers your choice. Set a new loop and the card goes back to Loop.
- The check before a render shows the range too, with how long it will take.

## For Codex
- No Codex-owned file was edited (`astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
  `cloud-files.js`, `workbench-*`, `engine-watch.js` are unchanged).
- One new field on a project, written the same way as round 131's `renderPresets` / `renderLast` (through
  `Projects.changed(p, 'prefs')`): `p.prefs.renderRange = { kind: 'full' | 'loop' | 'seq' | 'custom', loop: '<a>-<b>'
  | null, custom?: [a, b] }`. It syncs with the project as an ordinary prefs field; nothing to merge specially.
