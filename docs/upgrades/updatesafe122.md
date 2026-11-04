# Round 122 · updatesafe122: updating from an old release (round 115, round 110) to now

Since round 115 the app changed a lot: round 116 (slim116) removed about 340 files (the Life tab, the music studio),
rounds 116–121 renamed and moved code and changed many lazy groups. Quentin's computers may be several rounds behind,
and Hearth can edit itself, so his folders may have hand edits. This round checks that the ⬆ Update from those old
versions works on realistic installs, and fixes what didn't.

## How it was tested

`dev/updatesafe122-test.js` (new, in UNIT, about 20 s). It builds real installs from Hearth's own git history in temp
folders. An "origin" whose main is this branch's HEAD borrows this repo's objects read-only (git alternates), so
nothing is copied and nothing is written into the real repo. Each install is a checkout of round 115 (34d9ed5) or
round 110 (b74a1c2), with its remote-tracking main left where that round last saw it. The folder is named `Hearth`
and has a full `data/` folder. The real updater code (`updatermain.js create().apply()`, the same call as ⬆ Update)
runs headless, the way `updatesafe-test.js` / `winfresh-test.js` run it. After each update, `dev/boot-test.js` runs
**inside the updated install** (lazy groups, manifest, IPC channels, first-screen budget). The test also checks that
`lazy-data.js`, `lazy-meta.js`, `index.html` and `main.js` are main's, byte for byte.

