# Lab pictures drawn beside the preview (round 124, labdraw124)

Round 123's check sweep found six Lab checks failing: comp, comp-dispatch, gallery, instantscene and jam failed twice,
and labbridge72 failed once. Each one needs a page that draws next to the preview: precomp pages, the gallery's
shared stage, or the backstage. The symptoms were black or dim pictures, 1 of 3 gallery picks drawn, gallery and jam
timing out, and the preview at 0 fps.

**Verdict: an app bug, not a regression, and not "just the machine".** It was in the old code too. It shows on this
box because of its software GPU (SwiftShader). It is now fixed in `tools/three-sandbox.html`, and all seven checks pass
with no change to the checks.

## Old code against new code

| check | 0db24de (before round 116) | HEAD before the fix | after the fix |
|---|---|---|---|
| comp | ✖ nested precomp black `[0,0,0]`; small PiP precomp `ms: 0` | ✖ the same two steps, the same values | ✓ 143 s |
| instantscene | ✓ 76 s, then ✖ (1 of 3 picks), ✓ 71 s in the first batch | ✖ 3 times out of 3 (1 of 3 picks) | ✓ 70 s, ✓ 70 s |
| gallery | ✖ timed out at 240 s | ✖ timed out at 240 s | ✓ 117 s |
| comp-dispatch | (not run) | (sweep: ✖ twice) | ✓ 198 s |
| jam | (not run) | (sweep: ✖ timed out at 600 s, twice) | ✓ 193 s |
| labbridge72 | (not run) | ✓ 128 s | ✓ 84 s |
| labboot | (not run) | (not run) | ✓ 90 s |

0db24de was run from the sweep's export of that commit. Comp and gallery failed there in the same way as on HEAD, and
instantscene passed or failed by chance on both. A first bisect step on instantscene seemed to point at the
projchats116 merge (eb32083 failed), but 0db24de itself then failed on its second run. So the bisect was chasing
chance, not a merge. None of the named suspects (slim116, startup118's lazy jam, 32f499f's export antialias,
sendpath122, the frame gate) changed how these pages draw.

## The cause

Temporary logging of the gallery page's messages during instantscene showed this order every time:

1. A few seconds after the hidden gallery page started, it sent `frame-runaway` with
   `{"loopPerSec":3,"loopPerFrame":2,"callsPerSec":13,"screenHz":60}`. That is 3 calls a second, far under the
   limit of 240, but one loop had run twice inside "one frame".
2. Right after that, the guard dropped the next call of `lqFlush` (the layers' flush), `compositorTick` and
   `tickFrames`, all at once.
3. After that, no picture ever came back. Every `screenshot` (thumb) went unanswered and the gallery's 8 s wait
   returned null.

The frame runaway guard (round 109, labchecks109) counts how many times each of the page's frame loops runs in one
frame. It treats a call as the same frame as the last one when its frame time is equal. On this box's software GPU,
a page that is hidden or behind the window (the gallery stage, precomps, the backstage) sometimes gets two frames in
a row with the same time. So the guard trips on its own. After a trip it drops every call past the first in "one
frame". But the page's own loops record "a frame is coming" (`LQ.raf` for the layers' flush, and the compositor's and
the frame counter's own flags) until their callback runs. When the dropped call is the only one pending, that loop
never asks again and the page stops drawing for good. That explains every symptom:

- black or dim precomps;
- thumbnails and picks that never come back;
- the preview at 0 fps in jam's picture;
- the timeouts.

It depends on timing, which is why it came and went between runs and on both trees.

## The fix (tools/three-sandbox.html only)

`runDefer(w)` is new. When the guard drops a call, that loop gets one call in the next browser frame, unless the loop
has run since the drop (then it has already asked for its own next frame). Only one such call is pending per loop
(`w.__rq`). So a real runaway still runs at most once a frame plus at most one extra, and it can't grow through the
deferral. The guard's trip rule, its limits and its `dropped` count are unchanged. `window.__labRunaway.state()` now
also reports `deferred`. All marks are `(round 124, labdraw124)`.

Not changed: the guard can still trip on these same-time frames (its console line then says "3 a second against
60"). Now the trip only turns the frame gate off for that page, and nothing stops. Making the trip rule ignore
same-time frames would change what beat108 and realscene-lib measure (`peakLoopPerFrame <= 1`), so it is left alone.

## The checks

No check was changed. With the page drawing again, the existing waits are enough on this box: comp 143 s, gallery
117 s against its 240 s limit, and jam 193 s against 600 s. No "dim counts" leniency was needed, because the black
pictures were the bug and not software GL.

## Tests run

- Before the fix, on HEAD: comp, instantscene, gallery and labbridge72 (1/4 passed), then instantscene again ✖.
- On 0db24de: comp, instantscene and gallery (1/3 passed), then instantscene twice (✓, ✖). On eb32083 and 006d3bf:
  instantscene ✖.
- After the fix: `comp gallery instantscene labbridge72 labboot comp-dispatch jam`, **7/7 passed in 15 min**.
- beat108 (the only check that drives the guard with round 107's runaway, `bug107`), gallery and instantscene once
  more: **3/3 passed** (beat108 167 s, instantscene 71 s, gallery 119 s).
- `node dev/boot-test.js`: 2822 checks passed.

All of them ran with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package` and
`flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact …`.

## For the patch notes

- Lab: the hidden pages that draw beside the preview no longer stop drawing for good. These are the gallery's
  thumbnails, the Describe it picks, scenes inside scenes (precomps) and the AI's backstage pictures. They could come
  back black, dim or not at all, and a jam's preview could freeze. It happened mostly on computers without a
  graphics card (software drawing).

## For Codex

Nothing. No Codex-owned file was touched (no workbench-*, creative-vst*, astra*, codex-*, projects*,
project-workspace*, sync-engine.js, cloud-files.js or engine-watch).
