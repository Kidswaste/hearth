# Round 174 · audit174: speed's restart card, and a fresh audit outside the Lab

Two parts: (1) why `dev/checks/speed.js` failed its restart step on rounds 157–173 ("after a restart: one card, the Lab
scene first, the last render too · it names the scene · one click goes back to the Lab"), bisected and fixed; (2) a
fresh audit with `dev/audit166-measure.js` on round 173's main, re-ranked, and one safe fix with no visible change. The
Lab, Scenes v2, the Lab's CSS, Codex's files and the off-limits areas were not touched.

## 1. speed's restart step

**Bisect.** Run the same way rounds 160–173 did (`node dev/smoke.js --fake-engines --script dev/checks/speed.js`, on
copies through `--app`, then each copy with its own `dev/`):

| Copy | With this checkout's `dev/` | With its own `dev/` |
|---|---|---|
| round 173 (51b47d50), round 165 (e122bd74) | fail | fail |
| round 160 WIP before / after its look-picker group (eb679448^ / eb679448) | fail | — |
| round 94's first parent (50e3b0dc^1) | fail | **pass** (`{"card":["lab","render"]}`) |
| round 94's merge, labload94 (50e3b0dc) | fail | **fail** |

So the app's code was never the cause: every app copy fails with today's `dev/smoke.js` and the old app passes with
its own. The break is **c08b271f** (labload94, round 94), in `dev/smoke.js`.

**Cause.** Before each part of a check, smoke.js waits (up to 60 × 500 ms) until the lazy groups that load by
themselves are in. Round 94 added `Lazy.state().forEach((g) => { if (…) Lazy.load(…); })` to that expression. smoke's
`run()` wraps an expression in `return (…)` unless it contains `return` or a `;` followed by more text (round 35's rule
for multi-statement `--eval`s); the `;` inside the forEach's braces made it run the whole line as statements, with no
return value. The wait never saw `true`: **every part of every check has waited its full 30 s since round 94** (plus
`--wait`). speed's second part runs after a reload: the pick-up card comes up 3.5 s after the page loads (the hints
queue's notice) and goes by itself after 20 s; the part started at ≈ 35 s, so the card was always gone. The card and
`SpeedResume` were right all along (`SpeedResume.prev` and `items()` gave `lab, render` in the failing runs).

A second, smaller thing showed once the wait worked: since round 160 (boot160) `appdialogs` is `after: ['lookpicker']`,
an on-use group, which makes it a "following" group (lazy.js: a 'soon' group after a 'use' one waits for it) that only
loads once the look picker is used or Settings opens. The wait counted every following group as "will come in", so it
would still have timed out. In the app that is fine (Settings loads both on open: 70 ms here); the wait now skips a
following group whose dependencies nothing loads by itself.

**Fix** (`dev/smoke.js`, the test harness only): the wait's expression carries its own `return` and treats a following
group as pending only when what it follows will come in by itself (loaded, loading, background-loaded, a 'soon' group,
or a following group that will). speed passes (92 s → 60 s for the check); every check part now starts when the groups
are in (≈ 6.5 s after the page loads here, was ≈ 35 s), so checks run up to 30 s faster per part. Nothing for the Lab's
owner: Scenes v2 reports its scene to `SpeedResume` correctly and the check is right for the design.

## 2. The audit (round 173's main, this box)

`node dev/smoke.js --fake-engines --keep --check-timeout 1500000 --script dev/audit166-measure.js` (round 166's session:
settle, idle, 3 projects × 2 chats of 400 turns, open, scroll, a 40 K stream, Settings ×2, Trim, the command bar,
project switches, the Mood board, hidden 60 s, idle, then Forgeheart). 4 shared CPUs, software GL (the GPU process is
SwiftShader: its numbers are 10–50× a real card's), Xvfb 1480 × 940.

| Area | s | Window CPU | Window tasks | GPU proc. CPU | Main CPU | Long tasks | Writes | Notes |
|---|---:|---:|---:|---:|---:|---|---:|---|
| Start | | | | | | | | first paint 252 ms, DOMContentLoaded 193 ms, heap 25.7 MB → 11 MB settled, 4 processes |
| Idle, chat open | 30 | 20 ms | 18 ms | 10 ms | 130 ms | 0 | 3 | window 0.3 wakeups/s, main 2/min |
| Open 6 long chats | 3.5 | 530 | 484 | 8.5 s | 70 | 0 | 1 | |
| Scroll 40 wheel turns | 11.8 | 1,340 | 1,193 | 31.1 s | 190 | 0 | 6 | |
| Stream 40 K | 12.7 | 1,390 | 1,180 | 29.0 s | **730** | 0 | 75 | main 919 timer wakeups/min (the 60 ms batch), crashsafe 66/min |
| Settings ×2 | 3.7 | 490 | 397 | 4.0 s | 120 | 1 (55) | 0 | 21 rAF/s from gpu52's refresh measure; opens 70 / 45 ms |
| Trim Hearth | 2.2 | 290 | 284 | 1.7 s | 50 | 1 (96) | 0 | first load of its group |
| Command bar ×3 | 4.9 | 230 | 171 | 2.3 s | 70 | 0 | 15 | |
| Switch projects ×6 | 5.9 | 460 | 389 | 10.2 s | 80 | 0 | 0 | |
| Mood board | 5.5 | 120 | 112 | 4.7 s | 70 | 0 | 25 | first board created (fresh data folder) |
| Hidden 60 s | 62 | 530 | 227 | 0.7 s | 60 | 0 | 21 | mem154's one trim; 3 stores saved on hide |
| Forgeheart idle (right after the look change) | 30 | 20 | 14 | 3.2 s | 90 | 0 | 0 | one full raster of the new look (3.3 s in the first 5 s, then 0) |
| Forgeheart scroll | 13.2 | 1,400 | 1,344 | 40.8 s | 160 | 0 | 7 | |
| Forgeheart stream | 12.8 | 1,640 | 1,424 | 34.2 s | 620 | 0 | 63 | |
| Forgeheart switches ×6 | 6.4 | 880 | 700 | 14.8 s | 70 | 0 | 0 | |

Memory: the window's renderer 180 → 211 MB, JS heap 11 → 17.6 MB, DOM 2.1 K → 27 K nodes (the 3 chats kept ready out
of sight, 400-turn chats), all processes 598 → 776 MB at the peak. Disk after the session: data folder 1.8 MB (chats
1.5 MB), Electron profile 6.7 MB (5.4 MB `GPUPersistentCache`, which Disk calm cleans since round 167). First screen:
48 scripts / 1,061 KB of code, 20 sheets / 383 KB of CSS (budget 50 / 1,072 KB / 20 / **385 KB**).

### Ranked: the top remaining costs outside the Lab

| # | What | Measured | Fixable safely now? |
|---|---|---|---|
| 1 | **GPU-process paint** of scrolling, switching and dialogs: every frame that changes repaints / composites the window | scroll 31–41 s, 6 switches 10–15 s, a Settings open ≈ 1.5 s (software GL) | no: Chromium's raster; on a real card a fraction. Next: what a switch repaints (forge-switch is 45 % dearer than plain) |
| 2 | **Streaming, main process**: 730 ms in 12.7 s, 14 timer wakeups/s (engines.js' 60 ms batch, main162), crashsafe's reply copy 66/min, 63–75 file events a reply | 5.7 % of a core while a reply runs | by design (crash safety, the batch is what keeps the window calm) |
| 3 | **Memory**: renderer +31 MB and 25 K DOM nodes over a session (the last 3 chats kept ready), 600–780 MB all processes | | by design (instant switches); a smaller keep would be visible |
| 4 | **The text caret's blink** costs ≈ 110 ms of GPU-process time a second here while the chat box has focus (both looks; 0 when blurred). Linux stops blinking after 10 s, Windows and macOS blink on | 430–470 ms per 4 s focused | no: the caret is the system's; a visible change. Candidate: measure its damage on a real Windows card |
| 5 | **First-screen CSS** is 383 of its 385 KB budget | | the next CSS added to the first screen must move something out first |
| 6 | **Settings asked ~43 animation frames on every open** to time the screen (gpu52.js), for the same "· 60 fps" each time | 21 rAF/s while Settings is open; ≈ 10 ms of window CPU per open; GPU unchanged (frames with nothing new are free) | **fixed** |

Also seen, fine: a look change costs one full raster (≈ 3.3 s here) then nothing; the hidden window's one trim
(mem154); 3 small stores saved on hide (20 file events); Settings' first open loads `lookpicker` + `appdialogs` on the
click since round 160 (70 ms, then 45 ms). Startup (boot157 / boot160 / main162), idle wakeups and disk growth held.

## 3. The fix: the screen's pace measured once per screen

`gpu52.js` `info({ fps: true })`: Settings › Advanced › Graphics' line ("… · 60 fps · hardware video ✓") measured the
screen's refresh by asking 40 animation frames each time Settings opened (and on `/graphics`). It now keeps the number
for the screen it was measured on (screen size and position, scale) and measures again only on another screen, another
size or scale, or when the last measure gave nothing (a hidden window). A refresh-rate change on the same screen shows
from the next start. The line reads the same.

| Settings opened 5 times (2 runs each) | Before | After |
|---|---:|---:|
| Animation frames asked, first open | 51 / 52 | 51 / 51 |
| Animation frames asked, each later open | 43 | **2** |
| Window CPU, opens 2–5, mean | 113 / 108 ms | **103 / 95 ms** |
| GPU process, opens 2–5, mean | 1,663 / 1,553 ms | 1,610 / 1,513 ms (same: no-damage frames cost nothing here) |

Honest size: small. It was the only item in the top six that could change without a visible difference or a design
decision; the big ones are Chromium's paint (1) or deliberate (2, 3, 4).

## Next candidates

1. **What a project / chat switch repaints in Forgeheart** (14.8 s vs 10.2 s for 6 switches): the lights' layers, the
   ground's gradient under the list.
2. **The caret's damage area** on a real Windows card (does a blink re-composite only its line, or a layer the size of the
   composer?), only if it shows there.
3. **First-screen CSS headroom** (2 KB left): find first-screen rules only a later screen uses.
4. **The test harness**: with every check part now starting ≈ 30 s sooner, checks that leaned on that idle time may show
   up as flaky; fix them at their own waits (none did in this round's runs).

## Check

`dev/checks/audit174.js` (`node dev/run-checks.js --exact audit174`, group `audit174`): the check's part starts before
26 s after the page loads (≈ 6.5 s now; 35 s with round 173's smoke.js) with every self-loading group in, and
`appdialogs` not holding it; Settings opened twice: the first open asks ≥ 30 frames from gpu52.js, the second none,
and both show the same "· N fps" line. On round 173 (51b47d50 through `--app`) it fails the second-open step; with
round 173's own smoke.js it also fails the start step (35,208 ms).

RESULTS

## For the Lab's owner

Nothing to do for speed: its restart failure was the test harness (above), not Scenes v2 or the Lab's "last scene";
the Lab's scenes report correctly.

## For Codex

No Codex-owned file was edited. Checks now start as soon as the lazy groups are in (≈ 30 s sooner per part): a Codex
check that relied on that idle time may need its own wait.