Important: `updatermain.js` and `updatesafe-core.js` did not change from round 110 to round 121. So the update
Quentin runs next is run by exactly that code (his old version's own updater). This round's fixes only run once his
computers have this version. Case (h) tests that real jump: round 115's own updater does the update, then this
version's first start tidies up after it.

| Case | Install | Before this round | Now |
|---|---|---|---|
| (a) | clean round 115 | ok | ok |
| (b) | round 115 + edits to files that still exist (chat-ux.js untouched since; memory.js changed elsewhere since) | ok: both edits back, merged | ok |
| (c) | round 115 + edits to two files round 116 deleted (the quest guide, the quest journal) | **update done, but** both removed files stayed in the app folder (untracked, with the edit), and the note said "the files have the new version" | the removed files are gone; the owner's versions are in `kept-from-updates/<date> (from to to)/` with a README; the note says they were removed and names the folder; the stash stays; ⬆ says it beforehand |
| (d) | round 115 + a clashing edit to projects.js + a good edit (memory.js) + an edit to a removed file | **projects.js kept its conflict marks** (`<<<<<<< Updated upstream`…): one removed file in the same stash made the single `git checkout HEAD -- …` fail for every file. The Projects code would not load. | projects.js is the update's, whole; the owner's version is kept in the folder; the good edit is back; the removed file is kept and gone; one note |
| (e) | round 115 + untracked leftovers (node_modules bits, `projects.js.orig`, a `.orig` beside a removed file, a `.pyc`) + a hand-made file with a new file's name (datalock.js) | ok: leftovers untouched; the hand-made file in its named stash, said | ok |
| (f) | round 110 + a data folder full of the removed features' stores (quest guide, leave reminders, VST warm / soundbank / plugin lists, live set, park jam, tickets incl. trash, Paris photos, sketches, 40 quest days, 20 WAVs) | ok: data byte-identical (content and times), also after the next start; no path too long for Windows | ok |
| (g) | Windows: CRLF checkout (`core.autocrlf=true`), a removed file held open (the merge fails half-way, "unable to unlink old …"), an edit to it | staged and finished at the next start; **the same leftover / wording as (c)** | staged; nothing half-done before the restart; finished by `startSwap`; the kept copy is byte for byte (CRLF); the window says it once |
| (h) | the real jump: round 115's **own** updater with (d)'s edits, then this version starts | the old updater leaves conflict marks in projects.js and the removed file in the folder (confirmed) | this version's first start (`bringBack`, 4 s in) tidies it: the owner's version and the marked file as it was go into `kept-from-updates/`, projects.js is the update's again, the removed file goes. A toast says so once. |

Every case checks:
- the data folder is byte-identical (sha-256, size and modification time of every file and folder) before and after
  the update, and after the next start's look at the update stashes;
- the app boots in the updated install;
- the updater starts only git, and no terminal opens: nothing is installed. Hearth has no npm packages, and an update
  never runs npm.

## What was fixed

All in `updatesafe-core.js`, `updatermain.js` and `updater.js` (none Codex-owned):

1. **restoreSteps (both ways of putting an update's stash back: the ⬆ Update and Windows' finish-at-restart).** On a
   clash, the clashing files are split into those the new version has and those it removed. Only the first are checked
   out from HEAD, so one removed file can't stop the others. Before that, the owner's version of every clashing file
   is written to `kept-from-updates/<date> (abc1234 to def5678)/<same path>`. It is written by git itself
   (`git --work-tree=<folder> restore --source=<stash> --worktree`): exact bytes, the checkout's line endings, and the
   index is untouched. If git is older than 2.23, the text from `git show` is used. A README.txt there says what the
   files are. A removed file's copy that the apply left in the folder is deleted, but only if its content is exactly
   the stash's and its kept copy was written. The stash itself always stays, named, as before.
2. **One note (`keptNote`)** for the update, Windows' restart finish and Go back. It says which files the update
   removed, which ones clashed (now the new version), and where the owner's versions are: the folder, plus the stash.
3. **Before the update:** `status().plan.removedEdits` lists the edited files this update removes, and the ⬆ dialog
   says so in one line.
4. **After an older Hearth's update (the real jump):** `bringBack`, already run 4 s after each start for the update
   stashes, now first tidies two things an old updater left:
   - a removed file still in the folder, untracked and exactly the stash's content;
   - a file with the stash-apply conflict marks ("Updated upstream" / "Stashed changes") that HEAD's version doesn't
     have.

   Both go to `kept-from-updates/` (the marked file too, as `<file>.as-the-update-left-it.txt`). Then the removed
   file goes and the marked one is checked out from HEAD. This runs once per stash, and the stash stays.
   `status().tidied` says it once and the window shows it as a toast.
5. `.gitignore`: `kept-from-updates/`.

## What couldn't be tested here (Linux sandbox)

- **Real Windows file locks.** They are simulated with a git wrapper that fails the merge half-way with Windows' own
  message, like `updatesafe-test` does. A file held open while the new code deletes a removed file's leftover copy
  (`fs.unlinkSync`) is caught and logged, and the file stays. That part is untested.
- **Long paths.** These are measured, not written: every file the 110 → main update writes fits under 259 characters
  in `C:\Users\Quentin\Hearth`, in `C:\Users\Quentin\agent-hub`, and in a long OneDrive Documents path. A longer
  `kept-from-updates/<date> (…)/` prefix adds about 45 characters. If that fails without `core.longpaths`, the file
  stays in the stash, and the note still names it.
- **CRLF** is simulated with `core.autocrlf=true` on Linux. That is the same git setting as Git for Windows, but not
  NTFS or Defender.
- **The shallow Windows zip (depth 50).** Round 115 → main is 41 versions and round 110 → main is 103.
  `winfresh-test` already covers deeper fetches on shallow copies. The new test uses full history.
- **The network fetch from GitHub and a 340-file delete over a slow disk.** The test fetches from a local origin.
- **The window side of the toasts** (the tidied note, the removed-edits line) was not driven in Electron. The
  `updater` check still passes.

## Tests run

- `node dev/updatesafe122-test.js`: 68 passed (about 20 s).
- `flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact unit:updatesafe122-test
  unit:updatesafe-test unit:updater-test unit:winfresh-test unit:boot-test unit:configsafe-test unit:labchats54-test
  unit:keptaside94-test unit:aside95-test unit:slim116-test`: 10 / 10 passed. `updater` (Electron): passed.
- `node dev/boot-test.js`: 2,822 checks passed.
- Not caused by this round: `dev/winmac-test.js` (trash-direct) and `dev/errorcalm-scan.js` each flag one line in
  `parityprobe.js:242` (round 120).

## For the patch notes

- Updating from an older Hearth is safer when you had edited Hearth's own files:
  - If an update removes a file you had changed (round 116 removed the Life tab and the music studio), your version
    is now kept as a plain file in the new **kept-from-updates** folder inside Hearth's folder, with a short note
    saying what it is. The update goes ahead, and Hearth tells you before and after.
  - If your edit clashes with the update, the file now always gets the update's clean version. Before, it could be
    left half-merged and break part of the app. Your version goes into the same folder.
- If an earlier update already left such a file behind, Hearth tidies it the first time this version starts, and says
  so once.
- Your data folder is never touched by updates. This was checked file by file, including the stores of the removed
  features.

## For Codex

No Codex-owned file was edited (sync-engine.js, cloud-files.js, astra*, codex-*, projects*, project-workspace*,
workbench-*, engine-watch untouched). Only temp copies of `projects.js` were edited in the test installs. For you to
know: an owner's hand edit to `projects.js` that clashed with an update used to be left with conflict marks
whenever the same update also removed a file the owner had edited. From this version on that can't happen, and the
first start of this version repairs it if it already did. The owner's version is then in `kept-from-updates/`.
