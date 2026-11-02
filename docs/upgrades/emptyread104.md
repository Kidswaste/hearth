# emptyread104 (round 104): a read that fails is never "empty", anywhere

The owner's standing rule: **a store read failure is never treated as empty.** `dev/datasafe-scan.js`
(`unit:datasafe-scan`) has enforced it by pattern since round 43. Round 103 still found a real breach the scan missed:
`sync-engine.js` `localJsonText` read `app/config.json` as `let cur = {}; try { cur = parse(await fsp.readFile(…)) }
catch { }` and wrote the shared settings over that `{}`. A settings file held for a moment on Windows lost this
computer's own settings (syncstall103 items 11–12).

This round audits the whole codebase for the same mistake. That covers the main process, the store and files threads
(`storework.js`, `fswalk.js`), the window, the Lab pages (`tools/`), the MCP servers and the updater. The audit looks
for code that reads persisted data and, on **any** error, falls back to an empty or default value that is later
written back or acted on. Each breach is fixed, and the scan now catches the shape it missed.

Files: `sync-engine.js` (Codex, marked edits; see "For Codex"), `storework.js`, `store.js`, `syncmain.js`, `main.js`,
`scenesafe-core.js`, `configsafe-core.js`, `updatesafe-core.js`, `updatermain.js`, `backupautomain.js`, `portable.js`,
`remotemain.js`, `appshell.js`. Tooling: `dev/datasafe-scan.js` (new rule `read`), `dev/datasafe-baseline.json`,
`dev/emptyread104-test.js` (new, `unit:emptyread104-test`), and an `emptyread104` group in `dev/run-checks.js`.

## Why the scan missed `localJsonText`
The round-43 rule (`kind: main`) flagged a **file** when all of these held:
1. it had `JSON.parse(fs.readFileSync(…))`, with the catch on the same line returning or assigning a fallback;
2. it wrote files (`writeFileSync` / `renameSync`);
3. it used no guard helper.

It missed round 103's code in three ways:
- **The read was async and used another parser**: `S.parseJson(await fsp.readFile(…))`. The rule only knew
  `JSON.parse(fs.readFileSync(`.
- **The catch was empty.** The default was set *before* the `try` (`let cur = {}; try { cur = … } catch { }`). The rule
  only looked for a catch that returns or assigns something.
- **It judged whole files, once.** `sync-engine.js` uses `readRetry`, which counted as "uses a guard", and was listed as
  audited. So nothing new written in it could ever fail the scan. Even a fresh finding would only have said "this file",
  not where.

Also, `localJsonText` doesn't write anything itself. It **returns** text, and its caller writes it
(`casWrite(L.file, L, await localJsonText(…))`). Any check that looks only inside the function misses that.

## The new rule (`kind: read`)
`dev/datasafe-scan.js` now looks at **each read site**, in every scanned file (the same folders as before):
- **site**: a read (`readFileSync`, `readFile`, `fsp.readFile`, `readRetry`, `readJsonSync`) inside a `try` whose catch,
  on any error, gives an empty default. The shapes it knows:
  - `return {}` / `[]` / `null` / `undefined` / `''` / `fallback` / an object literal;
  - `x = <default>`;
  - an **empty catch after `let x = <default>`** or `let x;`;
  - `read(…).catch(() => <default>)`.

  A catch that looks at the error (`ENOENT`), throws, or refuses is fine. "Refuses" means `continue`, `break`,
  `return false`, or an answer with `ok: false`, `held`, `stale`, `error:`, `state:` or `why:`.
- **acted on**: the nearest named function around the site writes, renames or removes something. Or the function's
  result goes to a write on the line where it is called, or on the two lines after. That covers
  `lt = await localJsonText(…); casWrite(…, lt)`.
- Strings, comments and regex literals are masked before braces are matched, so function bounds and catch bodies are
  found reliably.
- Each finding is keyed by **file, function and read call**, not by line. So a new read in an already-audited file still
  fails. Every current finding is audited in `dev/datasafe-baseline.json` with its reason (22 `read` entries).
  `--baseline` writes `TODO: audit` for a new one instead of a generic reason. The baseline doesn't keep line numbers.
  One stale round-43 entry (`gamemodemain.js|main`) went out with the rewrite.

