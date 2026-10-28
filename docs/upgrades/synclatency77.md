# synclatency77: save on one computer, see it on the other in seconds (round 77)

How long does "saved on the PC" take to be "there on the Mac"? This stream measured it end to end, found where the time
went, and cut Hearth's own share to well under 2 seconds for chats, notes, scenes and small files, idle or while replies
stream, without any new timer while nothing changes.

## How it was measured
**`dev/synclatency77.js`** (new) runs two computers in one Node process, each with the app's **real sync main side**
(`syncmain.js`: its watchers on the data folder and the cloud folder, its debounces, its pass scheduling) and the real
engine, over the two-computer simulator (`dev/sync-sim.js`) now able to run **in real time with realistic cloud delays**:
`upDelay` / `downDelay` (the client noticing a change, the network), `upRate` / `downRate` for big files, and
`keepMtime` (the file's own modified time travels with it, as iCloud / OneDrive / Dropbox do). Profiles:
**icloud** (2 s to go up, 3 s to come down, 20 / 40 MB/s) and **fast** (0.5 s each way, Dropbox on a LAN).

Items: a chat message (`chats/<id>.json`, 120 messages), a project's notes (`kv/projects.json`), a Lab scene save
(`kv/three-sketches.json`, 2.3 MB), a small picture (180 KB) and a big video (48 MB, the big-file lane). Both
directions; **idle**, and **busy** = a reply streaming on both computers (its chat saved 4× a second, replies counted
as running). For each item: save → in the sender's cloud folder (**up**, Hearth), → delivered into the other computer's
cloud folder (**cloud**, the provider, not ours), → written into its data folder, → the window told (`sync:pulled`,
**down→window**, Hearth). Engine share = up + down→window.

On Linux, Node's own recursive `fs.watch` misses most saves that replace a file by a rename (every store save); the Mac
(FSEvents) and Windows (ReadDirectoryChangesW) hear each one. The harness therefore watches each folder plainly (what a
Mac / PC hears); `--node-watch` keeps Node's. `--root DIR` runs another copy of Hearth (the "before" below is this
round's base commit, `6a8482d`).

## Before → after (seconds; icloud profile; after = 2 runs each, a range where they differed)
Each cell: **up · down→window · total** (up + down→window = Hearth's share; the rest is the cloud provider: 5.0–5.3 s
for small items, 9.1 s for the video, the same before and after). Both directions measured; PC→Mac shown, Mac→PC was
within 0.1 s except where a range is given.

| item | idle, before | idle, after | busy, before | busy, after |
|---|---|---|---|---|
| chat message | 2.5 · 4.0 · 11.6 | **0.4 · 0.3 · 5.8** | 35.6 · 55.0 · 95.6 | **0.4 · 0.3 · 5.8** |
| project notes | 2.5 · 4.0 · 11.6 | **0.4 · 0.3 · 5.8** | 57.9 · 55.0 · 118.0 | **0.4 · 0.3 · 5.8** |
| Lab scene save (2.3 MB) | 2.2 · 4.1 · 11.5 | **0.4 · 0.2 · 5.9** | 58.0 · 54.9 · 118.1 | **0.5 · 0.2 · 5.9** |
| small picture (180 KB) | 2.5 · 4.0 · 11.7 | **1.2 · 0.2 · 6.6** | 57.9 · 54.9 · 117.9 | **0.5–1.2 · 0.1–0.2 · 5.8–6.6** |
| big video (48 MB) | 3.0 · 4.3 · 16.5 | **1.8 · 0.4–1.3 · 11.3–12.1** | 58.4 · 50.9 · 118.5 | **1.5–1.8 · 1.3 · 12.1** |

Hearth's own share after the cloud client delivered the file (down→window): **0.1–0.3 s for small items** (target
< 2 s), 1.3 s for the 48 MB video (its copy). Before: 4.0 s idle, 51–55 s busy. Worst of all after-runs above: 0.3 s
for small items. (Runs made with 6 measurements at once on this shared 4-CPU machine had outliers up to 3–4 s for
chat / notes, from the load: alone, every run was as above.)

