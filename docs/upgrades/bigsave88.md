# bigsave88: a giant chat's stored form that changes little per save (round 88) — core built and tested, not switched on

**What shipped this round:** the measured costs, the design, its core (`chatpack-core.js`) with 98 checks
(`dev/bigsave88-test.js`), and the plan below. **Nothing in the app uses it yet, and no setting was added**: there is
nothing live to turn on. Wiring it in needs edits inside the sync engine (a Codex file) and a version handshake between
the two computers. That is too much to ship safely in one round, so the safe choice was to build the pieces and prove
them first. Nothing about how Hearth saves or syncs chats changed this round.

## The real costs today (measured)
`node --max-old-space-size=6000 dev/bigsave88-test.js --bench` on bigprofile's giant chat (made up, fixed seed, never
real data: 6,000 messages, 61.9 MB on disk, 60.8 MB as its cloud form). The real store thread as a worker, the real
`chatDelta` / `syncHash` / `syncText` / `syncPull` ops. A shared 4-CPU box, load 10 (other streams running), so the
times are noisy; the bytes are exact.

One exchange = your message saved + the reply saved = **2 saves by change** (round 82's way).

| Cost per exchange in a giant chat | Today |
|---|---|
| Store thread: each save by change | **131–346 ms** (median 229 ms); two per exchange |
| Bytes written on this computer | **61.9 MB per save, 123.9 MB per exchange** (the whole file, rewritten) |
| Main process | ≈ 0.1 ms per save (only the change passes through it) |
| Window | ≈ 2 ms per save (its loaded messages compared; chatwindow86) |
| Sync, each pass that finds the chat changed (files thread) | hash: 373 ms; the cloud text: kept from the hash |
| …bytes the sending computer writes for sync | **60.8 MB cloud copy + 60.8 MB base copy** |
| …bytes the cloud client uploads | **60.8 MB** |
| Receiving computer: pull (files thread) | 812 ms |
| …bytes it downloads, then writes | **60.8 MB down**; then **184.6 MB written** (its chat file, a recovery copy of the old one, the base copy) |

So in a giant chat one exchange today costs about **124 MB of disk writes and 0.3–0.7 s of the store thread on this
computer, 122 MB more for the sync pass, 61 MB uploaded, 61 MB downloaded and 185 MB written on the other computer**.
The main process and the window are already fine. Disk wear, the store thread's time and, above all, the cloud
traffic are the costs.

## The same exchange kept as a pack (measured with the core)

| Per save | Today | Pack: this computer's file (pretty) | Pack: the cloud form (compact) |
|---|---|---|---|
| Time to write | 131–346 ms | **2–16 ms** | **4–17 ms** |
| Bytes written per save | 61.9 MB | **5 KB – 1.2 MB** (the tail + a 5 KB manifest) | **0.4 MB** |
| Bytes per exchange | 123.9 MB | 2.3 MB worst seen (≈ 1 MB typical) | **0.8 MB** (vs 121.6 MB written + 60.8 MB uploaded) |
| A reaction on message #100 | a whole save | 27 ms, 2.4 MB (its segment + the tail) | 12 ms, 0.7 MB |
| Reading the whole chat back | — | 166 ms (every piece's hash checked, the count checked) | 159 ms |
| First build of the pack | — | 434 ms, once | 458 ms, once |
| Segments | — | 72 | 77 |

Read back, both packs are **the very same bytes** as the whole file (`sameBytes: true`).

What changes per save is **about 100× smaller** in the cloud form and 50–10,000× smaller on disk. The tail is
the messages since the last sealed segment: it grows until a segment seals (between 512 KB and 4 MB), then starts
again near zero.

## Design
### The pack (`chatpack-core.js`)
- **A chat's bytes are unchanged.** The chat is still exactly what the whole-file way writes: `pre` + the messages
  list + `post`. That is `JSON.stringify(chat, null, 2)` on this computer, or the compact cloud form. A pack only
  stores those bytes in pieces.
- **Segments** `<sha1>.seg`: the bytes of messages `[a, b)`, joined by the layout's separator. Each is named by the
  sha1 of its own bytes, so:
  - a piece is never written over;
  - a name says what the file must hold, and every read checks it;
  - two computers holding the same messages make the same file.
- **Where segments end is decided by the messages alone.** This is content-defined. A segment closes after a
  message once it holds ≥ 512 KB and that message's hash says so (1 in 32), or at 4 MB. As a result:
  - the same messages give the same segments, on every computer and after any history of saves (tested);
  - a new message only changes the **tail**;
  - a change to an old message changes its segment, and rarely the next one.
- **A manifest per computer**, `m-<computer>.json`. It holds the chat's own fields (`pre` / `post` as exact text),
  the message count, the segments in order (hash, count, size), which ones are sealed, its sequence number and
  `took`: which of the other computers' versions it took in. It also holds a sha1 of itself, so a cut or garbled
  manifest is refused.
  - Two computers never write the same file: no "x 2.json" copies from the cloud client, no lost upload.
- **A save** writes the new pieces first (temp file, flushed, renamed), then the manifest last, the same way.
  Unchanged segments are reused by name. The caller keeps one small record per message (its length and its cut bit)
  between saves, so a save hashes only what changed.
- **Tidy** (after a save, with a grace time, a day by default) only acts on pieces that no manifest in the folder
  names, and on temp files a crash left behind.
  - It **moves** them into the pack trash (`<trash>/<day>/<chat>/`). It never deletes them.
  - The trash keeps 30 days.
  - If any manifest in the folder can't be read (another computer's, still arriving), tidy moves nothing.
- **Sync helpers:**
  - `news()` lists the other computers' manifests that are newer than what this computer took. Any whose pieces
    haven't all arrived are listed as **waiting**.
  - `packsAllowed()` is the version gate (below).

### Where it goes (the plan)
**Phase 1, the cloud only (the big win, and the safest).**
- This computer's data folder **keeps the whole file**. Every local reader (versions, backups, Trash, export,
  restore, project bundles, search, recall, chatcalc's records) stays exactly as it is.
- Only the sync engine changes. For a giant chat (≥ 16 MB, the engine's own threshold):
  - it publishes the cloud form as a pack in `<cloud>/Hearth/packs/chats/<id>/`;
  - it takes the other computer's pack instead of downloading the whole file.
- Older Hearths never look in `Hearth/packs/`: the engine only walks `files/`, `trash/` and `.sync/`.
- Per exchange, the upload goes from 61 MB to ≈ 0.8 MB. On the other side, the download goes from 61 MB to
  ≈ 0.8 MB.
- That computer still writes its local file whole when the change arrives. Phase 2 removes that write.

**Phase 2, this computer's file (the store thread's time and the disk).**
- A giant chat on disk becomes a pack in `data/chats/.packs/<id>/`.
- `chats/<id>.json` stays the whole file, rebuilt from the pack, but **lazily**:
  - when the chat has been quiet for a few minutes;
  - before anything that reads the file whole (versions, export, backup, a project bundle, a restore);
  - at quit.
- A small marker in the pack says which of the two is newer. Every reader goes through one store-thread op that
  answers from the newer one.
- This moves the 124 MB per exchange to ≈ 1–2 MB. Each reader must be checked against the marker, so this phase
  needs the same audit the chatwin scan did for `chat.messages`.

## Safety argument
- **A read failure is never "empty".** A missing segment, or one that is short, damaged or zero-filled (a
  placeholder), gives an error. So do a missing, cut, garbled or newer-format manifest, and a forged count (the
  bytes' own message count must equal the manifest's). The chat is never read as shorter. Every case is a check.
  - In sync, a manifest whose pieces haven't all arrived is "waiting". The receiving computer keeps its chat as it
    was until the pieces arrive.
  - A piece that never arrives keeps it waiting (tested). It is never taken as a shorter chat.
- **Atomic saves.** Pieces are written to a temp file, flushed, then renamed, so a piece under its name is always
  whole. The manifest is written the same way, **last**. Until its rename, the old manifest and all of its pieces
  are untouched: a save never moves or removes anything a manifest names.
  - The crash tests stop a save at **every file operation**: 155 crash points over 5 kinds of save (a new message, a
    reaction, a cut, its own fields, a save that seals several segments), in both layouts. After each stop the disk
    reads as **the old chat or the new one, exactly**. The next save works, and tidy leaves no temp file.
  - Tidy was also stopped at every move: the chat reads the same each time.
- **Sync merges correctly.** These were tested through `dev/sync-sim.js`, sync72's simulated cloud provider: each
  computer has its own view of the cloud drive, uploads take several ticks, downloads arrive in pieces, there are
  provider styles (iCloud / OneDrive / Dropbox), and computers go offline. The cases:
  - turns with slow uploads and downloads in pieces, where manifests really arrived before their segments;
  - both computers offline writing new messages, a reaction on one old message and a pin on another, and the title
    changed two ways;
  - randomized runs, then tidy on both computers with no grace time;
  - a lost segment.
  In every case both computers end the same, every message from either side is on both, nothing is doubled, and a
  chat never gets shorter on either side.
  - **Kept aside:** a field changed two ways is settled the same on both computers: the newer chat wins
    (`updatedAt`, then the computer's name). The losing side's whole version is kept with the real `sync-aside.js`,
    in Deleted files with its note.
  - **The base of the three-way merge:** each manifest says which of the other computer's versions it took in
    (`took`). The base is the newest version both computers are known to have had. When that can't be told, the
    merge keeps everything (`keepAll`: nothing removed).
- **Older Hearths on the other computer don't lose data.**
  - **Gate:** a computer publishes packs only when *every* other computer's record (`.sync/machines/<id>.json`)
    says it reads them (`format ≥ 88`, `packs ≥ 1`). A record without them, an unreadable one, or an older Hearth
    means the whole file, exactly as today. This was tested with the real engine on two computers: today's records
    → the gate says no → the whole file syncs as before.
  - **While packs are on**, the whole cloud file `files/chats/<id>.json` is still written. It is written less often
    (when the chat is quiet), so an older Hearth that appears later sees a valid, slightly older chat, never a
    missing or empty one.
    - That Hearth's own writes to it are merged with `keepAll`. A test shows why: without it, a stale whole file
      would remove the messages the packs brought. With it, nothing is removed and its new message is added.
    - On top of that, synchard74's `.sync/format.json { min: 88 }` makes any Hearth from round 74 on stop writing
      and say "Update Hearth on this computer". Hearths older than round 74 never wrote a `format`, so the gate
      already keeps packs off while one of them is in the records.
- **Versions, backups, Trash, export, restore, project bundles:** phase 1 doesn't touch the data folder, so they are
  unchanged. Phase 2 keeps `chats/<id>.json` whole and makes it fresh before each of them reads (above).
- Deletes go to the trash (the pack trash, 30 days). Nothing is uploaded except into the owner's own cloud folder
  (the packs live in it). No real data is touched: the tests and the bench use made-up chats in temp folders.

## What's on, what's off
- **Off (nothing wired):** no app code calls `chatpack-core.js`, and no setting exists yet.
- **On:** the tests, in `unit:bigsave88-test` and the `bigsave88` group of `dev/run-checks.js`.

## What's left (in order)
1. **Engine, phase 1** (Codex's `sync-engine.js`; marked edits):
   - `packs: 1` in the machine record;
   - `packsAllowed` before a giant chat's push;
   - for a giant chat: publish the pack (the cloud form's message bytes come from `bigchat-core.cloudForm`, already
     made per message), with a journal line `{ op: 'pack', rel, h, seq }`;
   - for another computer's newer manifest: `news()` → `read()` → the store thread's existing `syncPull` /
     `syncMerge` with the pack's bytes in place of the cloud file (they take bytes already); the base kept as a
     manifest + its pieces in `data/sync/packbase/` (the pieces are content-addressed, so only new ones are written);
   - the whole cloud file written when the chat is quiet;
   - `format.json min: 88` once both computers run it;
   - the sync panel's "waiting" line for a pack whose pieces haven't all arrived;
   - sync72 / synchard74 / storeack77 run again with packs forced on (as round 82 did with `HEARTH_SYNCCHAT_MIN=1`).
2. **The store thread, phase 2:**
   - `chatDelta` writes the pack (it already knows which messages changed, so the infos are kept with `bigs`);
   - `chats/<id>.json` rebuilt lazily; one op answers every reader;
   - the scan, like chatwin-scan, for every reader of `chats/*.json`.
3. A setting, **Settings › Chats › "Save very long chats in pieces"**, off by default until 1 and 2 pass every check
   and both computers run them.

## Tested
- `dev/bigsave88-test.js`: **98 / 98** (≈ 20 s).
  - **Byte for byte.** Pretty and compact, through every kind of edit:
    - a new message, a reply, a reaction on an old message;
    - an old message edited longer or shorter, a pin or bookmark;
    - edit-from-here (cut, then a new message), retry, the last message deleted;
    - its own fields changed or removed, everything cut, one message after empty.
    Also: random walks of 60 edits (6 seeds × 2 layouts), equal to round 82's `deltaWrite`, `split` refusing other
    layouts, the empty chat both ways, and the same segments on two computers.
  - **Read failures:** 12 checks (10 kinds of damage, plus tidy and `news` holding off on an unreadable manifest).
  - **Crash points:** 155 save points + 39 tidy points.
  - **Two computers:** 5 scenarios + 3 randomized runs, the gate, `keepAll`, and the real engine.
- `--bench`: the tables above.
- Unit, after the change: unit:bigsave88-test, unit:chatcalc87-test, unit:chatwindow86-test, unit:bigchat82-test,
  unit:bigchat84-test, unit:store-thread-test, unit:sync72-test, unit:versions75-test, unit:projbundle-test,
  unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:storeack-scan, unit:chatsafe-scan,
  unit:chatwin-scan, unit:boot-test, unit:lazymanifest-test: **17 / 17 pass**.
- App (under `flock /tmp/hearth-run.lock`): chatwindow86 (`CHATWINDOW86=1`), sync72, versions75, chatkeep, lazy pass.
  bigchat84 (`BIGCHAT84=1`) failed once on a timing budget (one 80 ms window task against 60 ms, box load 13–16 with
  other streams running) and passed when run again. No app code changed this round.
- First screen: unchanged (no first-screen code added; boot-test passes).

## Files
- **New:**
  - `chatpack-core.js` (Node only; not a first-screen or window file);
  - `dev/bigsave88-test.js`;
  - this file.
- **Changed:** `dev/run-checks.js` (`unit:bigsave88-test`, group `bigsave88`).

## For Codex
Nothing in Codex's files changed this round. Phase 1 of the plan needs marked edits in `sync-engine.js`:
- the machine record's `packs: 1`;
- the gate;
- publishing and taking packs for chats ≥ 16 MB;
- writing the whole cloud file when the chat is quiet;
- `format.json min`.

Those edits are listed in "What's left". The core is pure and has a clear API: `write` / `read` / `news` / `tidy` /
`packsAllowed`.

## For the patch notes
- Nothing changes for you yet. This round laid the groundwork for making very long chats much cheaper to save and
  to sync.
- Today, every reply in a very long chat (thousands of messages, about 60 MB) rewrites the whole chat on your disk.
  Your cloud folder then sends all of it to your other computer again. Hearth measured this: about 120 MB written and
  60 MB uploaded per reply.
- The new way keeps such a chat in pieces. Old pieces never change; only the newest piece and a small index are
  saved. In tests that is under 1 MB per reply instead of 120 MB, and a save takes a few milliseconds instead of a
  few hundred.
- It isn't switched on yet. Both computers will need the update first, and it was tested hard first: crashes at any
  moment, pieces arriving late or out of order on the other computer, and both computers writing at once. In every
  test the chat comes back exactly, or Hearth waits. A chat is never shown shorter than it is.