**Proof on round 102's code**: `dev/emptyread104-test.js` runs the rule on `git show d264c23:sync-engine.js` (the last
`sync-engine.js` before round 103). It flags `localJsonText` there. It also flags the round-103 pre-fix version
(`8155131^`), plus `readFormat`, `flushJournalNow`, `renameThere`/`renameHere`, `prevText` and `restore`. Synthetic
cases check that the fixed shape (`if (err?.code !== 'ENOENT') throw err`), a read that is only shown, and a read that
refuses are *not* flagged.

**What it still can't see** (covered by the audit below, not by the rule):
- a default returned by a helper and handed to a merge several lines away (`readBase`, a `return null` used as a merge
  base);
- a catch that returns the *unmerged* value rather than an empty one (`guardWrite`'s `return value`);
- a read in one file whose caller writes in another (`updatesafe-core.readState`, used by `updatermain.js`).

## Every hit
"Line" is the line in this branch. **breach** means the default could be written back or acted on, and is now fixed.
**safe** means the default is only shown, or the error is ENOENT, or the failure already refuses. Breaches first.

| file | line | | why | fix |
|---|---|---|---|---|
| `sync-engine.js` `readBase` | 180 | **breach** | A base file held during a merge was read as "no base", so the merge became two-way. A counter store (usage, token stats, feature usage, Astra scoreboard) added both computers' **whole** counts (5 → 7 and 6 gave 13, not 8). Something removed on one computer came back. Both sides were written. | Only ENOENT is "none". Anything else throws: the merge waits ("in use", by name) and is tried next pass. A base that reads but doesn't parse is still "none": bases are written whole by a rename, so a damaged one never heals. |
| `storework.js` `syncMerge` (store thread, big stores and giant chats) | 602, 618 | **breach** | Same as `readBase`, for merges done on the store thread. | Non-ENOENT returns `{ stale: true }`: the next pass looks again. |
| `sync-engine.js` `flushJournalNow` | 763 | **breach** | This computer's journal (`.sync/journal/<id>.jsonl`) was read-modify-written. A held journal was read as `[]` and rewritten with only the new lines, so the other computer lost the deletes and moves recorded before. | Non-ENOENT throws (the caller logs it). `journalOut` is kept, so the next flush appends everything. |
| `sync-engine.js` `readFormat` + `passOnce` | 752, 1563 | **breach** | A `format.json` that was there but couldn't be read counted as "no minimum". An older Hearth then went on writing a cloud folder a newer one had marked as off-limits. | Missing = no minimum. Unreadable or half written = `held`: the pass ends as `offline / held` ("Sync waits · can't read its records here", as for its own records). |
| `sync-engine.js` `guardWrite` | 2116 | **breach** | After a pull, a window's save of the older copy is merged with what arrived. If the file couldn't be read right then (an antivirus scanning the file sync had just written), the window's copy was returned **unmerged** and saved over the other computer's change. | ENOENT: saved as given, as before. Anything else throws `EHELD`. |
| `store.js` `writeJson` / `outsideMerge` | 325, 265 | **breach** | `writeJson` caught any `beforeWrite` (sync guard) failure and saved as given. `outsideMerge` (what Versions or Recover brought back) also returned the unmerged value when the file couldn't be read. | `EHELD` from either guard holds the save **as it was given** (`hold`: tried again after 1 s, 2 s, …, and the guards run again then). Holding the pre-guard value keeps a counter from being merged twice. |
| `syncmain.js` `guardConfig` + `main.js` `config:save` / `holdConfig` | 515, 336, 330 | **breach** | Same as `guardWrite`, for settings. `guardConfig` swallowed every error. | `EHELD` is passed on. `config:save` holds the save (`{ ok: true, held: true }`) and `holdConfig` tries again a second later until it reads. |
| `sync-engine.js` `asideDo` ("Keep both" on a kept-aside version) | 2174 | **breach** | This computer's version couldn't be read, so it was taken as "none here". Keep both then silently became "use theirs": the version in place went to Deleted files and was replaced. | Unreadable (not ENOENT) refuses: "The version here can't be read just now. Nothing was changed". |
| `scenesafe-core.js` `prepareWrite` (the Lab's scenes guard) | 157 | **breach** | The scene ids came from the cache, so the file was only read when a save left scenes out. If that read failed, the disk counted as "nothing to guard": the guard was skipped and the scenes left the file. This is the very loss round 43 was about. | Non-ENOENT throws as the read above it does ("held by another program"): the save waits for the next one. |
| `scenesafe-core.js` `prepareWrite` (`.prev` copy) | 183, 186 | **breach** | The `.prev` that may hold scenes the file doesn't is kept aside before it is replaced. If it couldn't be read, it was replaced anyway, with nothing kept aside. | Unreadable `.prev` (not ENOENT) sets `keepPrev = false`: it isn't replaced this time. |
| `updatermain.js` `halfDone` | 720 | **breach** | A held update journal was read as `{}` and deleted as "Cleaned up". The owner's edits it names (the stashes) were never put back. | `readStateStatus`: unreadable refuses ("Hearth's notes about the last update can't be read just now. Nothing was changed"). |
| `updatermain.js` `checkout` (preflight) | 122 | **breach** | A held `pending` or `journal` note read as "none", so a new update went ahead over a half-done one. | Either note unreadable: the same refusal. |
| `updatesafe-core.js` `restoreSteps` / `intoData` (theme.css) | 227, 271 | **breach** | The owner's `data/theme.css` held while an update put the stash back was read as `null`, so the update's theme was written over the owner's CSS. | Held: not written. In `intoData` the tracked file stays (`left`) for the next start's settle. |
| `configsafe-core.js` `mark` / `updatermain.js` settle and handBack | 94, 472, 488 | **breach** | `{ ...(readState() \|\| {}), ...patch }`: a held state note was rewritten with only the new mark, losing `handedBack` or the theme mark. | New `patchState`: written only over a note that was read or isn't there. Otherwise `false`, and it is tried next time. |
| `backupautomain.js` `walk` | 111 | **breach** | A data subfolder that couldn't be listed (EPERM) was left out of the backup silently. Older full backups then rotated out. | Only ENOENT (gone meanwhile) is skipped. Anything else stops the backup, which is retried, as the top folder already did. |
| `portable.js` `writeOrigin` | 59 | **breach** | A held `origin.json` dropped `copyId`. This copy then opened a different Electron profile, so its sign-ins and site data looked gone. | Not rewritten while held; written next time. |
| `remotemain.js` `loadDevices` / `saveDevices` / `kick` | 66, 71, 262 | **breach** | A held list of paired phones was cached as `[]`. The next pairing saved only the new phone, and "Forget" saved `[]`. | Not cached while unreadable (read again next time). `saveDevices` refuses until the list has been read. `Forget` writes only a list it read. |
| `appshell.js` `firstRunShortcuts` | 297 | **breach** (small) | A held `shortcuts.json` was "first run", so the Windows shortcuts were planned again. | Held: skipped, and asked again next start. |
| `sync-engine.js` `renameThere` / `renameHere` | 1265, 1282 | safe | A rename already done on disk carries its base text. Unreadable means the renamed store's next merge is two-way, which keeps everything of both (a counter store may count one change twice). Refusing would leave the rename half recorded. | Audited. |
| `sync-engine.js` `prevText`, `restore` | 2069, 2087 | safe | The guard's base after a restore: `null` means no common base, so a window's later save keeps everything of both (round 97's design). The version in place goes to Deleted files first. | Audited. |
| `sync-engine.js` `copyBig` | 837 | safe | A big copy's resume note: unreadable means the copy starts again from 0. Only its own part file is rewritten. | Audited. |
| `sync-engine.js` `localJsonText`, `absorbCopy`, `choiceWrite`, `refreshExt`, `cloudHash`, `listConflicts`, `preview`, journal read, rename sweep (1507) | | safe | Already ENOENT-only (round 103), or they refuse, skip or `continue`; `preview` only shows. | — |
| `storework.js` `chatRestore` | 750 | safe | Refuses on the next line (`EHELD`, "Nothing was changed"). | Audited. |
| `storework.js` `syncPull`, `syncHash`, `readHead`, `rowsLoad`, kv `read` | 519–579, 275, 299 | safe | Pull: ENOENT-only, or `stale`. `syncHash`: `bad`. `rowsLoad`: a derived cache. The kv read with a fallback is covered by the store's guard (a save after a fallback read is merged with the disk). | — |
| `updatermain.js` `settle` | 454 | safe | Refuses on the next line (`if (!cur) continue`): the tracked file stays. | Audited. |
| `configsafe-core.js` `readState`, `migrate` | 44, 67 | safe | Read for decisions only. Its read-modify-writes now go through `patchState`. A default theme held at the move is copied next start. | Audited. |
| `safetynetmain.js` `readJson` | 30 | safe | Crash marker and journal: diagnostic, rewritten each start. The journal at a crash falls back to its `.prev`. | Audited. |
| `scenesafe-core.js` `prepareWrite` (periodic copy) | 172 | safe | The 10-minute automatic copy is a bonus. The reads that guard scenes leaving now refuse. | Audited. |
| `scenesafemain.js` `readJson`, `versionsmain.js` `fromZip` | 20, 188 | safe | Recover / Versions lists: an unreadable copy is left out of the list; restoring merges. | Audited. |
| `appshell.js` `loadWindowState`, `nativefeelmain.js` `readJson` | 153, 23 | safe | Window size and position memory: not the owner's work. | Audited. |
| `adobemain.js` `readJson`, `audiodoctormain.js` `runHelper`, `interopmain.js` (OBS test file), `assetsmain.js` `assets:read` / `readText` | 128, 37, 460, 249–251 | safe | Answers polled or shown (`null` = not yet, or failed). Nothing written from them. | Audited. |
| `gamemodemain.js` `buildScene`, `gametexmain.js` `pictures` | 230, 125 | safe | Play's page cache is rebuilt from the scene. A picture that can't be read is left as it is (not converted). | Audited. |
| `fsapi.js` `restoreBackup` | 303–346 | safe | Round 43: your chat, kv store or memory that's there but unreadable is never copied over ("unreadable" in the report, or it throws). | — |
| `datasafemain.js`, `costcoachmain.js`, `tokenauditmain.js`, `firstrunmain.js`, `hitchmapmain.js`, `importer.js`, `creative-vstmain.js` (takes), `deploymain.js`, `devices90-core.js`, `offline-project.js`, `winpolish.js` | | safe | Scans and lists that `continue` past a file they can't read, or show "not yet". Nothing written from the default. | — |
| `installs.js`, `engines.js` (connectors cache, MCP configs), `chromemain.js` (Chrome prefs), `macpolish.js` (PATH cache), `devreportmain.js` (crash list), `mcp/common.js` | | safe | Caches and diagnostics rebuilt by a scan. Round 43's baseline (`kind: main`). | — |
| `sync-engine.js` `scanLocal` / walk (333) | | safe | A folder that can't be listed is marked `blind`, so nothing in it counts as deleted (round 43 / 74). | — |
| `backupautomain.js` 266, 379; check (157) | | safe | Media already copied (`[]` copies them again); a card that can't be read keeps everything; the read-back check of a temp unzip. | — |
| Window / Lab: `hub.kvGet(name, fallback)` then `kvSet` (≈ 60 files, `kind: kv` in the baseline), `hub.kvGet(…).catch(() => default)` (`tools/three.js` 4562, `visual-feedback.js` 217, `versions.js` 246/250, `tools/refab.js` 95) | | safe | The store answers a failed read with the fallback and marks the store "in doubt"; the next save is merged with the disk (`store.js` / `datasafe-core.js`). The `.catch` only covers the IPC itself failing. The Lab's scenes use `tools/three-scenesafe.js` (status reads, retried). `projects.js`, `credits.js`, `labproj.js`, `weekendplan.js`, `tools/parisjournal.js`, `tools/quest-chat.js` read with `{ status: true }`. | — |
| Window / Lab: `hub.fs.read(…).catch(() => null)` (`chat-refs.js`, `tools/liveset.js`, `tools/loopsong.js`, `tools/parkjam.js`, `tools/refab.js`, `tools/sketchpads.js`, `tools/three-export.js` 87, `attachlean.js` 147) | | safe | Media bytes or a file's text for playback, a preview or an AI message. Nothing written from the default. `undoall.js` `loadLog` already waits on a held log. | — |
| Codex files (`projects*`, `project-workspace*`, `quest-*`, `workbench-*`, `astra*`, `cloud-files.js`, `engine-watch.js`, `creative-vstmain.js`) | | safe | No read-to-empty that is written: store reads go through the kv guard, and `workbench-ui` sets `writable` only after a good read. | — |
| Creative-direction files (`tools/three-direction*`, `collab-eyes.js`, `credits*`, `manager.js`, `missions.js`, `swarmlean.js`) | | safe | No breach found. `credits.js` reads with `{ status: true }` and keeps `unreadable`. | Not touched. |

## Tests
`dev/emptyread104-test.js` (`unit:emptyread104-test`, about 10 s) has 35 checks. On round 103's code, 16 of them fail:
the base held (counts 13, "gone" came back), the store thread's merge, the journal (3 lines became 1), the format note,
the sync guard, the store's hold, the scenes guard and `.prev`, and configsafe's note. All pass now. It covers:
- **sync** (two-computer simulator):
  - the base held while both computers change a counter store: no merge while held; 8 once it reads;
  - this computer's journal held during a pass: no earlier line lost, and the held pass's lines arrive later;
  - the format note held: the pass is `offline/held` and nothing goes up;
  - `guardWrite` on a held file throws `EHELD`, on ENOENT saves as given, and merges once it reads;
- **store thread**: `syncMerge` with a base that can't be read (EISDIR) answers `stale`;
- **store** (on a throwaway copy): a save whose sync guard throws `EHELD` leaves the file as it was, then is retried
  and merged;
- **scenes**: a save dropping scene `b` while the file can't be read is refused; a `.prev` that can't be read is kept;
- **settings**: configsafe's note held is not rewritten; once it reads, the mark is added and the rest kept;
- **scan**: the shapes above, round 102's `sync-engine.js` from git, and the app as it is passes.

Not covered by a test (Electron-bound, or behind a git update): `asideDo`'s refusal, the updater's journal and
`theme.css` refusals, `portable.js`, `remotemain.js`, `appshell.js`, and `config:save`'s hold. Each is a few lines and
mirrors the tested shapes.

## Final runs (this branch)
- `node dev/emptyread104-test.js`: ✓ 35/35.
- `datasafe-test` 104/104, `scenesafe-test` 79/79, `configsafe-test` all passed, `backupauto-test` 107/107,
  `datasafe-scan` pass (82 audited, 0 new).
- Full unit list (`node dev/run-checks.js unit`), `sync72 sync keptaside94 projects labsync88 lazy` under the lock,
  and `node dev/sync72-test.js --thread`: see below.

## For Codex
Minimal edits, each marked `(round 104, emptyread104)`:
- `sync-engine.js`:
  - `readBase`: ENOENT is "none"; any other read error throws, so the merge waits. A base that doesn't parse is still
    "none".
  - `readFormat` → `{ held: true }` when the note is there but unreadable; `passOnce` then ends `offline / held`.
  - `flushJournalNow`: a held journal throws (the caller logs it) and keeps `journalOut`.
  - `guardWrite`: a held file throws `EHELD` (ENOENT is saved as given). `store.js` and `main.js` hold the save.
  - `asideDo` "Keep both": an unreadable version here refuses.
- `cloud-files.js`, `projects*`, `quest-*`, `workbench-*`, `astra*`, `engine-watch.js`, `creative-vst*`: nothing found;
  untouched.

## For the patch notes
- **Your work stays safe when Windows holds a file for a moment.** Some places in Hearth still read a file that was
  briefly busy (held by an antivirus, OneDrive or the search indexer) as if it were empty, and could then save over it.
  Now they wait a moment and try again, and nothing is written over your files. These cases are fixed:
  - **Sync counts and deletions**: a usage count could be counted twice, or something you deleted on one computer could
    come back.
  - **Sync's own records**: its list of changes could lose earlier entries.
  - **Saves from a window**: saving right after a change arrived from your other computer could undo that change.
  - **Lab scenes**: a scene could leave the save without the usual safety copy.
  - **Updates**: a half-finished update's notes could be cleared before your own edits were put back, and your
    `theme.css` could be replaced.
  - **Keep both**: in sync's kept-aside versions it could quietly become "use the other one".
- **Backups**: a backup is never made without a folder it couldn't open. It waits and tries again.
- **Small things**: paired phones, this copy's browser profile and the first-run shortcuts no longer reset when their
  note is busy at the wrong moment.
- **Behind the scenes**: the data-safety check now looks at each place a file is read, not file by file. It recognizes
  the shape that caused round 103's settings problem, so a new one can't slip in.
