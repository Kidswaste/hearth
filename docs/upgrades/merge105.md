# merge105 (round 105): a rename keeps its sync base; the web page export reads a giant chat in pieces

Two items round 104 left open:
- `docs/upgrades/emptyread104.md` audited `sync-engine.js` `renameThere` / `renameHere` as "safe". A rename whose base
  couldn't be read made the store's next merge **two-way**, and a counter store could count one change twice.
- `docs/upgrades/checksgc104.md` made `/export` json, md and txt read a windowed giant chat a range at a time, but the
  web page (`html`) still loaded it whole.

Both are fixed. Every number below is from this box: 4 CPUs, SwiftShader under Xvfb, shared with other streams. The
load swung from 1 to 10 during the round. App runs were under `flock /tmp/hearth-run.lock`, on bigchat84's fixture
(`/tmp/hearth-bigchat84`: 6,000 messages, 63 MB, made up).

## 1. A rename that lost its base text
### Cause
Sync keeps a **base** for each JSON store: the last version both computers had, as text, in `data/sync/base/<rel>`.
A three-way merge needs it to tell "added here" from "added there" and "removed" from "never there".

A rename is detected as a delete plus an add with the same hash. `renameThere` (this computer renamed it) and
`renameHere` (following the other computer's rename) carried the base like this:

```js
const t = S.isJsonRel(from) ? await fsp.readFile(basePath(from), 'utf8').catch(() => undefined) : undefined;
setBase(to, h, t); dropBase(from);
```

If the old base file was held at that moment (an antivirus, OneDrive or the indexer on Windows), `t` was `undefined`.
The new name kept the base's **hash** but no **text**, and the old base file was then removed. The store's next merge
found no base text and merged two-way. For a counter store (`usage.json`, `kv/token-stats.json`, `kv/ui-usage.json`,
`kv/astra-scoreboard.json`) that means `0 + ours + theirs`: both computers' whole counts were added. Something removed
on one computer also came back.

Reproduced with the two-computer simulator (`dev/merge105-test.js`, on round 104's code). Both computers have
`{ clicks: { lab: 5 }, gone: {…} }`. The PC moves the store (`stats/tally.json` → `usage.json`) while its base file is
held (EBUSY). Then the Mac adds 1 and removes `gone`, and the PC adds 2:

| | round 104 | this round |
|---|---|---|
| PC's base under the new name | **none** | moved (the version both had) |
| count after the merge (5 + 1 + 2) | **13** on both | **8** on both |
| `gone`, removed on the Mac | **back** on both | stays removed |

The same happens on the store thread (`storework.js syncMerge`) and when the Mac follows the rename (`renameHere`).

### Fix
- **The base moves with the file** (`sync-engine.js` `movedBase`, used by both renames). The old name's base file is
  read as before. If it can't be read, or isn't there, the base is taken from the **renamed file itself**: a rename is
  the same content under another name, so the file is that very version when its cloud form hashes to `h`. Its form is
  the one bases are written in (`canon(toCloud(…))`, as `localText` makes). A file that changed meanwhile doesn't match
  and isn't used.
- **When the base truly can't be had**, counters merge safely without it. If a store has a known common version (its
  hash is in `state.base`) but no base text on disk, the merge passes `shared: true` to `merge3`. That is the existing
  rule for a cloud client's copy (round 72): a count keeps the **larger** value and is never added twice. The main side
  passes `shared: Boolean(state.base[rel])`. The store thread passes `shared: Boolean(baseFile)`, since the engine sends
  `baseFile` only when `state.base[rel]` is set. A first join (no common version) still adds, as before. Only counter
  stores are affected. Everything else is still two-way (it keeps everything of both).
- `dev/datasafe-baseline.json`: the two audited `renameThere` / `renameHere` read entries are gone, since that read no
  longer exists (the scan: 80 audited, 0 new, 0 stale).

Kept: guard bases (`remember`), `store.settle`, `choiceWrite`, `EHELD` and "never empty" are untouched. A **held**
base during a merge still makes the merge wait (round 104's `readBase`). Only a base that **isn't there** reaches
`shared`. No file format changed, so mixed versions are safe. The base is this computer's own state. The previous
release on the other computer follows the rename and merges as it always did (tested below).

### Proof
`dev/merge105-test.js` (`unit:merge105-test`), main side and store thread, 22 checks:
- **rename**: the PC moves the store while its base is held. It is a real rename (`renamed: 1`, not a new upload). The
  PC's base under the new name is the version both had, and the old one is dropped. Counts end at 8 on both, and `gone`
  stays removed.
- **follow**: the Mac is offline while the PC moves it, so it sees the old name gone and the new one in one pass. It
  follows with `renameHere` while **its own** base is held. Its base moves too, and the counts end at 8.
- **gone**: the base text is removed on both computers after the rename (hash known, text gone). The counter ends at
  **7** (the larger), never 13. `gone` is kept, since a two-way merge removes nothing.
- **mixed**: this release on the PC and the previous release (`sync-engine.js` from git, before this round) on the Mac.
  The rename reaches the Mac, and the counts end at 8 with `gone` removed.

On round 104's code, 12 of the 22 fail (13 on both, `gone` back, no base under the new name).

## 2. HTML export of a windowed giant chat
### Cause
`/export html` loaded the windowed chat whole (`Native.loadWhole`, ≈ 90 MB of objects). It then rendered every reply
(`replyHtml`) before writing a byte. When the chat went back to its window, the objects were let go in garbage
collections the window had to wait for.

### Fix
- `chatexport-core.js` **`htmlFrom(chat, ranges, o)`**: the page from `ChatWin.ranges` (400 messages at a time), the
  same way as `jsonFrom` / `mdFrom`. For each range, its replies are rendered by `o.render(texts)` in batches of about
  0.5 MB of text, as `replyHtml` batched them. Then the range's rows are made with `o.row(m, i, html)`. Only one range's
  messages and HTML are held at a time.
  - A count that doesn't add up to `ranges.n` throws.
  - A render that comes back short throws.
  - A render that throws ends the stream.
  - `chat-cmds.js` `exportBig` then ends the save stream with `false`, so a partial page is never written as the whole.
    `ChatWin.ranges` already throws on a short or failed range read.
- `chat-cmds.js`: **`mdRender()`** is the Markdown worker (`md.js`) that `replyHtml` already used, now shared:
  `render(texts)` gives the worker's HTML, or `renderMarkdown` here only when the worker can't run (as before).
  `close()` ends the worker after the export, even when it fails. `/export` now asks `ChatWin.ranges` for every format.
  The row is the same `htmlRow(m, agent, …)` as the whole-chat way, so the bytes are the same.
- `dev/chatwin-scan.js`: chat-cmds.js's audited `.messages` count is 33 → 32 (`replyHtml` reads one line fewer). The
  reason now says /export of a windowed chat reads it by ranges.

### Proof
- `dev/bigchat84-test.js` (extended): for every test chat, `htmlFrom` with ranges of 1, 7 and 400 and batches of
  0.5 MB, 40 chars and 1 char gives **exactly** `html()`'s page with the same renderer. Replies are rendered a range at
  a time (never more than a range per call). Three cases throw: a short read, a render that comes back short, and a
  render that fails. 177/177.
- `dev/checks/chatwindow86.js` (new step `exportHtml`): `/export html` of the windowed giant chat.
  - It stays windowed and reads 14 ranges.
  - The page (61,765,312 bytes) has the **same SHA-256** as the same command run on the chat loaded whole (the
    whole-chat way: `replyHtml` + `ChatExport.html`).
  - `same: true` in all 3 runs. The step's window tasks: `ok` (no long task) in the quiet run, `load` (the box) in the
    others.
- `dev/checks/gc104-measure.js` (`GC104=1`, new stretch `exportHtml`: the export, then 20 s of scrolling). Before is
  commit `72122bd` (this branch before the HTML change) via `dev/smoke.js --app`:

| exportHtml stretch | before (loads whole) | after (by ranges) |
|---|---|---|
| heap peak | **255.1 MB** | **158.3 MB** |
| GC-only tasks ≥ 10 ms (wall / own CPU) | 10: 27.3/11.8, 22.8/7.6, 22.1/10.9, 21.6/17.2, 18.4/9.9, … | 4: 18/8.5, 14.7/9.3, 12.1/9.6, 10/8.5 |
| worst GC own CPU | 17.2 ms | 9.6 ms |
| the export itself | 3,945 ms | 3,376 ms |
| stays windowed | after `rewindow` | throughout |

  The JSON export stretch (unchanged path) in the same runs: 152.9 MB / 174 MB peak, worst GC 8 / 11.3 ms CPU (noise).

## Final runs (this branch)
- `unit:merge105-test` 22/22 · `unit:bigchat84-test` 177/177.
- `unit:sync72-test unit:syncsweep97-test unit:syncrace98-test unit:syncstall103-test unit:emptyread104-test
  unit:kvrename99-test unit:sync-test unit:packs89-test` ✓ 10/10 (with merge105 and bigchat84).
- `unit:aside95-test unit:chatwindow86-test unit:datasafe-scan unit:winmac-test unit:errorcalm-scan unit:storeack-scan
  unit:chatsafe-scan unit:chatwin-scan unit:boot-test unit:lazymanifest-test` ✓ (chatwin-scan after its count, above).
- `node dev/sync72-test.js --thread`: 209 passed, 0 failed.
- `bigchat84 sync72 sync keptaside94 lazy` ✓ (bigchat84: "can't tell under load", a 66 ms open task, 46 ms of its own).
- `chatwindow86` (`CHATWINDOW86=1`) ✓ once the box was quiet (load 2.5): "can't tell under load", a 75 ms `send` task
  with 21.7 ms of its own CPU. A direct `dev/smoke.js` run also passed with no problems.
  - Its `export` and `exportHtml` steps passed in every run: the same bytes, and the chat stayed windowed.
  - Earlier runs under load 5–10 each failed once, each on a different step this round doesn't touch:
    - `send`: a 651 ms task with 4.6 ms of its own CPU;
    - `send`: the main process's `cost.js` took 126 ms;
    - `send`: 103 ms;
    - `reply2`: the store thread's numbers took 149 ms, over 120.
  - The base build (`adf08b1`, via `--app`) with this check showed only the expected `exportHtml: loaded whole`.

## For Codex
Minimal edits, each marked `(round 105, merge105)`:
- `sync-engine.js`:
  - new `movedBase(from, to, h)` beside `renameThere`: the old base file, or the renamed local file's cloud form when it
    hashes to `h`, or `undefined`;
  - `renameThere` / `renameHere` use it (was: `readFile(basePath(from)).catch(() => undefined)`);
  - `merge` (main side): `merge3(…, { …, shared: Boolean(state.base[rel]) })`.
- `cloud-files.js` and the other Codex-owned files: untouched.
- Not Codex's: `storework.js` `syncMerge` passes `shared: Boolean(baseFile)`. `sync-merge.js` is unchanged (its
  `shared` rule is round 72's).

## For the patch notes
- **Sync counts stay right after a file is renamed.** If you renamed or moved one of Hearth's synced files while
  Windows was holding sync's own note about it for a moment, the next sync could add both computers' usage counts
  together (13 instead of 8). Something you deleted on one computer could also come back. Sync now carries that note
  along with the file. If the note is truly missing, counts keep the higher number instead of adding twice.
- **Exporting a very long chat as a web page is lighter.** `/export html` now reads a very long chat in pieces, as the
  other formats already did. It doesn't load the whole chat into the window first. Memory during the export peaks about
  100 MB lower, and the short pauses afterwards are fewer and shorter. The file is exactly the same as before. If a part
  can't be read, nothing is saved, so you never get a half page.
