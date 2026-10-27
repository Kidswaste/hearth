# syncmedia73: big files and choice (round 73)

The owner syncs Hearth between a Windows PC and a Mac through a cloud drive folder. Chats and scenes are small; Lab
captures, renders, videos, session sketches, stems, photos and tickets are not. Before this round a 2 GB render going up
held every chat written meanwhile until the whole copy was done, each big file was read twice on the way up, and a half
copy sat in the cloud folder where the cloud client started uploading it as it grew. There was no way to say "not the
renders on this computer", and every big synced file took room twice on each computer (Hearth's copy and the cloud
drive's). This stream measured all of it in the two-computer simulator and fixed it.

## Measured: a 2.1 GB mix in the simulator
`node dev/syncmedia73-perf.js` (new): 98 files (2 renders × 400 MB, 4 Lab takes × 150 MB, 12 stems × 25 MB, 10 park
takes × 12 MB, 60 photos, 10 tickets) and 40 chats, PC → cloud → Mac through dev/sync-sim.js. "Before" = the same script
on this round's base engine (`--root`).

| phase | before | after |
|---|---|---|
| PC: the mix goes up | 39.6 s · **4,020 MB read** | 28–30 s · **2,225–2,249 MB read** (each big file read once) |
| a chat written 0.3 s into that upload reaches the cloud folder | **39.2 s** (waited for every video) | **2.7–2.9 s** |
| half-copied files sitting in the cloud folder (the cloud client uploads them as they grow) | 56 files, 1.7 GB | **0** |
| PC: steady passes (nothing changed) | 0 MB read | 0 MB read |
| quit halfway through a new 300 MB render, start again | resumed, 144 MB written | resumed, 144 MB written |
| Mac joins: everything comes down | 25.4 s | 22–24 s |
| a chat written on the PC while the Mac downloads the videos lands on the Mac | **24.7 s** | **3.6–5.5 s** |
| event loop, longest delay in any phase | 36 ms | 48 ms (one run had a single 245 ms spike in the Mac phase on the loaded machine; not seen again with `--trace-gc`) |
| Mac: Free up space (all 29 big files) | — | 2.1 GB made online-only, 18 ms; next pass: nothing downloads, nothing waits |

## What changed
- **Two lanes.** Files over 8 MB that aren't JSON stores (videos, renders, stems, big pictures) are hashed and copied on
  their own lane, one at a time, beside the passes. A pass plans them and goes on, so chats, scenes and settings never
  wait behind a big upload or download. After each big file the lane asks for a pass, so it settles at once.
- **Read once.** A new big file is hashed while it copies (it was read in full to hash it, then again to copy it). A
  renamed / moved big file keeps its hash (same size and time): moved in the cloud in one pass, never read or uploaded
  again. A file only touched (same bytes) is checked once, never uploaded. Unchanged big files are never read again,
  also after a restart.
- **No half uploads.** A big upload is put together in this computer's own sync folder (data/sync/parts) and moved
  into the cloud folder whole; the cloud client never sees a growing half file. On a drive where that move can't be a
  rename (another disk) it is copied over once.
- **Resumable, with progress.** A copy cut short (quit, crash, drive gone) goes on from where it stopped; each big file's
  progress (bytes done of total) is in the sync status, about twice a second while it moves.
- **What syncs.** Per kind, on this computer: Chats (with attachments), Projects & scenes, Lab captures, Renders, Music
  sketches & stems, Photos, Tickets (all on), and Instrument runtime (off: each computer installs its own; it used to
  sync a whole Python runtime between Windows and Mac). Off means sync leaves those files alone on this computer:
  nothing is deleted here or in the cloud, nothing counts as waiting, and the sizes still show. Turned on again, what is
  only on one side is copied to the other (a file deleted here while off comes back rather than being deleted
  everywhere); a file changed on both sides while off keeps both versions (one in Deleted files / conflicts).
- **Free up space on this computer.** A big synced file is on each computer twice: Hearth's copy (the one it uses) and
  the cloud drive's copy in its folder. On a click, after the list, Hearth asks the cloud drive itself to make its copy
  online-only: Windows Files On-Demand (`attrib -P +U`, then the attributes must say so), Mac iCloud Drive (`brctl
  evict`) or drives in ~/Library/CloudStorage (`fileproviderctl evict`), then checks the file has no blocks. Only files
  whose three versions agree (here, in the cloud, the last synced), over 8 MB, not moving; checked again right before;
  and the cloud drive itself refuses a file it hasn't uploaded. Nothing downloads them again afterwards; a new version
  from the other computer still arrives. Google Drive on Windows, a plain synced folder, a legacy Dropbox folder on the
  Mac and Linux get a plain "not possible with this cloud drive", with why.

