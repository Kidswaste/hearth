# Perf stream (round 3): fast to start, quiet when idle

Tonight the renderer grew from ~20k to ~55k lines (50 scripts, 15 stylesheets, 571 chat commands). This pass measured
where the time actually goes and fixed what mattered, without changing what you see or any saved data.

**How it was measured.** `node dev/perf-report.js` launches a throwaway copy (Xvfb, SwiftShader, fake engines) and
records CDP traces: startup reloads, script parse + eval per file, long tasks, memory after a GC, a 5 s idle window,
a long streamed reply, and `dev/checks/perf.js` (palette, "/" menu, first open of each tool, the Lab's frame time).
All before / after numbers below are medians of runs **interleaved** with the pre-perf build on the same machine
(12 startup reloads each), because other agents were sharing the 4 CPUs. Absolute numbers on your Mac will be lower;
the ratios are what count.

## Headline numbers (before → after)
| What | Before | After | Change |
|---|---:|---:|---:|
| Startup: window ready (first screen with rail, chats, active agent) | 398 ms | 217 ms | **−45 %** |
| Idle: timer wake-ups in 5 s / main-thread CPU | 13 / 0.9 ms·s⁻¹ | **0** / 0.3 ms·s⁻¹ | none left |
| Idle after visiting the tools (hidden Video Review + Lab) | 158 ms CPU per second, 240 frames / 4 s | 2 ms per second, 0 frames | **−99 %** |
| Streaming a long reply: main-thread busy | 3,059 ms | 2,320 ms | −24 % |
| … of which layout / style recalc | 550 / 476 ms | 200 / 310 ms | −64 % / −35 % |
| Lab first open (until drawn) | 133 ms | 106 ms | −20 % |
| Forgeheart Classic look, idle CPU | 43.6 ms·s⁻¹ | 28.9 ms·s⁻¹ | −34 % |
| Forgeheart (default look), idle CPU | 6.4 ms·s⁻¹ | 2.1 ms·s⁻¹ | −67 % |
| JS heap after startup | 3.6 MB | 3.5 MB | same |

## Upgrades
### Startup
1. All 50 renderer scripts load with `defer`: the browser fetches them in parallel instead of one after another
   (each file was a ~5 ms round trip). Same order, same globals; the first paint now shows the finished window
   instead of an empty shell. Window ready 398 → 217 ms.
2. The FX pack's ~150 filter layers build their code text the first time something reads it (same text, same
   API: `ThreeLayers.FILTERS[i].code`). Saves ~13 ms of script time at every start.
3. A startup mark (`hearth:ready`) so startup can be measured the same way every time.

### Idle: an idle Hearth runs nothing
4. New "what's on screen changed" signal (`hearth:view`, from `start.js`) replaces three polling timers: the token
   meter's 700 ms "which chat is open" poll, the unread check every 1.5 s and the window-title refresh every 1.5 s.
   The meter and title now update immediately instead of up to 0.7–1.5 s later.
5. The meter's midnight reset is one timer to the next midnight instead of a check every minute.
6. Video Review stops its every-frame loop when you leave it: hidden tools are `visibility: hidden`, which its
   "am I on screen" test didn't notice, so a paused, hidden player redrew 60× a second forever (the biggest idle
   cost: ~16 % of a CPU core after opening Video Review once).
7. Video Review's player only touches the page when the time / play icon actually changes (it rewrote them every
   frame, which also woke the usage tracker's observer).
8. Video Review's library auto-refresh (every 20 s) only runs while the library is on screen (same visibility bug).
9. The Lab's keyframe follower (10× a second) stops while the Lab is hidden and restarts when you come back.
10. The Lab sandbox's trigger meter timer (25× a second) only runs while the ⚡ Triggers panel is watching.
11. The Lab stops re-saving `three-lab-extras.json` every 5 s while a song is attached but paused.
12. Looping decorations (glints, dust, floats) pause on chat / tool surfaces you can't see; visible ones keep
    animating (Classic idle CPU −34 %).
13. The usage tracker ignores the token meter's ticking (it re-scanned toolbar buttons every 0.8 s while a reply
    streamed).

### Chats
14. Streaming replies swap in only the Markdown blocks that changed instead of rebuilding the whole reply 16× a
    second: finished paragraphs keep their DOM (layout −64 %, style −35 % on a long reply; checked to produce the
    exact same HTML on 779 mid-stream samples). Text you select in the finished paragraphs of a reply that is still streaming now stays selected.

### Tools
15. The Lab's first open no longer scans ~170 filter node types for the node editor up front: they are prepared in
    6 ms slices while the app is idle (everything that needs them still gets the full list).

### Measuring and guarding
16. `dev/perf-report.js`: startup (FCP, ready, interactive), script eval per file, CSS parse, style recalc / layout,
    long tasks, memory, idle CPU (timers, frames, style recalcs, which callbacks), a long streamed reply, the
    interaction check; `--trace` / `--startup-profile` / `--cpu-profile` save traces and JS profiles for DevTools;
    `--theme <look>` measures a look preset.
17. `dev/checks/perf.js` (also runs on its own with `dev/smoke.js`): palette and "/" menu open time, first open of
    the Lab / Video Review / Forge, the Lab's fps and frame time with three filter layers, running animations,
    CSS size / `:has()` count / full style recalc cost, a streamed reply's frame gaps.
18. Perf budget: `node dev/perf-report.js --budget --startup-only` fails when startup (ready, interactive, script
    time, main-thread time) is more than 30 % worse than `dev/perf-budget.json` (the pre-perf build fails it:
    371 ms vs a 282 ms limit). `--save-budget` re-baselines on a new machine.

## Measured and left alone (no gain, or not safe)
- **Lazy-loading tool modules / data files** (three-*, review, nodes-*, prompt library…): with `defer`, removing 16
  of them from startup changed "ready" by less than the noise; script evaluation is only ~30 ms in total (V8 parses
  function bodies lazily) and the heap is 3.6 MB. Not worth the risk of commands seeing half-loaded modules.
- **`content-visibility` for long chats**: full style recalc with a 300-message chat open dropped 97 → 13 ms, but
  opening the chat got ~20 % slower (the long-reply folding measures every message) and scrolling too. Not shipped.
- **CSS**: 353 KB, 3,167 rules, 11 `:has()` and no pathological universal selectors; a full style recalc of the
  window costs ~5 ms. Nothing to fix.
- **Palette / "/" menu**: the JS is ~1–6 ms; the first "/" menu's 300–450 ms (both builds) is its first paint under
  software rendering (SwiftShader, first use of the mono font), the second open ~60 ms.
- **The Lab's frame time** (SwiftShader, relative only): a rings layer alone ~10 fps, with three filter layers
  (datamosh bloom, RGB split, grain) ~4 fps; render calls themselves are < 1 ms, so it's GPU fill. Judge it on the Mac.

## Changes outside the perf lane (small, additive)
`meter.js`, `native.js`, `juice.js` (timers → `hearth:view`), `usage.js` (one selector), `tools/review.js`,
`tools/three.js`, `tools/three-sandbox.html`, `tools/three-nodes.js`, `tools/three-fx-filters.js`,
`tools/three-fx-cmds.js` (registers right away: with deferred scripts its timeout would have run after the Kit's and
lost `/ease`), `tools/video-cmds.js` (deferred-script aware), `app.css` (one rule).
