# idleburst83: the first seconds after a start belong to you (round 83)

perfguard82 saw Hearth's main process at ≈ 17 % of a CPU through a 10 s "idle" in about half of its launches. The
owner's words: the hiccups are mostly gone, but the app "is just slow", and work Hearth does by itself after a start
takes the computer from whatever he does first. This stream measured what runs in the 0–30 s (and up to 150 s) after
the first picture, on the heavy profile (dev/bigprofile.js, 40 projects), and made that work wait, yield, share and
remember.

## How it was measured: `dev/idleburst83.js` (new)
- Each launch of the same app copy and Chromium profile (the owner's next start: caches warm, sync ON into a scratch
  cloud folder, the Lab marked as used lately so its warm page is made, as for the owner). The first launch is a
  warm-up and doesn't count.
- From the first picture (the window on screen with its first frame, main-process clock), every process of the launch
  is read from `/proc` every 500 ms. Nothing is asked of the app, so its own CPU stays its own. You get % of one CPU per
  process (main = Electron's browser process, all its threads; the window; other renderers; GPU; utility) per second and
  per 10 s, and the main process's busiest threads by name.
- `dev/idleburst83-tick.js` (loaded into the main process) adds four things:
  - a 20 ms tick that notes every time the main thread was held ≥ 40 ms;
  - every child process started;
  - every `fs.watch`;
  - every op asked of the store / files worker threads (summed per second).
- The window's long tasks (≥ 50 ms). `--prof`: sampling profiles of the main thread and the window, with the top
  functions per second and per hold. `--lazy`: when each feature group loaded and what touched one early.
- `--ab <exported base>`: base and new launched in turn (new, base · base, new · …) in the same minutes.
- `dev/idleburst83-recall.js` (new): the recall index's build cost on the store thread itself, from nothing and then
  on a second start.

## What was running (base 7b2a9f0, 10 launches + profiled ones)
1. **The recall index ("what did we decide about X?"): the 17 %, and worse.**
   - It was rebuilt from nothing at every start. It began 45 s after its group loaded, in 12 ms slices, the next
     slice asked as soon as the page was idle, so back to back.
   - Every slice listed the chats folder and statted every chat again (2,199 files, ≈ 13 ms) before it indexed
     anything. So a slice did ~3 ms of work for ~16 ms of thread time, ~50 slices a second.
   - Measured: from ≈ 50 s after the first picture, the main process at **80–97 % of a CPU for over a minute**. That
     was the store thread, `recall ×~520` slices per 10 s. The whole build took > 60 s of thread time. In
     perfguard's probe the "idle" chat section, 2 minutes in, sat at 93–102 % main-process CPU in all 3 launches
     here. That is perfguard82's bimodal idle: whether the build overlapped the count depended on when it started.
2. **About 45 feature groups loaded back to back ~6–8 s in.**
   - These are lazy.js's 'soon' groups: capture, command bar, flows, renders, apps, assets, notify, budget, recall…,
     each in its own idle callback. A quiet page has idle time all the time, so they came one right after another.
   - The window spent ~0.4 s of CPU in one second. The main process served their files (Chromium's file thread pool).
     Both were busy together for ~2 s, every start.
3. **The Lab's warm page**, for someone who used the Lab in the last 14 days (the owner):
   - a hidden preview page with three.js and the scene's shaders, made once the soon groups were in or after 6 s;
   - a new renderer process plus GPU work, at the same moment as point 2.
4. **🧭 Cost coach's weekly note, 2 minutes after every start** (found when the count went on to 150 s):
   - It read and `JSON.parse`d every chat changed in 7 days on the main process. That held it 70–140 ms at a time,
     ~0.8 s in all on the heavy profile, with the main process at 115 % for a second.
   - It did this again every start and every 6 h for as long as the week's note wasn't "due" (small savings), so in
     practice at most starts.
5. **The start itself** (unchanged, see "Not met"):
   - The first ~2 s: the first screen (Desk, its projects), then the groups marked asap: the Lab (350–520 ms of the
     window: the owner's most-used place, preloaded on purpose since round 29), the chat's commands, engine health.
   - Main at ~90 % in second 0 and ~30–50 % in second 1.
   - The only main-thread holds ≥ 40 ms after the first picture were in its first 0.4 s, in native code (window
     creation, the first screen's IPC answers), 41–81 ms.
6. **Looked at and left as they are:**
   - The startup sync pass: before the window reads data, ≤ 1.5 s, in 12 ms breaths. No hold ≥ 40 ms traced to it.
   - Engine checks: before the first picture.
   - The update check: 25 s in, a git child process.
   - ▶ Play warm-up: 20 s in, only if a game was played in the last 2 weeks.
   - The Sound desk host: only if used last session. Disk tidy: 10 min in. The backup: once a day when idle.
   - The chat list's rows: already cached. Find in this project: only when asked.
   - The GC around 28 s.
   - File watching: on Linux, Node's recursive watch arms 11,815 watches for the data folder before the window shows.
     This is Linux only: the Mac and Windows have native recursive watches. Noted, not changed.

## What changed
1. **Recall: one look at the folder per catch-up (c), kept on disk (d), slices paced (a).**
   - `storework.js` recall op:
     - A catch-up's slices share one listing of the chats folder, up to 2 s old (a question still looks again).
     - The index is saved in `data/.cache/recall-index.bin` once it has caught up after reading ≥ 25 chats.
       `recall-core.js` gains `snapshot()` / `createIndex(buffer)`: the packed term table, postings and each chat's
       messages, plus where each long chat's messages sit.
     - Each chat in the kept index is checked by size + modified time, so a start reads again only the chats changed
       since. A damaged or foreign file is refused, and the index is built again.
   - `recall-hooks.js`: 30 ms slices, and after each one a pause ≥ 8× its time. That is ≤ ~11 % of a CPU on that
     thread, and ~4 round trips a second through the main process instead of ~50.
   - `dev/idleburst83-recall.js` on the heavy profile's 2,199 chats:
     - a build from nothing went from > 60 s of thread time to **6.1 s** (563 slices);
     - **the next start: 1 slice** (≈ 0.5 s once, reading the 33 MB file included);
     - the same answer to the same question.
   - `dev/recall-test.js`: +3 checks (same answers / sizes / srcs after a round trip, changes after it, damaged files
     refused).
   - Automatic backups skip `data/.cache` (rebuildable caches, now ~33 MB more of them). Sync already never sends it.
2. **Cost coach: off the main thread (a), once a day at most (d).**
   - The look at each chat is parsed on the store's files thread (new `storework.js` op `costRecords`); only its
     per-reply records come back.
   - A week whose note wasn't due is looked at again at most once a day (`costcoach.js`, a per-computer note).
3. **A calm start (b), the groups one at a time (a)** (`lazy.js`):
   - The asap groups and the work keeper (safetynet: drafts and Lab work journaled from the first key) load right
     after the first frame, as before.
   - Every other 'soon' group waits until 10 s after the first screen AND 3 s without a key, click or scroll (30 s at
     most). Then they load one at a time, each in an idle moment, ≥ 120 ms apart.
   - Using a feature still loads its group at once (its stand-ins: commands, palette, globals).
   - `Lazy.calm()` reports the gate; `Lazy.calmNow()` opens it.
4. **The Lab's warm page waits for the same gate** (`tools/three-boot.js`). Opening the Lab before then opens it the
   usual way.
5. **Tests keep their old timing.**
   - `dev/smoke.js`'s wait for the feature groups, and `dev/coldstart-report.js`, call `Lazy.calmNow()`. So checks
     and perfguard's startup part start as they always did.
   - The gate itself is checked by `dev/checks/calmstart.js` (new; run without smoke's lazy wait) and measured by
     `dev/idleburst83.js`.
   - run-checks: group `idleburst83`.

## Proof
**A/B, 10 launches a side** (`node dev/idleburst83.js --runs 10 --sync --lock --ab <base 7b2a9f0>`, load 1–3, % of
one CPU, medians):

| after the first picture | base main | new main | base window | new window |
|---|---|---|---|---|
| 0–10 s | 18.2 | **13.8** | 22.5 | **12.9** |
| 2–12 s (the start done) | 9.8 | **5.0** | 12.9 | **5.1** |
| 10–20 s (the waiting groups now) | 2.9 | 8.0 | 0.5 | 12.1 |
| 20–30 s | 4.7 | 4.9 | 2.1 | 2.7 |

- Seconds 3–9 on the new side: main 3–5 %, window 0–2 % (base: two bumps, ~6–8 s, up to 32 % / 49 %).
- Worst main hold from 2 s on: base 42–81 ms in 3 of 10 launches; new 43 / 76 ms in 2 of 10.
- Window long tasks from 2 s on: base 6 of 10 launches (51–73 ms); new 3 of 10 (60–78 ms). This is not a clean
  "none", see "Not met".
- With the Lab marked as used (its warm page; 5 launches a side: the run was stopped by a time limit after 10 of 12):
  - 0–10 s: main 21.7 → 15.7 and window 23.8 → 14.9;
  - 2–12 s: main 11.1 → 6.1 and window 14.1 → 6.6.

**Recall, 110 s after the first picture** (new, 2 launches, with the first pacing: 12 ms slices 4× apart; now 30 ms
slices 8× apart, about half of this):
- The build starts ~60 s in, paced: the store thread at 13–18 %, the main process 18–27 % in all.
- Base: 80–97 %, still going at 100 s.
- **The next start, 150 s count.** Run 1 came after run 0 had caught up, and nothing about the chats had changed:
  - one recall slice, 150–178 ms on the store thread, at ~55 s;
  - cost coach skipped (it had looked that day);
  - the main process at 2.8–3.1 % (the idle floor here) from 70 s to 150 s.
- **Run 0 at 130–140 s:** cost coach's first look of the day. It read all 2,199 chats, because the fixture's copy makes
  them all "changed this week". It ran on the files thread: main process 15.6 % for those 10 s, and no hold ≥ 40 ms
  (base: 115 % for a second, holds up to 143 ms).

**perfguard A/B** (`node dev/perfguard.js --ab 7b2a9f0 --lock`, perfguard82's paired mode):
- **Everything, 52.7 min, load up to 3.9: 1 regressed · 2 better.**
  - Idle on a chat: every process **101 % → 20.2 %**, the window **4.1 % → 1.4 %**.
  - Start → first usable chat −3 %, start CPU −1 %. Sync: all ok.
  - The "regressed" row was project cold open, +78 ms (+22 %). That is one sample per launch, 3 against 3, so
    p = 0.05 is the smallest p it can reach. Its window CPU was not significant (+13 %, p 0.2). The new side's
    launches ran while this stream's own other measurements kept the box at load ≈ 3.9; the base side's were at
    ≈ 2.3.
- **The app part again, on a quieter box** (`--only app`, final tree, 18 min, load ≤ 2.7): **✓ no regression · 3 better.**
  - Project cold open +1 % (p 0.65).
  - Idle on a chat: every process **103 % → 14.8 %**, the window **4.1 % → 0.6 %**.
  - Chat list click CPU −11 %.
  - The idle main process is 93–96 % on the base side and 10.6–11.5 % on the new one. On the new side that is the
    first recall build, paced: each perfguard launch starts from a fresh copy of the data, so there is never a kept
    index. At the owner's next starts it is ~0 (above).

**Checks** (under the run lock):
- the `idleburst83` group: `calmstart`, `recall`, `costcoach`, `idlecpu`, `lazy`, `unit:boot-test`, `sync72`,
  `projects`, `labboot`, `backupauto`;
  - `sync72` failed once of 4 runs on the final tree: the panel wasn't there inside its 4 s wait, a timing step under
    load. Run again twice alone, it passed both times.
- `unit:recall-test` (28/28), `unit:store-thread-test`, `unit:costcoach-test`, `unit:backupauto-test`,
  `unit:bigchat82-test`, `unit:projsearch81-test`;
- the unit scans: `winmac-test`, `winmac49-test`, `datasafe-scan`, `errorcalm-scan`, `commandonly-scan`,
  `chatsafe-scan`, `storeack-scan`.

## Not met, and why
- **"< 5 % in the first 10 s after the first paint": not met** (main 13.8 %, window 12.9 %).
  - What's left is the start itself, in its first ~2 s: the first screen (Desk and its projects), and the Lab group
    preloaded because it's what the owner opens most (round 29). Holding the Lab back too would take ~4 points off
    the window's 10 s, but the first Lab open in those seconds would wait ~0.4 s.
  - After the start, from 2 s, both are at ~5 %, and from 3 s to 10 s at 0–5 %.
  - Making the start itself cheaper (compiled-code caching for the app's own scripts: `file://` gets none in Chromium)
    would be its own stream.
- **"No burst > 50 ms": not met for the start's own first ~2 s.** The window's first-screen and Lab-group tasks run
  50–95 ms; the main process's native work in its first 0.4 s holds 41–81 ms. After that:
  - the deferred groups each run in their own task (10–60 ms each);
  - a few launches still show one 60–78 ms window task or one 43–76 ms main hold. These were not attributed:
    rare, and under load.
- **Moved, not removed:** the groups' ~1 s of window CPU now lands at 10–17 s, spread out (window 12 % / main 8 % over
  that window), unless you're busy then. Then it waits for you.

## Notes
- The recall index file is ~33 MB on the heavy profile (110,000 messages). It is written at most once a session after
  ≥ 25 chats changed, ≈ 75 ms on the store thread, never on the window's or the main thread.
- The first start after this update still builds the index once, paced (~1–2 minutes at ≤ ~11 % of a CPU). Later starts
  don't.
- Linux test-box only: Node's recursive `fs.watch` arms one watch per file (11,815 here) at every start. The Mac and
  Windows use native recursive watches, so it was left alone.
- For Codex: nothing. No Codex-owned file was touched.

## For the patch notes
- Hearth no longer rebuilds its "what did we decide?" search from scratch after every start. On a big set of chats
  that used to keep one processor core fully busy for a minute or more, about a minute after you opened Hearth. It
  now remembers that search between starts, catches up only the chats that changed, and does so gently in the
  background.
- A calmer start. Right after Hearth opens, it now gives the computer to what you do first. The extras it prepares
  in the background (tools, menus, the Lab's warm-up) wait until the start is over and you've paused for a few
  seconds, then load one at a time. Anything you click still opens right away.
- The weekly "where your tokens went" tip no longer re-reads all of your recent chats on the main part of Hearth two
  minutes after every start. It reads them on the side, and at most once a day.
- Automatic backups no longer include Hearth's rebuildable caches, so they are a bit smaller and faster.
