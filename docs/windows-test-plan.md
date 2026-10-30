# Windows test plan (for a Claude session on the owner's PC)

You are a Claude session running on Quentin's Windows PC (RTX 4080, 240 Hz, UA audio interface; Hearth installed at
`C:\Users\quent\agent-hub`). A cloud Claude session builds Hearth but can only test on Linux with software graphics.
Your job: check the things below on real Windows and report back plain results (numbers, what you saw, error text).

**Rules**
- Never touch Quentin's real data. Use a throwaway copy of Hearth's data folder for anything that writes
  (`HEARTH_DATA_DIR` pointed at a temp folder, or Hearth's own `--profile`/test flags if present — check README).
- Never upload anything. Never sign in to anything. Ask Quentin before closing his running Hearth.
- Before pushing a fix to main, run `node dev/run-checks.js --exact unit:winmac-test unit:datasafe-scan unit:errorcalm-scan unit:storeack-scan unit:boot-test` (a Windows-only call needs a `winmac-ok` comment saying why).
- If a step needs Quentin (e.g. putting on headphones), ask him in one plain sentence.

## 0. Get the latest
- `git -C C:\Users\quent\agent-hub pull` (or Hearth's ⬆ Update). Note the commit (`git log -1 --oneline`).
- Fully restart Hearth (tray icon › Restart).

## 1. PowerShell helper for cloud files (round 78, winperf78) — most important
- With sync on (OneDrive or iCloud folder), make a small change (send a chat message), then watch Hearth's log
  (`data/logs` or the dev console) for `cloud-files` lines. Expected: one long-lived hidden PowerShell answers;
  no "fell back to one-shot" message. Report any fallback and its error.
- Task Manager: count `powershell.exe` processes while Hearth idles 3 min (expected: 0 after ~2 min idle).

## 2. Play performance (round 76, gpuplay76)
- Open Clink, right-click ▶ Play › 📈 Test play performance. Paste the full report (Copy report for Claude).
- Note: fps vs 240 Hz, GPU vs CPU-bound, which GPU and ANGLE backend, Quality auto behaviour.
- Also run the Lab's opt-in checks if Node is available: `set LABFPS72=1 && node dev/run-checks.js --exact labfps72`
  and report `gpuTimerMsPerFrame` and `labDraw.cull` numbers.

## 3. Lab sound sync (round 77, labaudio77)
- Open a song scene, play. Right-click play › "♪ Pictures in sync with the sound": report the latency line.
- Ask Quentin to switch output (UA interface ↔ headphones) mid-song: does sound continue, no doubling, no silence?

## 4. Sync between PC and Mac (rounds 72–78)
- On the sync chip: state shown, any "⚠ to fix" items, any "Kept aside" items.
- Edit the same note on PC and Mac on neighbouring lines within a minute: both edits kept?
- Time from saving a chat message on one computer to it appearing on the other (stopwatch).
- Settings › What syncs and Free up space on this computer: does "online-only" work with OneDrive here?

## 4b. Scoped sync passes (round 79)
- Make a change on the PC (send a chat message): does it reach the Mac within seconds? Does the sync panel ever show items stuck "waiting"?
- Leave Hearth idle 30 min on mains power, then check the sync panel is calm (no errors).

## 4c. Engines and first Play (round 79)
- After a restart, open the doctor (Claude / Astra) — engines found? Then ▶ Play a game you played recently: did the window freeze at all?

## 4d. Lab between PC and Mac (round 87)
- Import a big model or texture (over 8 MB, ideally ~50 MB) into a Lab scene on the PC. On the Mac, open that scene: does the model appear by itself (no "Download the big files now" needed)? Time it.
- Delete a scene on one computer: does it show in the other computer's Deleted sketches without a restart?
- Make a trigger preset or saved palette on one computer: does it appear on the other?

## 4e. More of the Lab between PC and Mac (round 88)
- On the PC: pin a scene ("★ Pin to the top" in its menu in All as pictures), star an effect in the effects list, build a stage set list, and set the ⚡ trigger bars for a song that sits in your Music folder (the same song is in Music on the Mac). On the Mac, a few seconds later: are all four there? The bars should show when you open the same song.
- Unpin that scene on the Mac: is it unpinned on the PC?
- Load a song from your Downloads or Music folder (one the Mac doesn't have) onto a scene on the PC with sync on. A note should offer "Keep a copy with this scene so it plays on your other computer (size)". Click it, then open the scene on the Mac: does the song play there? The original file on the PC should still be where it was. (/song keep asks again any time.)
- Leave a scene running in live coding for 10 minutes on the PC and watch the sync panel / OneDrive activity: only small Lab files should move, not a big "three-history" file on every run.
- First start after the update: open History (Sketch ▾ → Earlier versions) on an old scene. Are its earlier versions all there?

## 4f. Very long chats in pieces (round 89) — only once BOTH the PC and the Mac have this update
- Settings › This computer & sync: "Send very long chats in pieces (both computers need this update)" is there and **unticked**. Tick it on the PC only: the line should say it is waiting for your other computer. Everything keeps syncing as before.
- Tick it on the Mac too. After a sync (Sync now on both), the PC's line should say "On: in use".
- In your longest chat (ideally one over 16 MB; the sync panel / Settings' What syncs shows sizes), send a few messages on the PC. Watch OneDrive's activity: each reply should upload well under a megabyte, not the whole chat. On the Mac, does each reply arrive within the usual few seconds?
- Leave that chat alone for 5 minutes: the whole chat file should upload once (a big upload, once).
- Reply on the Mac in the same chat, then on the PC: the messages should all be there, in order, on both. Nothing doubled, nothing missing.
- Edit the chat's title on both computers while one is offline (Wi-Fi off), then bring it back: one title wins on both, and the sync panel shows "Kept aside" for the other version (Compare works).
- Untick it on the Mac: within a sync or two the PC's line goes back to "waiting", and the last replies still arrive (the whole file goes at once). Tick it again afterwards if you like.
- Report: the upload size per reply you saw, how long a reply took to show on the other computer, and anything in the sync panel's "Waiting" list that stayed for more than a minute.

## 4g. Your computers and the pieces' space (round 90)
- Settings › This computer & sync › **Your computers** (open the fold): the PC (this computer) and the Mac are listed, each with its system, when it was last seen, its Hearth version and whether it reads pieces. An old computer or reinstall that hasn't synced for a week shows **Forget this computer…** (the PC and the Mac never do). Forget it only if it is really gone: the line under the list says "Forgotten: …", and if "Send very long chats in pieces" was waiting only for it, it now says "On: in use" after a sync.
- Under it, "Very long chats' pieces" says how much room the pieces take (cloud folder / kept for merging / kept aside). If **Free up …** shows, click it and confirm: the old pieces go to the Recycle Bin (check it's there), and your longest chat still opens and syncs.
- Report: anything listed that you don't recognise, and the sizes shown.

## 5. Projects (rounds 72–76)
- Switch between 3 projects with the name ▾ switcher: does it feel instant? Any reload flashes?
- First project opened after restarting Hearth: time to usable.

## 6. Hiccups
- After 30 min of normal use: rail ⋯ › That was slow — paste "Hiccups over 500 ms today" and the card.
- ⋯ › Something broke — paste the report if anything is listed.

## 7. Lab hitches (round 89, labfps89)
- Run the check if Node is available: `node dev/run-checks.js --exact labfps89` (about 3 min). Report the result
  line and, from `labfps89.log` in the output folder, for each stretch: `p50`, `p95`, `p99`, `over2x`, `over2xApp`,
  `stillMs`, `visibleCompileFrames`, `bigMPinFrames`, and `khr` (it should be true on the 4080: shaders compile in the
  background) and `swap` (the switch-on stretches should show `lives` going up and an empty `fellBack`).
- By eye, in Hearth, preview on Auto and on Max fps: switch between three gallery scenes (Chrome blob, Particle
  galaxy, Beat burst). Does the old scene keep moving until the new one fades in, with no frozen frame? Add a Bloom
  filter on top of a playing scene: does the picture stick at all? Drop a 4K photo into a scene's references and use
  it: is there a visible jolt?
- If anything sticks: right-click ▶ Play › 📈 Test play performance on the same scene and paste the report, plus the
  `/lab perf` line.

## 8. Shaders made mid-scene and 4K pictures in slices (round 90, labcompile90)
- Run the check if Node is available: `node dev/run-checks.js --exact labcompile90` (about 2 min). Report the result
  line and, from `labcompile90.log` in the output folder, for each stretch (`runtime:mats`, `runtime:swap`,
  `runtime:light`, `runtime:glass`, `glass:shown`, `texture`): `p50`, `p99`, `max`, `visibleInFrameCompiles` (should
  be 0), `compiles`, `over2x`, `over2xApp`, and `khr` (true on the 4080). From the `lc` block: `maxWait`, `waits`,
  `done`, `late` (should be 0) and `khr`. From `texture`: `biggestUploadMP` (≤ 4.2), and `slices` (`pictures`,
  `slices`, `ms`, `maxMs`: the longest single slice on the real card).
- By eye, in Hearth, preview on Auto: in a playing scene, add a light from the Director ("add a red point light") and
  a glass sphere ("add a glass ball"): does the picture stick for even a moment, or does the new thing just appear?
  Drop a 4K photo into a scene's references and use it: is there a jolt when it shows?
- In `/lab perf`, paste the line after doing the above.

## Reporting
Write results to `C:\Users\quent\agent-hub\dev\windows-test-results.md` (git-ignored if possible) and paste a short
summary back to the cloud session, or tell Quentin to forward it.