## Upgrades
### Big files
1. Chats, scenes and settings never wait behind a big upload or download: big files move on their own lane.
2. A chat written while a 2 GB mix goes up reaches the cloud in about 3 s (it waited ~40 s).
3. A chat from the PC reaches the Mac while the Mac is still downloading videos (5 s instead of 25 s).
4. Each new big file is read once on the way up, not twice (half the disk reads for a first sync).
5. A renamed or moved video is moved in the cloud in one pass: not read, not uploaded again.
6. A big file only touched (same bytes) is checked once and never uploaded again.
7. No more half-copied videos in the cloud folder for the cloud client to upload as they grow.
8. A big copy cut short goes on from where it stopped (now also for files staged outside the cloud folder).
9. Progress per file: the sync panel shows each big file on its way with a bar, "↑ 640 MB of 1.2 GB · 52%".
10. Queued big files are listed by name ("a big file: it goes on its own, after the one moving now").
11. The bars move in place (no panel redraw for a percentage; a transform on one bar).
### What syncs
12. "What syncs" in the sync panel: a toggle per kind, with the size here and in the cloud.
13. Kinds: Chats, Projects & scenes, Lab captures, Renders, Music sketches & stems, Photos, Tickets.
14. Instrument runtime stays per computer (off by default): no more Python runtimes copied between Windows and Mac.
15. Turning a kind off says it plainly: nothing is deleted, the files stay here and in the cloud.
16. A kind turned off is never "waiting": the indicator still says ✓ Synced.
17. Turned on again: what's only on one side is copied over; nothing is deleted everywhere.
18. The fold says what's left out: "What syncs: everything but Renders".
### Free up space
19. "Free up space on this computer…": the big files already safe in the cloud, listed by name and size, first.
20. One click makes your cloud drive's copy online-only (Windows Files On-Demand, Mac iCloud Drive / CloudStorage drives).
21. Never an unsynced file: checked by Hearth right before, and by the cloud drive itself.
22. Freed files never download again behind your back; a new version from the other computer still arrives.
23. When the cloud drive can't do it, the panel says so in plain words and changes nothing.
24. The ⋯ menu of the sync indicator has "What syncs…" and "Free up space on this computer…".
### Safer underneath
25. The change journal is written by one writer at a time (the big lane and a pass ending together could lose a line).

25 upgrades.

