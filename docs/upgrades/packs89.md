# packs89: very long chats sync in pieces (round 89): Phase 1, behind a setting that is off by default

**What shipped:** Phase 1 of `docs/upgrades/bigsave88.md`. It sits behind **Settings › This computer & sync ›
"Send very long chats in pieces (both computers need this update)"**, which is **off by default**.

When the setting is on on both computers, a chat of 16 MB or more no longer uploads its whole file for every reply.
Each reply sends only the new pieces of the chat, plus a small index, into `<cloud>/Hearth/packs/`. The other
computer puts the chat back together from those pieces. The whole chat file in the cloud folder is still written, but
only once the chat has been quiet for 3 minutes.

This computer's data folder still keeps every chat as one whole file, so nothing that reads chats here changed.

**With the setting off, nothing changes.** No pack code runs, the machine record is the same, and the cloud files and
data folders come out byte for byte the same as before. The setting also does nothing unless the other computer has it
on too.

## The numbers

These come from `node dev/packs89-test.js --only bench`, which uses the real sync engine on two simulated computers
(`dev/sync-sim.js`) and a made-up chat of 20.76 MB with 6,000 messages. There are six replies, alternating between the
PC and the Mac. "Upload" is the bytes the replying computer's cloud folder sends to the server.

| Per reply in a 20.8 MB chat | Today (setting off) | Setting on, both computers |
|---|---|---|
| Uploaded by the replying computer | **20.57–20.59 MB** (the whole chat file, every time) | **319–333 KB** (avg 325 KB: new pieces + the index) |
| …of which is the whole chat file | 20.6 MB | **0** (it waits for a quiet moment) |
| Downloaded by the other computer | 20.6 MB | the same ≈ 325 KB |
| Once per chat | — | the first build of the pieces: 20.6 MB (a single upload; the other computer re-uses the same pieces) |
| Once the chat is quiet (3 min) | — | the whole file, once, by one computer: 20.6 MB |

That is about **63× less per reply**. Over a working session the saving is less than 63×, because the whole file
still goes up once each time the chat goes quiet. For the doc's real 60 MB chat, the expected saving is about the
same: each reply sends roughly 0.8 MB instead of 61 MB.

In the real app, the app check `packs89` ran with a 546 KB chat and the "very long" line lowered to 300 KB for the
check. Each reply wrote **20.4 / 20.8 / 21.2 KB** of pieces into the cloud folder and **0** bytes of the whole file.

Where the time goes:
- Publishing and taking pieces run on the store's **files thread** (`storework.js`, op `syncPack`), the same thread
  as round 82's `syncText`, `syncPull` and `syncMerge`.
- The main process only reads small index files and calls `stat`.
- In the bench, which ran in-process, one publish took the time of one cloud-form pass over the chat. That is the same
  work the engine's push does today, but it now ends in ≈ 325 KB written instead of 20 MB.
- See the "lane time" line that `--only bench` prints.

## How it works (Phase 1: the cloud only)

**New files:**
- `syncpack-core.js` (pure; runs on the files thread and in Node tests): the gate, `decide()`, `publish`, `take`,
  `text`, `tidy`.
- `syncpack.js` (main side): the pack lane. `syncmain.js` creates it only when the setting is on.
- `chatpack-core.js` (round 88): the pack format, unchanged.

**The gate.**
- This computer's machine record says `packs: 1` only while the setting is on here. The record is rewritten as soon as
  the setting changes.
- Packs are used only when every other computer's record also says `packs: 1`. The gate stays shut, so the whole file
  syncs as today, in all of these cases:
  - an older Hearth is in the records;
  - a record can't be read (it is being written, or cut);
  - this computer is the only one;
  - the lane's own state file can't be read.
- The gate is checked at every pass. When it shuts, the very next pass sends the whole file.
- Why the gate tests `packs` and not `format ≥ 88`:
  - The sync format stays **74** on purpose.
  - Raising it would make every older Hearth refuse to push or merge over any file this one wrote, and that would
    happen for every file, not only giant chats.
  - Every Hearth before round 89 lacks `packs`, so `packs ≥ 1` already means "this update or newer, with the setting
    on".

