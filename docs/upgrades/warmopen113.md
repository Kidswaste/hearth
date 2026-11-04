# warmopen113: round 112's "unsure" warm open was noise; a project switch without forced layouts (round 113)

Round 112's perfguard A/B against `fdd0147` (labopen112's) flagged one row as "unsure": **project warm open (Hearth's
part) +478 ms (p 0.06)**, its window CPU +128 ms (p 0.3, ok). Neither of round 112's changes runs on a warm open, the
new side's box was busier (load up to 3.04 against 1.96), and nobody ran it again. This round ran it again, narrowly
and with many more samples: **it is noise**. No bisect was needed. perfguard's A/B now treats such a row the way its
compare mode has since round 82, and a narrow way to A/B one app row was added. Then a warm project switch on the
heavy profile was profiled with the name ▾ switcher, and three cheap forced layouts were taken out of it.

Everything ran in throwaway data: perfguard's heavy profile (`dev/bigprofile.js`, `/tmp/hearth-bigprofile72`: 40
made-up projects, 1,500 chats, 50 scenes), each app run on its own fresh profile (`dev/smoke.js`). No real data was
touched, nothing was deleted and nothing was uploaded.

## 1. The A/B again: noise

`node dev/perfguard.js --ab fdd0147 --only app --probe projects --warm 4 --runs 8 --lock` (43 min). `--probe` and
`--warm` are new (below): only the probe's projects section runs, with 4 warm opens a launch instead of 2. Base and new
launched in turn, 8 launches each, **32 warm opens a side** (round 112 had 6).