## Tested
- `node dev/syncmedia73-test.js` (new, in UNIT): 104 checks in 7 scenarios through the simulator — **lanes** (a pass
  ends without waiting for a 24 MB video; it is listed "queued", then "moving" with its bytes; the half copy is in the
  sync folder, never the cloud folder; a chat written meanwhile goes up and reaches the Mac before the video; then the
  video lands whole; the journal announces each file), **rehash** (first upload reads each big file once; steady passes
  and a restart read nothing; a renamed 30 MB video is moved in one pass without being read; a touched file is checked
  once), **resume** (quit mid-copy, the next start writes ~half; a source that changed while stopped never makes a
  mix of two versions), **mix** (big files both ways through a slow provider with half downloads and clocks apart:
  identical, no duplicates, sizes per kind), **kinds** (off: nothing up, nothing down, a capture deleted on the PC stays
  in the cloud and on the Mac, chats still sync, still Synced; on again: everything on both; changed on both while off:
  both versions kept; per-computer runtime), **free** (only big synced files listed; changed-not-synced never freed;
  Mac dataless, Windows Files On-Demand and iCloud stub styles; nothing downloads again; a new version still arrives;
  the provider refusing a not-yet-uploaded file; a kind turned off isn't listed; no provider tool → unsupported),
  **evict** (cloud-evict.js: which tool per drive, the attribute / block checks after, the words when it can't).
- `dev/sync-sim.js`: big files hashed in steps and kept by the server as hard links (a 2 GB mix never sits in memory),
  sparse downloads, `view.evict()` (refuses a file not uploaded as it is), placeholders show no blocks to the engine.
- `node dev/syncmedia73-perf.js`: the table above (`--gb`, `--root` for before / after).
- `dev/checks/syncmedia73.js` (app, clicks): passes — the render's row "↑ Intro final.mp4" with a progress bar, not listed twice under Waiting; a chat saved meanwhile is in the cloud folder while the render still copies; the bar is the same element and its percentage rises (kept even when the panel redraws for the chat); done → row gone, render whole in the cloud, ✓ Synced; "What syncs: everything ›" opens 8 named toggles (runtime off), Renders "48.0 MB here · 48.0 MB in the cloud"; Lab captures off → "Nothing is deleted" toast, "everything but Lab captures", a new capture stays out of the cloud while still Synced, on again it goes up; Free up space opens its own view and, on this Linux box, says "Not possible with this cloud drive" with why and "1 big file, 48.0 MB, would qualify. Nothing was changed."; ‹ Back; the ⋯ menu has both rows and opens straight at Free up space.
- Also run (all pass): unit:syncmedia73-test, unit:sync72-test (+ `--thread`), unit:sync-test, unit:cloud-files-test, unit:winmac-test, unit:boot-test, unit:datasafe-scan, unit:errorcalm-scan, dev/twocomputers-test.js; app checks sync72, sync, lazy.
- Not testable here: real OneDrive / iCloud / Dropbox clients and their eviction (simulated from their documented
  behaviour; cloud-evict.js is unit-tested with fake tools); a real Windows `attrib` or Mac `brctl` / `fileproviderctl`.

## For Codex
All edits in `sync-engine.js` are marked `(round 73, syncmedia73)`; `cloud-files.js` is untouched (only used).
- The big lane: `LANE_MIN` (`o.laneMin`, default 8 MB), `lane` queue, `laneAdd` / `laneGo` / `laneDo` (`push`, `pull`,
  `hash` (side l / c), `pushNew` = hash while copying), `laneList` (status `transfers`, `moving`), `laneIdle()` (exported),
  `o.onLane` after each file that moved. `push` / `pull` take an optional `acc` ({ sum, pulled, onChunk }) so the lane's
  counters don't land in a pass's. `merge` of a big whole file pushes through the lane.
- In `passOnce`: `o.skip(rel)` (a kind off: dropBase, continue), in-lane rels pending ("moving" / "queued"), unhashed
  big files → lane (`goneSizes` / `laneSizes`: a delete that may be half of a rename waits a pass, op `later`), a moved
  file keeps its hash (`moved`: same size + mtime), big push / pull → lane, `status.kindSizes` (sync-kinds.js).
- `copyBig(src, dst, ent, expectHash, { stage, onChunk })`: staged parts in `data/sync/parts` (`STAGE`, swept by `purge`),
  EXDEV fallback, progress; `o.chunkWait` (tests only) holds a copy mid-way.
- Free up space: `freeCheck` / `freeable()` / `free(rels)` with `o.evict(file)`; `state.freed` (cleared by `setBase`);
  `readable` / `cloudReady` / the iCloud stub request let a freed file's NEW version download (`freedChanged`) and never
  re-request an unchanged one.
- `flushJournal` is serialised (`journalQ`).

## Edits outside the lane (small, additive)
`syncmain.js` (skip / onLane / evict / test-only chunkWait options; `sync:kinds`, `sync:freeable`, `sync:free`; `kinds`,
`transfers`, `moving` in the status), `preload.js` (three calls), `sync.js` (⋯ items, `panelAt`, `/sync what|space`),
`sync-panel.js` / `sync-panel.css` (moving files, What syncs, Free up space), `mcp/hearth-map.js` (one sentence in
`sync`), `dev/sync-sim.js` (big files, evict), `dev/sync-test.js` / `dev/sync72-test.js` (wait for the big lane where a
check expects a big file to have moved; the cut-short part is now in data/sync/parts), `dev/run-checks.js` (UNIT).
New: `sync-kinds.js`, `cloud-evict.js`, `dev/syncmedia73-test.js`, `dev/syncmedia73-perf.js`, `dev/checks/syncmedia73.js`.

## Risks
- A pass now ends before big files have moved: the status says "↻ N waiting" (with the files by name) until the lane
  is done. Anything that assumed one pass = everything moved (only tests did) must wait for `laneIdle()`.
- Turning a kind off forgets its sync history on this computer on purpose: turned on again, a file deleted on one side
  while off comes back instead of being deleted everywhere (never lose).
- Free up space trusts the cloud drive's own "online-only" (it refuses files not uploaded yet); on Windows OneDrive may
  free a file a moment after the click ("your cloud drive finishes it in a moment").
- Install on both computers; one updated computer already gets the lanes and the choices on its own side.

## For the patch notes
- Big files no longer hold up your chats: while a render or a long Lab take is going up (or coming down), new
  messages, scenes and settings sync right away beside it.
- Click the sync indicator at the bottom of the left rail: big files on their way are listed with a progress bar each.
- Sync reads big files half as much on the way up, a renamed video is just moved in the cloud, and a copy cut short
  goes on from where it stopped. Half-copied videos no longer appear in your cloud folder.
- In the same panel, "What syncs" lets you turn off a kind on this computer: Chats, Projects & scenes, Lab captures,
  Renders, Music sketches & stems, Photos or Tickets, with the size of each. Turning one off never deletes anything:
  the files stay where they are.
- "Free up space on this computer…" (in What syncs, or the ⋯ menu) lists the big files that are already safe in the
  cloud, then makes your cloud drive's copy online-only with one click. Hearth keeps its own copy and keeps working.
- If your cloud drive can't do that (Google Drive on Windows, for example), the panel says so plainly and changes
  nothing.
- Install this update on both computers.
