# Windows test plan (for a Claude session on the owner's PC)

You are a Claude session running on Quentin's Windows PC (RTX 4080, 240 Hz, UA audio interface; Hearth installed at
`C:\Users\quent\agent-hub`). A cloud Claude session builds Hearth but can only test on Linux with software graphics.
Your job: check the things below on real Windows and report back plain results (numbers, what you saw, error text).

**Rules**
- Never touch Quentin's real data. Use a throwaway copy of Hearth's data folder for anything that writes
  (`HEARTH_DATA_DIR` pointed at a temp folder, or Hearth's own `--profile`/test flags if present — check README).
- Never upload anything. Never sign in to anything. Ask Quentin before closing his running Hearth.
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

## 5. Projects (rounds 72–76)
- Switch between 3 projects with the name ▾ switcher: does it feel instant? Any reload flashes?
- First project opened after restarting Hearth: time to usable.

## 6. Hiccups
- After 30 min of normal use: rail ⋯ › That was slow — paste "Hiccups over 500 ms today" and the card.
- ⋯ › Something broke — paste the report if anything is listed.

## Reporting
Write results to `C:\Users\quent\agent-hub\dev\windows-test-results.md` (git-ignored if possible) and paste a short
summary back to the cloud session, or tell Quentin to forward it.
