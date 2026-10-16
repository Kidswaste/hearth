# crashsafe (round 50): nothing is lost when Hearth or the computer stops suddenly

safetynet (round 29) already keeps chat drafts, unsaved Lab code, slider moves, keyframes, board edits and half-typed
text boxes in a small journal ≤ 1 s after a change, and brings them back on a calm card. This round tested every other
"worst moment" on throwaway data. Hearth's main process, the window's page and the Lab preview page were each killed
the hard way, and a power cut was simulated by files cut mid-JSON with temp files left behind. Then it closed what was
still lost.

Nothing new on screen and no new setting. It uses the same card ("Hearth closed unexpectedly — here's what was
restored") with more lines. A cut-off reply gets a calm line with **Continue**. The Lab preview comes back by itself.

## What was lost before → now
"Killed" = the process is gone without warning (a crash, a forced quit, the computer losing power, Windows restarting
for an update).

| The worst moment | Before | Now |
|---|---|---|
| Typing a long message draft | ≤ 1 s lost (safetynet's journal) | the same; on a Windows update restart / shutdown, the waiting saves and the journal are written at once |
| Editing Lab code / sliders / keyframes (inside the 0.6 s save window) | ≤ 1 s lost (journal → a time-machine version) | the same, plus a flush when Windows ends the session |
| **The Lab preview page's own process crashes** (it runs in a process of its own) | the preview stayed blank (a dead frame) until you restarted it; nothing told the Lab | **a new page comes up by itself in ≈ 2–4 s** with the same scene, the sliders where they were and the song at its place (glrecover's path); nothing is saved meanwhile; no banner |
| **The window's page crashes while an AI reply streams** | **the whole reply was lost**: the engine kept going in the main process, but its words and its end went to a page that no longer existed. Your question stayed unanswered | the reply **lands whole in its chat** when the engine ends (one card line: "Claude is still writing its reply in … — it shows there when done", then a "… is in" note with Open) |
| **Hearth (main) killed / power cut while a reply streams** | the whole reply was lost | the words so far come back (journaled ≤ 0.8 s behind, off the main thread), marked **"Reply cut off — Hearth closed while it was being written"** with **Continue**: one short line plus your question, so the engine can pick up even if its session never got the question |
| **The window's page crashes during a Lab render / export** | ffmpeg waited for frames forever (its half video stayed locked on Windows) | ffmpeg is stopped and its half video removed at once |
| **Hearth killed / power cut during a render / export** | ffmpeg got end-of-input and **finished a short video under the final name**: it looked done. The render queue forgot the Lab render | the half file goes to the **Trash** at the next start, a card line says so, and the render queue offers **Render them** (from the top, same settings) |
| Killed during a backup zip | a half zip stayed in `.hearth/partial` (hidden, taking disk) | it goes to the Trash at the next start |
| Killed / power cut during a sync write | temp files renamed **without being flushed**: after a power cut a file could be empty, then sync it to the other computer | every temp file is flushed to the disk before its rename (local and cloud). sync already sweeps its own temp files and resumes big copies |
| Power cut while a store is written | the store thread flushed, but settings' fallback write, stores written without the thread, token stats, sync settings, backup state and files written through Hearth (exports, packs) did not | all flushed before the rename (temp + fsync + rename, retried while Windows holds the file) |
| A store cut short mid-JSON / temp files left behind | datasafe read the `.prev` copy; the temp file stayed forever | at the start, before anything reads: a whole temp file of a missing or cut-short store **takes its place** (the cut one kept aside as `-torn-…`); junk temp files go to the Trash; a file held by another program is left for the next start |
| Windows update restart / sign-out, Mac / Linux shutdown | Hearth was closed with up to ≈ 1 s of saves waiting | on `query-session-end` / `session-end` (Windows) and `shutdown` (Mac, Linux): the window writes every waiting save and its journal, and the main process writes the journal and the replies at once |

Measured: a writer process saving a 300 KB store was killed at random moments 40 times. The atomic way was whole
40 / 40. The old in-place way was cut short or empty 15 / 40 (`dev/crashsafe-test.js`).

## Upgrades
### Replies
1. **A reply being written is journaled as it streams** (main process, ≤ 0.8 s behind, one write at a time off the
   main thread; 302 streamed events → 1 write).
2. **The window crashing mid-reply loses nothing**: the reply lands whole in its chat when the engine ends, with its
   session (the chat goes on in it), exactly once.
3. **Hearth or the computer stopping mid-reply**: the words so far come back, marked "Reply cut off — Hearth closed
   while it was being written".
4. **Continue** under it (offline.js's own button): one short line plus your question; the rest is stitched in.
5. Cut off before any words: an empty cut reply, so Continue asks again.
6. A reply already saved never comes back twice. The journal copy goes once the reply is in its chat.
### The Lab
7. **The preview page's own crash is noticed** (each preview page's process is looked at every 2 s while one
   exists: one system call). A new page comes up with the same scene, sliders and song, with no banner.
8. A render whose page crashes is picked up by the export itself (glrecover's "owner" path); the GPU banner isn't
   shown for a crash.
### Renders, exports, backups
9. **A render's ffmpeg is stopped and its half video removed** when the window's page crashes.
10. **Renders, exports and backups cut off by a crash or a power cut**: their half-made file goes to the Trash at the
    next start (only files the job made itself), with a line on the card.
11. **The render queue offers a Lab render that was running** when Hearth closed: "cut off or waiting when Hearth
    closed — they start again from the top", **Render them**.
### Writes that survive a power cut
12. Settings, sync settings, backups' state, token stats, stores written without the store thread, and files written
    through Hearth: **temp file + flush + rename**, retried while Windows holds the file.
13. **Sync's writes are flushed before their rename**, here and in the cloud folder (no empty file synced to the other
    computer after a power cut).
14. **Temp files killed writes left behind are sorted at the start**: a whole newer version takes the place of a
    missing / cut-short store (the cut one kept aside), junk goes to the Trash.
### Shutdowns
15. **Windows ending the session** (an update restart, a sign-out) and **a Mac / Linux shutdown**: every waiting save,
    the work journal and the replies are written at once.
### The card
16. The card after an unexpected exit now also lists replies (finished while away / cut off / still being written,
    each with Open) and renders cut off (Open shows the render queue).

**16 upgrades.**

## How it works (for the next developer)
- `crashsafe-core.js` (UMD, unit-tested): `writeAtomicSync` / `writeAtomic` (unique temp name, fsync, rename with
  Windows retries, folder fsync off Windows), `realOf` / `tmpPlan` (temp file leftovers), `add` / `replyPlan` (the
  reply journal → messages), `leftovers` / `leftoverLine`.
- `crashsafemain.js` (main, `crashsafe.register` in main.js; `engine:send` calls `crashsafe.reply` per event):
  - `data/safetynet/replies.json` and `replies-prev.json` (the last run's, until the window took them);
  - `inflight.json` with `begin(kind, files, label)` / `end(id)`: renderfastmain's streamed exports and backupautomain's
    partial zip use it;
  - the start-up sweep of temp files (data folder depth 3 + the app folder; skips workspace / media / captures…);
  - the window's page gone (crash / reload): `gen` + 1, streamed exports cancelled;
  - the preview pages' processes (`did-frame-finish-load` → `webFrameMain.osProcessId`, `process.kill(pid, 0)` every
    2 s while there is one) → `crashsafe:frames` with the pages still up;
  - `query-session-end` / `session-end` / `powerMonitor` `shutdown` → `crashsafe:flush` + journal written
    (`safetynetmain.flushSync`).
- `crashsafe.js` (window, in safetynet's lazy group): safetynet's `recover()` takes its entries
  (`CrashSafe.entries()`, `CrashSafe.restore.reply / render`); a clean start restores replies quietly; orphans
  (`crashsafe:orphan`); `Native.hooks.event` acks; `crashsafe:frames` → `window.__labFrames` (tools/three.js
  `crashCheck`); `crashsafe:flush` → `SafetyNet.keepNow()` + `hearth:flush` (ui.js `saver` flushes).
- `IPC crashsafe:test` (`HEARTH_TEST_SAVE_DIR` only): state, sweep, begin, down, frames, kill-frame (SIGKILL the
  preview page's process).

## Tests
- **`node dev/crashsafe-test.js` (UNIT, 41 checks, pass)**:
  - atomic writes, a held rename retried, a rename that never works (the real file untouched);
  - a writer killed 40 times mid-write (always whole; the old way 15 / 40 torn);
  - temp-file names and plans;
  - a simulated power cut on a throwaway data folder: a scenes file cut short + its whole temp file → back, the cut
    one kept aside; junk to the Trash; one being written left alone; sync's own left to sync; a store cut mid-JSON
    read from its `.prev`;
  - the reply journal: coalesced writes; a killed main process → cut off with Continue; already saved → nothing;
    nothing yet → an empty cut reply; finished while the page was gone → whole with its session; ack;
  - renders cut off: the half file trashed at the next start, a finished one kept, the card line;
  - a real ffmpeg stream whose page crashes: stopped, file removed, nothing left listed;
  - the words, and Continue's prompt (unchanged without a crash: byte-stable).
- **`dev/checks/crashsafe.js` (smoke, fake engines, throwaway data, 20 steps, pass)**:
  - the Lab preview page's process SIGKILLed right after a slider move → a new page, slider kept, no banner;
  - the window's page crashed while Claude streams a long reply, with unsaved Lab code and a draft → the card lists
    the Lab work, the draft and the reply; the draft is back; the reply lands whole, once; its journal copy goes;
  - a reply cut off by a killed main process → the words, the calm line, Continue → the question goes along and the
    rest comes in;
  - a store cut short with its temp file left → put back;
  - Windows ending the session → the waiting draft save is written at once.
  - Screenshots looked at (the card, the cut-off reply).
- Re-run: see the stream's final report (datasafe, scenesafe, glrecover, backupauto, renderfast, sync,
  unit:datasafe-test, unit:scenesafe-test, lazy, unit:boot-test, safetynet + unit, offline + backupauto + renderfast
  units, datasafe-scan).

## Caveats
- **Not tried on a real Mac or PC, nor a real power cut.** Kills were real (SIGKILL, forcefullyCrashRenderer). The
  power cut was simulated by cut-short files and leftover temp files. Windows' `session-end` and the Mac's `shutdown`
  weren't fired for real; the same flush runs from the test hook.
- A reply cut off by a killed main process continues on the chat's **previous** engine session (the new turn's session
  id only arrives with its end). That's why Continue sends your question along: about 50–150 more tokens, only when
  you click it.
- The window's page crashing mid-reply: until the engine ends, the chat doesn't show the reply streaming (it appears
  whole). Sending another message in that chat meanwhile starts a new reply. The finished one then still lands, after
  it.
- The preview page check is one tiny timer while a preview page exists (every 2 s, one system call). Nothing runs
  without a preview.
- The Stage window (a separate window) crashing isn't covered here: it's its own window.
- The start-up sweep reads only temp files (≤ 32 MB) at depth ≤ 3 of the data folder. It never deletes: junk goes to
  the Trash (Recycle Bin).

## Edits outside the lane (small, additive)
- `main.js`: one require, one register line, two `crashsafe.reply` lines in `engine:send`.
- `preload.js`: `hub.crashsafe`.
- `safetynet.js` (recover takes crashsafe's entries; Open passes unknown kinds on), `safetynet-core.js` (card order),
  `safetynetmain.js` (`flushSync`).
- `offline-core.js` (`continuePrompt(written, ask)`, the "Hearth closed" line), `offline.js` (`crashed` passed, Continue
  sends the question after a crash).
- `tools/three.js` (`crashCheck` in `sandboxFrame`; the GPU banner not counted for a crash).
- `renderfastmain.js` (begin / end), `backupautomain.js` (begin / end around the zip; its state through
  `writeAtomicSync`), `renders.js` (a running Lab render offered again).
- `store.js`, `datasafemain.js`, `syncmain.js`, `sync-engine.js`, `fsapi.js`: flushed temp files.
- `ui.js` (`hearth:flush` flushes waiting saves), `lazy-data.js` (two files in the safetynet group),
  `dev/run-checks.js` (UNIT + the `crashsafe` group).

## For the patch notes
- **An AI reply is no longer lost when Hearth crashes or the computer goes off mid-answer.** If the window crashed,
  the reply lands in its chat when it's done. If Hearth itself stopped, what it had written comes back, marked "Reply
  cut off — Hearth closed while it was being written", with **Continue**.
- **The Lab preview recovers by itself if its page crashes**: a new one comes up in a few seconds with the same scene,
  your sliders and the song where they were.
- **A render cut off by a crash or a power cut no longer leaves a half video** that looks finished. It goes to the
  Trash at the next start, and the render queue offers to render it again.
- **Every save survives a power cut**: settings, sync, backups' state and files Hearth writes are now flushed to the
  disk before they replace the old file. A store found cut short at the start is put back from its last whole copy.
- **Windows update restarts** (and shutting down a Mac): Hearth writes everything waiting the moment the system says
  it's going down.
- The "Hearth closed unexpectedly" card now also lists replies and renders, each with Open.
- What to try: start a long reply in a chat and quit Hearth from the Task Manager / Activity Monitor (Force Quit)
  halfway. Open Hearth again: the card lists the reply, and the chat shows what it wrote with **Continue**.