**fast profile (idle)**: before, every item took 2.5 s up + 4.0 s down→window (7.6–8.0 s total for 1.1 s of cloud
time); after, chat / notes / scene 0.4–0.5 up + 0.2–0.5 down→window (≈ 2 s total), a picture 1.2 + 0.8 (it waits its
2 s settle), the video 1.7–2.0 + 1.3.

**Passes per item (idle, each side)**: before 2 (the copy sync makes on each side woke a second "echo" pass 2.5–4 s
later), after 1. Once calm: no pass and no pass armed (8 s watched, both computers); the calm check (every 1–5 min, as
before) is the only timer. A store saved every 2 s for 20 s (like the usage counts while you click around): 10 saves → 2 passes (one quick, one calm after the last save).

## Where the time went (and what changed)
| # | Where | Before | Fix |
|---|---|---|---|
| 1 | **The sender's debounce** | every change waited 2.5 s of quiet in the data folder | a store (chat, notes, scene, settings, any `.json` of the mirror) goes **0.4 s** after its save; other files 1.2 s |
| 2 | **The receiver's debounce on the cloud folder** | 4 s after anything arrived | a store arriving or **the other computer's journal** goes in **0.3 s**; other files 1 s |
| 3 | **While a reply streams** (busy) | the streaming chat's saves pushed every pass back to the 60 s cap: a note or a message sent meanwhile waited **35–58 s to go up and 55 s to come down (95–118 s end to end)** | a pass asked for by a store / an arrival is never pushed back by a hot file; the hot file itself (saved ≥ 3× in 3 s) keeps the calm debounce and is **held by the engine** while only this computer changed it (`hold`), let through once it calms down and at least every ~50 s (busy) / ~16 s: the chat still reaches the other computer during a long reply, without a pass every second |
| 4 | **The cloud folder unwatched after turning sync on** | the first pass makes `<drive>/Hearth/`; it was only watched from the next start, so on the first computer everything from the other one waited for the calm check (1–5 min) until Hearth restarted | after each pass, a cloud folder that exists and isn't watched is watched |
| 5 | **The other computer's journal ignored** | `.sync/` was ignored by the watcher: a store that landed before its journal line ("arriving") waited for the calm check | the other computers' journals are heard (this computer's own journal and the machine records still aren't) |
| 6 | **"Arriving" waited a minute** | a file still settling, a store whose journal line was late, a copy being checked: looked at again at the next calm check | a follow-up pass right when the file has stood its settle time (from its modified time), else after 1, 2, 4… 32 s, then nothing: no timer stays once nothing is on its way |
| 7 | **Echo passes** | sync's own copies into the cloud folder and the data folder woke a second pass on both computers | at the moment a pass is due, each file heard is compared (size + modified time) with what sync last wrote / read (`engine.knows`): only its own writes → no pass |
| 8 | **Stores just landed** | 2 s settle for every file | stores 0.5 s (`jsonSettleMs`): a half-written JSON never parses and stays "arriving" anyway; pictures / videos keep 2 s |
| 9 | **A store saved every 2 s** (new rule, so 1 doesn't cost more) | — | a store that just had its quick pass and is saved again within 6 s waits the calm debounce ("warm"); chats and project notes are never warm, and sync's own copies never make a file warm |

What did not need changing: the pass itself (≈ 0.1–0.3 s for small items here; the 2.3 MB scene is read on the store
thread in the app), the arrival → window path (`sync:pulled` is sent at the end of the pass; chats reload at once in
`sync.js`, scenes / projects / chat scenes on `hearth:synced`; storeack77 owns the store reloads), journal batching
(one flush per pass, uploaded with the file by every client we model).

Battery: on battery a store's quick pass waits 0.8 s instead of 0.4 s; hot files and other files keep the old calm
debounce ×2 and the 60 s cap, as before. Nothing new runs while nothing changes: the follow-up exists only while a file
is on its way (at most 6), the "hot" / "warm" / "heard" memory is three small maps trimmed on use.

## Upgrades
1. Chat messages, project notes, scene saves and settings go up 0.4 s after the save (was 2.5 s).
2. Arrivals in the cloud folder are picked up 0.3 s after they land (was 4 s).
3. The other computer's journal wakes the pass that was waiting for it.
4. While a reply streams, everything else still syncs within a second (was up to two minutes end to end).
5. A reply streaming into a chat is held while it streams and sent when it calms down (and at least every ~50 s).
6. Sync's own copies no longer wake a second pass on each computer (half the passes).
7. A file still settling is looked at again exactly when it can be read, not a minute later.
8. Stores that just landed are read after 0.5 s (a half-written one still never is).
9. The cloud folder made by turning sync on is watched at once (it waited for a restart).
10. A store saved over and over (usage counts) doesn't make a pass per save.
11. `dev/synclatency77.js`: the end-to-end latency harness (items, directions, idle / busy, profiles, `--root` for
    before / after, `--idlecheck`, `--churn`, `--first`).
12. `dev/sync-sim.js`: a real-time cloud provider (delays, rates, kept modified times).
13. `dev/synclatency77-test.js` in UNIT (group `synclatency77` in run-checks).

## Tests
- `node dev/synclatency77-test.js` (UNIT, ≈ 80 s): engine part (fake clocks) — `knows` for local / cloud / pulled
  files, a store 600 ms old is read with `jsonSettleMs` and still waits without it, a half-written store is never read,
  a picture still waits its 2 s; live part (real time, fast profile, the app's syncmain on two computers) — chat / notes
  / picture idle and busy: delivered → window < 2 s, saved → up < 2 s for stores, one pass per side per item (no echo),
  a store saved every 2 s makes ≤ 4 passes, nothing runs or is armed once calm, the cloud folder watched; `--first`:
  sync just turned on, an arrival is seen at once.
- Run on the final code: unit:synclatency77-test, unit:sync-test, unit:sync72-test, unit:synchard74-test,
  unit:syncstate75-test, unit:syncmedia73-test, unit:projsync76-test, unit:filewatch-test, unit:versions75-test,
  unit:twocomputers-test, unit:twocopies-test, unit:datasafe-test, unit:scenesafe-test, unit:chatkeep-test (14/14);
  app checks sync72, synchard74, idlecpu, lazy, unit:boot-test (5/5); scans unit:datasafe-scan, unit:errorcalm-scan,
  unit:winmac-test, unit:chatsafe-scan, unit:commandonly-scan (all pass). Group: `node dev/run-checks.js synclatency77`.

## For Codex
`sync-engine.js` (three small additions, each marked `(round 77, synclatency77)`; nothing changes when the options are
not passed, so every existing test runs the engine as before):
- `cloudHash`: `o.jsonSettleMs` (syncmain passes 500) is the settle time for a JSON store in the cloud folder; other
  files keep `o.settleMs ?? 2000`.
- the pass loop, right after the big-lane check: `o.hold(rel)` → a file changed only here (local not cached, cloud
  unchanged or absent) is skipped this pass, not counted as waiting. syncmain says yes while the file is "hot" (saved
  ≥ 3× in 3 s), at most ~0.8 × the calm cap in a row.
- returned API: `knows(side, rel, size, mtime)` → the state's cache (`state.local` / `state.cloud`) has exactly this
  version with a hash.

## Risks
- A real change that keeps the exact size and modified time of the version sync last wrote would be taken as an echo
  and wait for the next event or the calm check (the engine's own cache makes the same call already).
- A file saved ≥ 3× in 3 s for a long time (an app autosaving every second) syncs at most every ~16 s (≈ 50 s while
  replies run) instead of at the 20 s / 60 s cap; it goes as soon as it calms down.
- More passes while you work (one per store save instead of one per burst): each is small (the pass looks only at what
  changed, caches by size + time); warm files keep the old calm debounce.

## For the patch notes
- Changes now reach your other computer much faster: Hearth sends a chat message, a project note or a scene within
  about half a second after you save, and picks up what arrives within half a second after your cloud drive delivers it.
- While a reply is streaming, everything else you do still syncs right away (it could wait up to two minutes before).
- The reply itself is sent once it settles (and every minute or so during a long one), so sync doesn't work all the
  time while Claude writes.
- Turning sync on for the first time: what the other computer sends now arrives at once, without restarting Hearth.
- Hearth does half as many sync checks as before: its own copies no longer trigger another check.
- When nothing changes, sync does nothing at all, as before: no extra checks, no battery cost.
- How fast your cloud drive itself uploads and downloads is up to it (iCloud usually takes a few seconds).