**For a chat of 16 MB or more, while the gate is open:**
- **Publish.** After each pass, if the chat changed here, its cloud form goes into
  `Hearth/packs/chats/<id>/` (chatpack's compact layout). Each piece is written to a temp file, flushed, then renamed,
  and the index (`m-<this computer>.json`) is written last.
  - Only the tail and any segment whose messages changed are written. The pieces are compared by bytes with the last
    publish, and the files thread keeps those bytes for two chats at most.
  - A piece that the last index names but that is missing from the folder (lost by the cloud, or tidied away) is
    written again under the same name. This check also runs every 10 minutes, so a lost piece heals.
- **Take.** For each other computer's newer index:
  - All of its pieces must be there and check out against their names. Otherwise the chat is "waiting", stays exactly
    as it is here, and is listed in the sync panel as *"a very long chat: its newest part is still coming…"*.
  - The chat is then merged three-way on the files thread (round 82's `mergeChat`).
  - The base is the newest version both computers are known to have had: the last version taken from that computer,
    or this computer's own version that the index says it took. Both are kept in `data/sync/packbase/<id>/`, with
    pieces shared by name.
  - With no base, the merge keeps everything (`keepAll`).
  - The local file is written through the **engine's own compare-and-swap** (`casWrite`). This computer's previous
    version is kept first in `data/sync/recovery/`, as for a pull today. The window hears of it through the engine's
    `notePulled`, as for a pull.
- **A field changed two ways** (for example, the title):
  - The newer chat wins: `updatedAt` first, then the computer's name. Both computers reach the same answer.
  - The losing side's whole version is kept in Deleted files with a **Kept aside** note (the engine's own `sync-aside`).
  - If the owner turned "settle conflicts by themselves" off, the conflict is listed for a choice instead, as today
    (a conflict copy plus a record).
- **The whole cloud file**: the engine's plan asks the lane (`decide()`, only for giant chats):
  - *changed here and not quiet* → **held**. The pieces carry the change, and the chat is looked at again next pass.
  - *quiet for 3 min* → written as today. The computer whose chat it is writes it: its own change or a merge.
    - A computer whose chat is an exact copy of the other's latest leaves the write to that computer, unless the chat
      has been quiet for 12 min.
  - *both changed, and the cloud's whole file is a version this computer already took in* → it **becomes the base**
    (adopt), so the next whole write is a plain push and never a stale merge.
  - *both changed, the cloud's whole file is the other computer's version, and its pieces are still on the way* →
    waits for them.
  - *anything else* (a whole file nobody published as pieces, such as one from an older Hearth or from a computer
    whose gate was shut) → **the engine merges, exactly as today**, from its own base.
- **The engine's base stays a true common ancestor.** It only ever comes from what was really in the cloud's whole
  file (a push, a pull, a merge, or an adopt of that very version). So a stale whole file written by an older Hearth
  merges correctly without `keepAll`. The mixed-join simulation shows this: three computers, nothing lost.
- **`format.json min: 88` is not written**, after weighing it ("used carefully"):
  - The engine stops writing when `min > its format`. This Hearth's format is still 74, so `min: 88` would lock out
    this very version on both computers, and every older one.
  - It isn't needed. The gate, plus the base rule above, keeps an older Hearth's whole-file writes safe, and the
    whole file is never missing or empty.
  - If a later phase changes the whole-file format, it should raise the format and write `min` in the same release.

**A chat deleted here** is never re-created from pieces. A take with no local file is allowed only when this computer
never had the chat: no lane state, no engine base, and no `data/trash/<id>.json`. Deletes follow the engine's own
rules.

**Tidy** runs at most every 6 h, with a grace of 1 day:
- Pieces that no index in the folder names go to **this computer's pack trash**, `data/sync/packtrash/{cloud,base,self}/<day>/`.
  They are moved, never deleted. A move out of the cloud folder copies the piece, then removes the original.
- If any index can't be read, nothing moves.
- Days older than 30 are let go.

## Safety argument (the rules)

- **A read failure is never "empty".** Each of these makes the lane wait, and the chat stays exactly as it is:
  - a cut or garbled index;
  - a missing, short or zero-filled piece (a placeholder);
  - a piece whose hash doesn't match;
  - a local file that can't be read.
- An unreadable lane state shuts the lane and is never written over. Everything then syncs the whole-file way.
- Tested: `failures` (a cut index, a zero-filled piece, an unreadable state), `lost`, and `slow`.
  - "Never shorter" is checked after every round on every computer in every scenario.
- **Deletes go to the Trash or the pack trash (30 days).**
  - The lane deletes nothing.
  - Old pieces and old own versions are moved to the pack trash.
  - A conflict's losing side goes to Deleted files.
  - The previous local version goes to `data/sync/recovery/` first.
- **Nothing is uploaded except through the owner's own sync folder.** The pieces live in `<cloud>/Hearth/packs/`. The
  cloud client moves them like any other file. No network code was added.
- **Secrets never sync.** The pieces are the same bytes as the chat's whole cloud file, cut into parts. No new kind of
  file is synced, and the files the secret rules block (`.env`, keys…) are never chats.
- **Never touch real data.** Every test and the app check use made-up chats in temp folders. The app check's cloud is
  in the run's own scratch folder.
- **Off = today.** In the `off` simulation, an engine with the lane but the setting off gives exactly the same cloud
  files (names and bytes), data folder and upload bytes as an engine without it.
  - There is no `packs` key in either record, no `Hearth/packs/`, and no `data/sync/packbase/`.
  - All the sync suites pass unchanged with the setting off.
- **No click can reach anything unsafe.**
  - Ticking the box on one computer only says so in its record. Nothing changes until the other computer ticks it
    too.
  - Unticking stops the lane at once: the record is rewritten, the other computer's gate shuts, and the whole file
    goes.
  - Turning the setting off mid-stream loses nothing (`turnoff`).

## What's on, what's off

- **Off by default.** The row is in Settings › This computer & sync (lazy `appui-dialogs.js`; nothing on the first
  screen). It shows only while sync is on.
  - While the other computer doesn't have it on, it says *"On here: waiting for your other computer to have it on too
    (until then everything syncs as before)"*.
- On a computer where it is on but the gate is shut, it stays inert: everything syncs as before.
- `HEARTH_PACKS89=force` (tests only) turns it on in `syncmain.js`. `HEARTH_PACKS_MIN` and `HEARTH_PACKS_QUIET_MS` move
  the 16 MB line and the 3 min quiet time (the app check uses them through `run-checks`).

## Tested

- **`dev/packs89-test.js` (UNIT): 99 checks, 13 scenarios, ≈ 90 s.** All of them use the real engine and the lane on
  two or three computers through `dev/sync-sim.js`.
  - `off`: byte for byte the same as today.
  - `bench`: the table above.
  - `mixed`: an older Hearth on the other computer gives no pieces, and the whole file syncs as today. An older Hearth
    joining mid-stream shuts the gate on both, gets every message (including one in flight), and its own write merges.
    Nothing is lost or doubled on any of the three, and nothing gets shorter.
  - `turnoff`: the setting off mid-stream on the Mac, then on again.
  - `gate`: a cut machine record shuts the gate, then it opens again.
  - `slow`: slow uploads and downloads in pieces. Indexes arrive before their pieces, the chat waits, and it is never
    shorter.
  - `lost`: a piece the provider loses. The other computer waits, then the writer puts the piece back.
  - `both`: both computers offline add messages, a reaction, a pin and a title. Everything is kept and nothing is
    doubled. The newer title wins on both, and the other is Kept aside, with Compare working.
  - `tidy`: orphan pieces are moved, never deleted, every index still reads, 30 days are kept, and the chat still
    syncs.
  - `failures`, `thread` (the storework op), `decide` (every branch, and the gate / records), and `deleted`.
- **App check `packs89`** (`run-checks --exact packs89`):
  - the row by clicks: off by default, ticked, then unticked;
  - the record says `packs`, the gate opens against a fake Mac with `packs: 1`, and the pieces appear;
  - each reply writes 20–21 KB of pieces and **0** of the whole file;
  - unticked: the whole file goes at once with every reply, and the record drops `packs`.
- **The sync suites with packs forced on.** `node -r ./dev/packs89-force.js dev/<suite>.js` gives every engine the
  lane, for every chat (the line at 1 byte), with a 6 s quiet time on the test clock:
  - sync72-test **179/179**; storeack77-test **177/177**; syncstate75-test **109/109**; twocomputers-test **117/117**;
    cloud-files-test passes.
  - synchard74-test **162/164**. The two misses expect the chat's whole cloud file to go at once:
    - "locked": a lock on that file is expected to show;
    - "sleep": the engine's sleep check only runs between operations, and there is one fewer when the chat is held.
    - With the quiet time at 1 ms (`HEARTH_PACKS_QUIET_MS=1`): **164/164**.
  - syncscope79-test **174/175**. The miss: "no whole look after the first sync". Under packs-for-every-chat the run
    needs more rounds, and its simulated clock moves ahead of the folders' real times, so one folder rename on the Mac
    looks "late" and earns one whole look. Data is all correct, and the lossy run passes.
  - synclatency77-test **37/38**. The miss is "a store that young still waits 2 s": pieces are checked by their
    hashes, so they don't need the half-written-file wait, and the change arrived sooner.
  - **None of these misses is lost or wrong data. Each is a check that expects the whole file to move at once, which
    is what the setting deliberately changes.**
- **The same suites with the setting off (unchanged):** all pass (list below).
- **The rest:** see "Runs" at the end.

## What's left

1. **Phase 2** (bigsave88's plan): keep this computer's giant chat as a pack too. That would save the store thread's
   0.1–0.3 s and the 124 MB of disk writes per exchange. It needs the readers' audit described there.
2. The **first build** of a chat's pieces uploads it whole once (per chat, by the first computer). Very old giant chats
   that never change again never need it. A chat is only built when it changes with the setting on.
3. **Pack trash size.** Each reply leaves the previous tail as an orphan. At ≈ 0.3–1 MB per reply, a heavy day of 100
   replies in a 60 MB chat can put up to ≈ 50–100 MB a day into `data/sync/packtrash/`, kept 30 days. Disk calm (round
   53) doesn't list it yet. A size cap, or a shorter time for tails only, needs the owner's say, since the rule today is
   30 days.
4. **A computer that never comes back** (an old PC retired with this update) keeps its record, so the gate stays open
   for it, while one without `packs` keeps it shut. Forgetting a computer is a separate feature (the records are
   today's, untouched).
5. **The whole file waits** for the computer whose chat it is. If that computer goes offline for good right after a
   reply, the other one writes the whole file after 12 min quiet (4× the quiet time). Until then an older Hearth
   joining would see the version from before that reply. That is valid, and it merges on the way back.
6. `format.json min` stays unwritten (see above). If a future phase changes the whole file, raise the format and
   `min` together.
7. Not measured on the real PC and Mac yet: see `docs/windows-test-plan.md` § 4f.

## For Codex

`sync-engine.js` got **seven marked blocks**, all commented `(round 89, packs89)`. With `o.packs` absent (the setting
off), every one is a no-op: `PK` is `null`, and each block is guarded `PK ? … : …` or `PK?.…`. The logic lives in
`syncpack.js` and `syncpack-core.js`.

1. `const P_safe = …` at the top: a computer's name as a pack writes it (chatpack's `safeBy`). Used to map a pack's
   writer back to its machine record, for names in notes and conflict records.
2. `const PK = o.packs || null;` in `createEngine`: the lane, or nothing.
3. `writeMachine`:
   - the record gets `...PK.record()`, which is `{ packs: 1 }` while the setting is on and `{}` otherwise;
   - it is rewritten at once when that part changes (`machinePk`), so the other computer's gate follows within a pass;
   - without the lane: the same record, the same 10-minute pace.
4. **The plan hook** in `passOnce`, after the INFLIGHT/BAD checks, only for `chats/*.json` with a local file:
   - `PK.plan({ rel, L, C, lh, ch, bh })` → `null` (go on as today), `{ hold }` (skip this pass, looked at again next
     pass; `'pieces'` counts as waiting), or `{ adopt }` (`setBase(rel, ch, bytes)`, then skip).
   - This is where the whole cloud file is held while the pieces carry the change.
5. **The lane pass** after the operations (not when asleep, stopping or quitting): `PK.pass({ local })`.
   - Its waiting chats go into `why(rel, 'pieces')`.
   - The files it wrote go into `pendRels` (so a scoped pass doesn't count them as lost events).
   - Takes and publishes count in `sum.pulled` and `sum.pushed` (syncmain's pacing sees the activity).
6. `publicStatus` gets `packs: PK.status()` when the lane exists (the Settings row reads the gate).
7. `PK?.attach({...})` before `return`. It hands the lane the engine's own tools, so it follows the same rules:
   - `casWrite` (with fault tag `'pack-take'`), `afterLocalWrite`, `notePulled`, `aside.add`, `nameOf`;
   - `state.base` (`knows`), `o.autoResolve`, the conflicts folder, and `writeConflictRecord` with `sides`.

**`cloud-files.js`: no change.**

Other files outside Codex's:
- `syncmain.js`: creates the lane when the setting is on, adds `sync:packs`, and `packs` in the status.
- `storework.js`: the `syncPack` op.
- `preload.js`: `sync.packs`.
- `appui-dialogs.js`: the Settings row.
- `sync-panel.js`: the "pieces" wording.
- `dev/sync-sim.js`: upload bytes per folder, in `stats.upBy`.
- `dev/run-checks.js`: `unit:packs89-test`, the `packs89` check, its env, and the group.

## For the patch notes

- **New, off unless you turn it on:** Settings › This computer & sync › **"Send very long chats in pieces (both
  computers need this update)"**.
- Today, every reply in a very long chat (thousands of messages) makes your cloud folder send the whole chat to your
  other computer again. For a 20 MB chat that is 20 MB per reply.
- With this on (on **both** computers), only the newest part of the chat travels: about 0.3 MB per reply in our test,
  instead of 20 MB. The full chat file is still sent once the chat has been quiet for a few minutes, so nothing is ever
  missing from your cloud folder.
- Your chats on each computer are kept exactly as before. Only what goes through the cloud folder changed.
- It only switches itself on when your other computer has the update and the box ticked too. Until then it says so,
  and everything syncs as it always has. Untick it any time: everything goes back to the old way at once.
- If a piece is late or lost on the way, Hearth waits for it. A chat is never shown shorter than it is. If the same
  chat was changed on both computers at once, nothing is lost: the newer change wins, and the other version waits in
  Deleted files with a note in the sync panel.

## Runs

(filled in below with this round's results)