| metric | base `fdd0147` | new (round 112 + this round's perfguard change) | change | p | 95 % interval | verdict |
|---|---:|---:|---:|---:|---|---|
| **Project warm open (Hearth's part)** | 1234 ms | 1209 ms | **−24 ms (−2 %)** | 0.37 | −125 … +122 ms | ok |
| Project warm open: window CPU | 871 ms | 864 ms | −7 ms | 0.6 | −116 … +68 ms | ok |
| Project cold open (Hearth's part) | 278 ms | 274 ms | −4 ms | 0.31 | −35 … +85 ms | ok |
| Project switch (Hearth's part) | 881 ms | 755 ms | −126 ms | 0.98 | −264 … −64 ms | better (noise the other way) |
| Project switch: window CPU | 721 ms | 707 ms | −14 ms | 0.93 | | ok |

The box: calibration 51.2 vs 52.9 ms, the window's 32.5 vs 32.2 ms, the calibration never waited for a CPU (0.97 /
0.96×); the load rose during the run as other streams started (≤ 5.2 base, ≤ 5.8 new), on both sides alike.

**Why the row looked worse in round 112.** Its wall time swings far more than its CPU time does. Within one side here
the warm open took **0.52–2.81 s** (quartiles 1.0–1.4 s), its window CPU 0.65–1.14 s. A warm open from Projects
loads the preview page again in a new process (nothing is kept behind Projects unless "Keep the Lab ready" is on), and
"Hearth's part" (the click → ready, minus the scene's own page work) still contains that page's start: a process, its
1.1 MB of page and three.js, all waiting on CPUs and the GPU process. That is the part a busy box stretches. With 6
samples a side and the new side on the busier box, +478 ms with p 0.06 is what that spread gives. Per-launch medians
here: base 931–1472 ms, new 1120–1530 ms, overlapping throughout.

**Bisect**: not run. The slowdown isn't there to bisect (rounds 108–112's suspects, DeskPaint.held, ClickWatch,
eyes112, labopen112's early page and head start, syncfix111, signin111, are all inside this A/B's base or new side,
and the row is flat). Round 112's own changes don't run on a warm open (labopen112.md says why), and this run agrees.

## 2. perfguard: the warm-open row, load-aware (dev only)

- **A/B judging** (`judgeAB`): a wall time judged "unsure" (over its line, but not told apart from the noise) **whose
  CPU twin is ok or better** is now ok, with a note on its own line ("over the line, but within the noise and by
  waiting, not work (its CPU time … is ok: +128 ms, p 0.3)"). That is the rule compare mode has used since round 82
  (perfguard82); the A/B mode never had it. Round 112's row would have read ok with that note. A significant wall
  regression (p ≤ 0.05, interval above 0) is judged as before, whatever its CPU, and a regressed CPU time still fails.
- **4 warm opens a launch** instead of 2 (`--warm N`): the row's wall time swings 0.5–2.8 s, and 2 samples a launch
  were too few for it. A launch takes ≈ 5 s longer.
- **`--probe <sections>`**: the app part's probe runs only those sections (`projects`, `chats`, `lab`, `idle`,
  `memory`); the other sections' rows aren't measured on either side, so aren't judged. One row A/B'd in ≈ 2.5 min a
  launch instead of the whole app part. The options reach `dev/perfguard-probe.js` as `PERFGUARD_OPTS` in the `--lib`
  file perfguard already writes. Without them: as before.

## 3. A warm project switch on the heavy profile, profiled

New: `dev/warmopen113-probe.js` (a smoke script, not a pass / fail check). On the heavy profile, Clink (`pjbp0`: a
700-message chat, 14 related long chats, 4 scenes, 3 boards, 400 files, 220 captures, 120 renders) and two others are
each opened once and **left on the Lab** (their return point's tab `scene`), then the window reloads. Then: Clink from
its card (cold), **9 name ▾ switches** between the three (real mouse clicks through the DevTools protocol on the
project's name and then its row), and 2 warm opens from Projects. Per open: click → ready (the card gone, the Lab on
screen: the time until usable), → its chat drawn, the scene's own page work (as perfguard counts it), the window's
thread CPU, its long tasks (the scene's own page left out) and long animation frames. `window.WO_PROF = 1` (an
`--eval`) adds a CPU profile over the switches, split into its busy stretches with their heaviest functions.

What a switch is made of (before, medians of 27 switches): **ready 3.3 s**, of which **the scene's own page work ≈
2.6 s** (software GL here: its layers' contexts and shaders) and **Hearth's part ≈ 0.73 s**; **its chat drawn at
0.34 s**; window CPU 0.53 s; the longest window task 57 ms (21 of 27 switches had one over 50 ms, 5 over 80 ms, the
worst 105 ms). The window's DOM stays flat over 12 switches (4.7 K elements; checked, no growth).

The profile's biggest pieces, by where the window's thread spent its time:

| piece | cost here | what it is | done |
|---|---|---|---|
| **The timeline's "on screen?" look** (`tools/three-media.js` `checkOnScreen`) | **30.7 ms a switch** (max 43.5) | `checkVisibility` in a task right after `hearth:view` / `hearth:activate`: the window's style and layout were dirty from the switch, so it laid the whole window out there, and the frame laid it out again after the switch's next changes | **after the next painted frame** |
| **The Lab's park look** (`tools/three.js` `syncPark`) | **16.4 ms a switch** (13 calls over 2 ms in 9 switches) | the same, for the preview's park state | **after the next painted frame** |
| The frame bar's hover look (`tools/three.js` `fbCheck`) | 20–45 ms when it hits (profiled) | the preview comes in under a resting pointer (the pointer was on the name ▾ menu's row): `mouseenter` → a `checkVisibility` with opacity 50 ms later, mid-switch | **after a painted frame** |
| The scene picker's owner colours (`chat-scenes.js` `paintPicker`) | ≈ 8 ms a switch (profiled: `ownerOf` + `summaryOf`) | `ownerOf` twice per scene (50 scenes), each a pass over the links and, for each match, a search of the 1,500-chat list | **one pass for all scenes** |
| The loading card's `showModal` (`project-workspace.js`) | 12–21 ms, and ≈ 15–20 ms of style at its `close` | a modal dialog makes the rest of the window inert: a style pass over every element | left (Codex's file; see "What's left") |
| The scene's run: its sliders panel for the selected layer (`three-tweaks.js` render) | 15–45 ms (profiled) | building the panel the Lab shows | left (it is what you see) |
| GC | the biggest single "function" | allocation across the switch | left |

The scene's own page work (≈ 2.6 s) is software GL (labopen112.md, projopen109.md): on the owner's GPU it is a few
frames.

## 4. What changed

1. **`tools/three.js` `syncPark`**: on `hearth:view` / `hearth:activate` the park state is looked at after the next
   painted frame (`requestAnimationFrame` → a task), several events giving one look, at most 200 ms later when no frame
   comes (hidden or covered window: then at once). After the frame the window's layout is clean and `checkVisibility`
   costs nearly nothing. The IntersectionObserver on the preview, the stall timer, `visibilitychange` and every other
   caller still call `syncPark` as before. A park or unpark can come up to one frame later than before; an open
   project's warm-up (`workspacePreparing`) holds the park off as before.
2. **`tools/three-media.js` `checkOnScreen`**: the same for the timeline's on-screen look (`hearth:view` /
   `hearth:activate`); `visibilitychange` and the once-a-second look while parked are unchanged. The timeline's own
   `tick` still reads its size each frame, so nothing is drawn for nobody meanwhile.
3. **`tools/three.js` `fbCheck`**: the frame bar's hover check (50 ms after `mouseenter`, 400 ms after `mouseleave`)
   reads after a painted frame; one pending check at a time (the latest wins: it reads the state then, so the result
   is the same).
4. **`chat-scenes.js` `ownersOf`**: every scene's owner in one pass over the links, the same answer as `ownerOf` for
   each (the newest link that isn't a guest's, to a chat that still exists; ties as before: the first). `paintPicker`
   uses it; every other `ownerOf` caller is unchanged.

Nothing is read or written in any store by these; the Lab's park, the timeline and the picker show the same things.

## 5. Before / after

Forced layout reads over 2 ms inside the 9 switches (`checkVisibility`, `getBoundingClientRect`, `offset*`,
`scroll*`, `client*`, `getComputedStyle`, `showModal`, `focus` wrapped and timed, the same run before and after; the
switch by `.click()`, so without the frame bar's hover case):

| | before | after |
|---|---:|---:|
| `checkOnScreen` (timeline) | 30.7 ms a switch, max 43.5 | 6.0 ms (5 of 9 switches, max 17.6: the window changed again after the frame) |
| `syncPark` | 16.4 ms a switch | **none over 2 ms** |
| all forced reads, a switch | ≈ 77 ms | ≈ 40 ms (the loading card's `showModal` 19 ms is most of what's left) |

The switch as a whole, `dev/warmopen113-probe.js`, base `98f439f` (an archive of it, run with `--app`) and this branch
run in turn, 3 + 3 launches a block (27 switches and 6 warm opens a side). Block 1 ran on the old container (load
2.6–4.3 from another stream's checks; the frame bar change not in yet); block 2 after the container restarted, on a box
about twice as fast (load 1–3). Medians; "longest" is each switch's longest window task, the scene's page left out:

| | block 1 base | block 1 after | block 2 base | block 2 after |
|---|---:|---:|---:|---:|
| **name ▾ switch: ready (usable)** | 3291 ms | 3317 ms | 1720 ms | 1851 ms |
| …of which the scene's own page work | 2384 ms | 2391 ms | 1434 ms | 1571 ms |
| …Hearth's part | 727 ms | 764 ms | 339 ms | 359 ms |
| its chat drawn | 339 ms | 324 ms | 194 ms | 196 ms |
| window CPU | 527 ms | 555 ms | 309 ms | 308 ms |
| longest window task: median / max | 57 / 105 ms | 54 / 109 ms | 0 / 69 ms | 0 / 64 ms |
| switches with a task over 50 / 80 ms | 21 / 5 of 27 | 20 / 4 | 1 / 0 | 2 / 0 |
| warm open from Projects: ready / Hearth's part | 5541 / 1315 ms | 4666 / 1078 ms | 2910 / 545 ms | 2372 / 450 ms |

**Honest reading:** the forced layouts are gone (the table above), but the switch's totals don't move by more than this
box's run-to-run noise. The window still lays itself out once per frame either way; what was cut was an extra, earlier
pass, ≈ 20–45 ms a switch, against 0.3–0.55 s of window CPU and 1.7–3.3 s until usable. The time until usable is the
scene's own start (software GL) plus the preview page's start; nothing else in Hearth's part was both cheap and safe.
On the faster box, 25 of 27 switches had no window task over 50 ms, before and after.

## For Codex
No Codex-owned file touched. One idea left for you (`project-workspace.js` `loading()`): the loading card's
`showModal()` restyles every element of the window to make it inert (12–21 ms here) and again at `close()` (≈ 15–20
ms of style in the next frame). A card that blocks clicks and keys without being modal would save both, but changes how
the card holds focus and Esc, so it's yours to weigh.

## What's left
- The loading card's modal, above.
- The scene's sliders panel built in the scene's run (15–45 ms profiled): what the Lab shows; projopen86 named it too.
- The scene's own page work (≈ 2.6 s of a 3.3 s switch here) is software GL; on the owner's GPU it is a few frames.

## Checks
CHECKS_SECTION

## Files
- `dev/perfguard.js`: `--probe`, `--warm` (4), the A/B's load-aware wall rows (with their note printed).
- `dev/perfguard-probe.js`: `PERFGUARD_OPTS` (sections, warm opens).
- `dev/warmopen113-probe.js` (new): the warm switch's measure.
- `tools/three.js` (`syncPark` and `fbCheck` after a painted frame), `tools/three-media.js` (`checkOnScreen` after a
  painted frame), `chat-scenes.js` (`ownersOf`).

## For the patch notes
- Switching projects with the name ▾ does a little less work: Hearth no longer stops in the middle of the switch to
  check what's on screen, it checks right after. The difference is small (a few hundredths of a second per switch).
- No slowdown in opening a project from Projects: last round's check thought it might have got slower, but measured
  again properly it is the same as before.
