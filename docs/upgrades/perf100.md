# perf100: did rounds 94–99 make Hearth slower? (round 100)

Round 93 (`perf93.md`) found no regression against round 85. Since then twelve streams landed: keptaside94, labload94,
aside95, labflake95, firstscreen96, checkfix96, labproj97, syncsweep97, syncrace98, bundle98, labmodels99 and kvrename99.
Several of them changed the save path (`store.settle` gates, `choiceWrite`, guard bases) and sync's passes (a per-file
path check). This stream compares HEAD (1aa8a85 + this stream's measuring code) against **63bb36f** (round 93 release)
with the load-aware guard, paired A/B: base and new launched in turn in the same minutes.

**Answer: nothing got slower except one thing that was meant to.** Every measure is the same as at round 93 within
the noise, or better. Saving is as fast as before, and so is sync's pass over 50,000 unchanged files. The first 30 s of
a start cost **1.3 s less CPU** (−22 %). The one row the guard flagged is the Lab's first open after a calm start, on a
profile with no Lab history: **+82 ms of window CPU, +100 ms before its preview frame shows.** It bisects to
**labload94** (the Lab loads when it's wanted, not at every start). That was the trade labload94 chose and wrote down,
and that's where the 1.3 s comes from. It is mostly hidden in real use, because a pointer resting on the Lab's button
loads the code before the click. It is not reverted (below). One cheap cost was taken off on the way: the chats list's redraw.

## What perfguard was missing, and what was added (dev only)
- **Send-and-save** (app part, `dev/perfguard-probe.js`): 5 messages sent in a long chat (778 messages, 600 KB), the
  fake engine answering:
  - `chat.sendSaved`: send → the chat's file changed on disk. `window.hub` is frozen (contextBridge), so the IPC can't
    be wrapped; `fs:stat` is polled every 2 ms instead.
  - `chat.saveIpc`: that chat saved again whole, `hub.saveChat` → its answer (it answers once the store thread wrote it,
    past sync's gates).
  - `chat.sendCpu`: a send turn's main + window CPU.
- **Send-and-save in the giant chat** (part `fresh`, `dev/perfguard-fresh.js`): 3 messages sent in the 6,000-message
  chat, whose saves go by what changed (`saveChatDelta`) → its file changed on disk (`fresh.bigSendSaved`).
- **Part `labcold`** (`dev/perfguard-labcold.js`, opt-in, `--labcold N`, ≈ 40 s a launch): the Lab pressed 3 s after
  the first screen, while the start is still busy. `fresh` already measured the press after a calm start of 5 minutes.
  `--eval "window.PF100_LAB_AT = 60"` presses later (used for the bisect below).
- **Part `many`** (opt-in, `--many N`, ≈ 3.5 min a run): each side's own `dev/synchard74-test.js --only many --many 50000`
  (Node only, a temp folder): the pass with nothing changed (wall time and the longest event-loop stall), and the first
  pass. The base runs its own copy of the test, so each side's engine and simulator are its own.

Run it all: `node dev/perfguard.js --ab <ref> --lock --only startup,app,fresh,sync,labcold,many` (≈ 2 h with the lock
shared with another stream's checks).

## Before / after
`node dev/perfguard.js --ab 63bb36f --lock --only startup,app,fresh,sync,labcold,many` (120 min, load ≤ 5.2 on 4 CPUs
during startup and sync, ≤ 2.7 during app, ≤ 1.9 during fresh; the run lock was shared with the modeltex100 stream's
checks). Medians of every sample per side; p = one-sided Mann–Whitney that new is slower.

| measure | round 93 | now | p | verdict |
|---|---:|---:|---:|---|
| **Startup** (9 cold starts a side, heavy profile) | | | | |
| Start → first usable chat | 1040 ms | 1050 ms | 0.62 | ok |
| Start → first picture (splash) | 778 ms | 1110 ms | 0.46 | ok (± 800 ms between starts here) |
| Start → usable (every early feature in) | 7514 ms | 7381 ms | 0.5 | ok |
| Start → first screen: CPU, main + window | 5580 ms | **4300 ms** | 1 | better (−23 %) |
| First 30 s: CPU, main + window | 5820 ms | **4540 ms** | 1 | better (−22 %) |
| **Idle** (a fresh start left alone) | | | | |
| Idle at 1 min: every process / main / window | 15.2 / 14.5 / 0.5 % | 14.8 / 14.1 / 0.6 % | 0.6 | ok |
| Idle at 5 min: every process / main / window | 0.7 / 0.6 / 0.1 % | 0.7 / 0.5 / 0.1 % | 0.8 | ok |
| Idle on a chat after using the app: every process | 6.7 % | 5.6 % | 0.5 | ok |
| **Memory** | | | | |
| After start (30 s): window / main / store thread JS heap | 16 / 11.3 / 5 MB | **13.5** / 11.4 / 5 MB | | ok (window −2.5 MB: labload94) |
| Window JS heap after the whole app run | 32.4 MB | 32.5 MB | 0.05 | ok (+0.1 MB) |
| **Projects** (Hearth's part · window CPU) | | | | |
| Cold open | 274 ms · 524 ms | 320 ms · 585 ms | 0.35 · 0.2 | ok |
| Warm open | 1191 ms · 901 ms | 861 ms · 964 ms | 0.65 · 0.29 | ok |
| Switch | 704 ms · 716 ms | 623 ms · 712 ms | 0.58 · 0.42 | ok |
| **Chats** | | | | |
| Long chat opened from its list row (· window CPU) | 217 ms · 120 ms | 212 ms · 115 ms | 0.46 | ok |
| Giant chat (6,000 messages) opened (· window CPU) | 853 ms · 235 ms | 842 ms · 219 ms | 0.65 | ok |
| Typing in a long chat: key → paint | 6.3 ms | 5.6 ms | 0.98 | ok |
| Typing in the giant chat: key → paint | 4.8 ms | 4.9 ms | 0.15 | ok |
| **Send and save** (new measures) | | | | |
| Send in a long chat → on disk | 129 ms | 101 ms | 0.95 | ok |
| A long chat saved whole: call → written | 71 ms | 68 ms | 0.63 | ok |
| Send turn: CPU, main + window | 490 ms | 480 ms | 0.68 | ok |
| Send in the giant chat → on disk (saved by what changed) | 433 ms | 392 ms | 0.87 | ok |
| **Settings** | | | | |
| First open (window CPU) | 268 ms (96) | 107 ms (90) | 0.95 | ok |
| Opened again (window CPU) | 87 ms (58) | 58 ms (59) | 0.9 | ok |
| **The Lab** | | | | |
| Cold first start (pressed 3 s in): press → preview on screen | 122 ms | 123 ms | 0.56 | ok |
| … press → first frame | 3814 ms | 3791 ms | 0.44 | ok |
| … window CPU | 408 ms | 409 ms | 0.76 | ok |
| After calm (5 min in): press → preview on screen | 166 ms | 266 ms | 0.35 | ok (+100 ms, not significant) |
| … press → first frame | 2778 ms | 2591 ms | 0.9 | ok |
| … window CPU | 462 ms | 544 ms | 0.05 | **REGRESSED** (+82 ms): labload94, below |
| Tool call, end to end (· CPU, main + window) | 25.5 ms · 236 ms | 19.5 ms · 264 ms | 0.93 · 0.07 | ok · "unsure", measured again below |
| **Sync** | | | | |
| Steady pass (heavy profile, slow disk): stall · CPU | 21.3 ms · 679 ms | 19.7 ms · 726 ms | 0.94 · 0.27 | ok |
| Small-change pass: stall · CPU | 20.7 ms · 710 ms | 22.3 ms · 742 ms | 0.31 · 0.63 | ok |
| **50,000 files, nothing changed: pass** | 10119 ms | 9926 ms | 0.83 | ok |
| … its longest event-loop stall | 69 ms | 65 ms | 1 | ok |
| 50,000 files: first pass (all up) | 73.4 s | 80.6 s | 0.17 | ok (± 6 s between runs) |

Each `many` run "failed" synchard74's own stall budget (150 ms) on both sides alike: in the first pass, the Mac's join
or the folder rename, 250–330 ms, on a box at load 3–5. The steady pass, the one asked about, held the loop 65–71 ms
at most on both sides. kvrename99's per-file path check costs nothing measurable: one length comparison per name.

**The save path.** The A/B can't see sync's gates in the app runs, because sync is off on the test profiles. So the
store's own save was also timed in Node: `store.js` + its thread from each tree, a copy of that 600 KB chat saved
40 times. Base **11.2–13.7 ms**, now **11.8–13.4 ms** a save (main + thread CPU 9.0–9.5 vs 9.9–11.2 ms), three runs
alternating. With sync on, a save adds one `gates.size` check (0 when sync isn't writing) and `beforeWrite` as before.
`store.settle` only costs when sync writes a store that has a save on its way (syncrace98's "Cost").

## The flagged row: the Lab's first open after a calm start
**Bisect.** A launch on the heavy profile (no Lab history: labload94's mode `none`), the Lab pressed 60 s after the
first screen (`dev/perfguard-labcold.js` with `PF100_LAB_AT = 60`), 3 launches per tree, alternating. Medians:

| tree | press → preview on screen | window CPU |
|---|---:|---:|
| 63bb36f (round 93) | 172 ms | 412 ms |
| 7c34383 (keptaside94, just before labload94) | 181 ms | 456 ms |
| **50e3b0d (labload94)** | **296 ms** | **576 ms** |
| e78bcba (labflake95) | 327 ms | 558 ms |
| 2995a86 (labproj97) | 275 ms | 552 ms |
| HEAD | 273 ms | 532 ms |

The step is labload94 and nothing after it: labflake95, labproj97 and labmodels99 added Lab code, and they didn't add
to the first open.

**Cause.** labload94 stopped loading the Lab's code (≈ 3.4 MB) right after the first frame of every start. A profile
that hasn't opened the Lab in 14 days (or has no history, like these test profiles) loads it on intent: a pointer moving
onto a button that opens the Lab, a Lab line in Ctrl/⌘+K, or the Lab shown. The probe opens the Lab without a
pointer (`activate('tool:three')`), so the code loads on the press: the extra ≈ 100 ms before the preview shows and
≈ 80–120 ms of window CPU. labload94 measured and wrote down exactly this as its worst case ("the first open after two
weeks without the Lab: +≈ 200 ms shown"). It also measured the real click: with the pointer on the button for 300 ms
first, the open is the same as before (55 vs 53 ms shown, 109 vs 105 ms CPU).

**Not reverted.** The fix with behaviour unchanged is labload94's own undo: load the code at every start again. That
costs every start the **1.3 s of CPU in the first 30 s** and 2.5 MB of window heap measured above, to save one first
open ≈ 0.1 s, and only when it is opened without the pointer. A middle way would be to load it in `none` mode too, late
and in idle moments (e.g. 2 minutes in, 10 s without input). That gives back the open after calm, but every session
that never opens the Lab pays ≈ 0.3 s of CPU and 2.5 MB again. That is a product choice, so it's listed under "What's
left" and not made here.

## The doubtful row, measured again
- **Lab tool call: CPU, main + window** (+27.5 ms, +12 %, p 0.07, "unsure"). The app part again on its own:
  `--ab 63bb36f --only app --runs 4` (28 min, load ≤ 2.1, with this stream's chats-list change in): **✓ no regression**,
  every row ok. That row came out 293 → 245 ms (−17 %, p 0.92). The first run's +27.5 ms was the box's minutes, not
  work. Send in a long chat → on disk 94 → 83 ms, a whole save 62 → 60 ms, the send turn's CPU 435 → 440 ms.

## What this stream changed
1. **The chats list finds a project chat by id** (`projects.js` `summary`, Codex's file, a marked edit). Each redraw
   of the chats list asks, for every chat row in a project, for that project's chats (`chatsOf` → `summary(id)`). Each
   ask scanned every chat in `H.chats` (`find`): with 2,200 chats and 40 projects that was ≈ 6 ms of a 14–20 ms redraw.
   The list redraws after every save of the chat on screen (a send, a reply), every open, and every project change.
   Now it looks up a `Map` by id. The map is made again whenever `H.chats` is a different list. `H.chats` is only ever
   replaced, never changed in place (all 18 assignments checked), so the map can't go stale. It returns the first
   chat with that id, as `find` did. Measured on the heavy profile (`Panel.render()` ×20 after a fresh `H.chats`, as a
   save does; 2 launches each, alternating): **19.8 / 14.1 ms → 15.4 / 11.1 ms** a redraw (−22 %). `summary` went from
   6.2 ms to 0.6 ms (making the map).
2. **Measuring code** (above): `dev/perfguard.js`, `dev/perfguard-probe.js`, `dev/perfguard-fresh.js`,
   `dev/perfguard-labcold.js` (new).

## What's left
- **The Lab's first open without a pointer, in `none` mode** (above): +≈ 0.1 s. The option is a late idle prefetch in
  `none`, for ≈ 0.3 s of CPU and 2.5 MB in every session that never opens it.
- **A long chat (under 800 messages) is saved whole on every change.** A send turn makes 3 saves. Each sends the
  whole chat (600 KB for 778 messages) through IPC: ≈ 68 ms call → written, of which the store's own work is ≈ 12 ms;
  the rest is copying it from the window to the main process. Giant chats (≥ 800 messages, `BIG_MSGS`) already save by
  what changed. Lowering that line would cut this, but it changes which chats take the delta path (shapes kept per
  message, sync's guard falling back to whole saves). It's a stream of its own, with chatsafe / storeack checks.
- **The rest of a chats-list redraw** (now ≈ 11–15 ms with 2,200 chats): `chatsOf(project)` is made again for each
  chat row of that project (`panelSkip`), with `Makes.roomOf` and `ChatUX.metaOf` per item. Caching it per redraw needs
  a redraw boundary that Panel doesn't give projects.js today.
- **The busy minute after a first start** (14–15 % of a CPU at 1 min) is still the recall index being built on the store
  thread, as in round 93: the same on both sides.
- Round 93's Codex items: `questjournal` / `questcore` still load ≈ 17 s into every start. (`creative` at 0.7 s is gone:
  labload94's pointer-movement rule fixed it.)

## Checks
All app checks ran under `flock /tmp/hearth-run.lock`, at most 5 per run, with `TMPDIR=/tmp/pf100` (since removed).

| What | Result |
|---|---|
| perfguard A/B against 63bb36f, `startup,app,fresh,sync,labcold,many` (120 min) | 1 regressed (the Lab's first open after calm: labload94, above), 3 better, the rest ok |
| perfguard A/B against 63bb36f, `app --runs 4`, with the chats-list change (28 min) | ✓ no regression |
| Bisect of the flagged row (6 trees × 3 launches, pressed 60 s in) | the step is at labload94 (table above) |
| `idlecpu calmstart fastboot lazy projects` | ✓ 5 / 5 |
| `chatwindow72 sync72` | ✓ 2 / 2 |
| unit: `datasafe-scan winmac-test errorcalm-scan storeack-scan chatsafe-scan chatwin-scan boot-test lazymanifest-test syncrace98-test synchard74-test` | ✓ 10 / 10 |

The first screen is unchanged: **1686 / 1696 KB**, 64 scripts (`unit:boot-test`). `projects.js` is in the lazy
`projects` group.

## For Codex
`projects.js` (marked `(round 100, perf100)`): `summary(chatId)` looks the chat up in a `Map` by id. The map is made
again whenever `H.chats` is a different array. Same answer as the old `find` (the first chat with that id, or null).
If anything ever changes `H.chats` in place (`push`, `splice`, an index assignment), it must also replace the array, or
clear `sumOf`. Nothing does today.

## For the patch notes
- We checked whether the last six updates made Hearth slower. They didn't. Starting up, sitting idle, memory, opening
  projects and chats, typing, sending and saving messages, Settings, the Lab and sync (also with 50,000 files) are as
  fast as before. Starting up uses about a fifth less computer power than six updates ago.
- If you open the Lab for the first time in two weeks with a keyboard shortcut, it can take about a tenth of a second
  longer to appear. That's the other side of Hearth no longer loading the Lab at every start. Pointing at the Lab's
  button first hides it.
- The chats list redraws about a fifth faster when you have many chats in projects (after each message, and when you
  switch chats).
