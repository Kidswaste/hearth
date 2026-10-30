# devices90: Your computers, "Forget this computer…", and the space very long chats' pieces take (round 90)

**What shipped:** a new fold in **Settings › This computer & sync › Your computers** (shown while sync is on). It
answers the two problems round 89 (`packs89.md`, "What's left" 3 and 4) left open:

1. **A computer that never comes back** kept its machine record in the sync folder, so "Send very long chats in pieces"
   stayed shut forever. Now every computer Hearth knows is listed, and one not seen for a week can be forgotten.
2. **The pack trash** could grow by 50–100 MB a day. Now its size is shown in plain words, with a one-click
   **Free up** for kept-aside pieces older than 7 days. There is **no automatic cap or deletion**: that waits for the
   owner's say.

## 1. Your computers

Each computer in `<cloud>/Hearth/.sync/machines/` is one row:
- its **name** (this one says "(this computer)");
- its **system** (Mac / Windows / Linux);
- **when it was last seen** ("last seen 20 days ago": the record's `lastSeen`, rewritten by its own Hearth at least
  every 10 minutes while it syncs);
- its **Hearth version** (`app` in the record; "an older Hearth" when the record has none);
- whether it **reads pieces** (`packs: 1`).

A record that can't be read is listed too, as "A computer whose record can't be read". It is never left out, because
it is exactly the kind of record that keeps the packs gate shut. A cloud client's conflict copy (`x 2.json`) isn't a
computer and is skipped, the same rule the engine and the gate use.

**Forget this computer…** shows only on a computer **not seen for 7 days** (`STALE_MS`). It never shows on this
computer, and never on one seen lately. A click opens a plain confirmation inside the row:

> Forget Old laptop? Hearth stops counting it as one of your computers, so the others no longer wait for it (for
> example to send very long chats in pieces). Nothing of its data is deleted: its chats and files stay in your cloud
> folder and on that computer, and its record is kept aside in the cloud folder's forgotten list. If Old laptop comes
> back, it is treated as a new computer joining again: its next sync brings it up to date and keeps what it has.

There are two buttons, **Forget it** and **Cancel**.

**What forgetting does** (`devices90-core.js forget`):
- The record is **moved**, never deleted, to `<cloud>/Hearth/.sync/forgotten/<time>-<id>.json`, with the same bytes.
  A small `.note.json` next to it says when, and from which computer.
  - It stays inside the owner's own sync folder, so the other computers see the same list.
- The record is read again right before the move. If the computer wrote it meanwhile (it synced), it is **not**
  forgotten ("That computer synced lately").
- A record that can't be read right now (held, a placeholder) is never treated as "nothing there": nothing changes.
  A garbled record can be forgotten only once it has been untouched for 7 days. A record being written right now
  never can.
- The next sync pass follows at once. The packs gate is checked at every pass, so if that computer was the only
  one keeping it shut, it reopens on this computer, and on the other computers as soon as their cloud client brings
  the move.
- The list shows "Forgotten: Old laptop (forgotten 2 days ago)". Once it is back, it shows "(came back …)".

**If the forgotten computer comes back**, nothing special is needed for safety. Its sync is a returning computer's
sync:
- Its engine keeps its own base (the last version both sides had, per file, in its own `data/sync/`), so every file
  merges three-way exactly as after any long absence.
- Its own Hearth writes its record again, and it is listed again.
- If it doesn't read pieces, the gate shuts again on the others, and the whole files go, as in packs89's
  "older Hearth joins mid-stream" case.
- With this update it does one thing more (`rejoin`, the engine's new `o.devices` hook). If, at the start of a pass,
  its own record is missing **and** a forgotten copy of it is in `.sync/forgotten`, it writes its record **at once**,
  before anything moves, instead of at the end of the pass. It keeps the same id, so it is the same computer
  returning, not a copy.
- A computer that was never forgotten (a new one, or the first pass) gets nothing different: its record is written
  as today.

### What else waited on another computer's record (the audit)

| Where | Waits on a peer record? | After "Forget" |
|---|---|---|
| Packs gate (`syncpack-core gate`) | **yes**: every other record must say `packs: 1`; an unreadable one shuts it | reopens (the point of this round) |
| `sync-engine` `readPeers` → `peers` | the list of other computers | the forgotten one isn't a peer any more |
| …journals (`.sync/journal/<id>.jsonl`) | only peers' journals are read (hints: who changed a file, a delete on its way) | its journal stays in the folder, unread; anything it said is a week old or more |
| …`winPeers` (Windows-safe names on a Mac) | holds names to Windows' rules while a Windows peer exists (and always with OneDrive) | forgetting the only Windows PC lets the Mac write names Windows can't hold. If that PC comes back, round 74's rules block and rename them there ("Rename for Windows"): nothing is lost, but forget a Windows PC only when it is really gone |
| …`peersOld` ("Hearth on X is an older version") | a notice only | the notice for it goes |
| …`aliases` (the other computers' data / home / cloud paths, for portable paths) | used to make paths portable | its paths are no longer rewritten. That only matters for files it still writes, and once back its record brings them again |
| …`nameOf` / `platOf` (names in Kept aside and conflict notes) | names only | an old note says "old-laptop" (its id without the tail) instead of "Old laptop" |
| The engine's base, Kept aside (`sync-aside`), `sync-state` | **no**: per file, on this computer | unchanged |
| `twocomputers.js` (the "other computer" in the welcome note and an AI's folders) | uses the peers, newest first | the forgotten one drops out (it was the oldest anyway) |
| Pack pieces: `tidy` keeps every piece any manifest names | its manifests stay in `Hearth/packs/` | its pieces stay too (never removed while a manifest names them) |

Nothing else counts the computers or waits for "all of them".

## 2. The pieces' space

**Where the space really is.** The round-89 pack trash is **not** in the cloud folder. Here is where each kind of
data lives:
- **Live pieces** are in `<cloud>/Hearth/packs/`. They are the newest state of each very long chat, plus a tail per
  reply.
- When tidy moves a piece out of the cloud folder, it is **copied to this computer's** `data/sync/packtrash/` and
  then removed from the cloud folder.
  - So the 50–100 MB a day lands on each computer's own disk, kept 30 days.
  - The cloud space it used goes back. Your cloud provider may keep its own copy in *its* deleted files, by its own
    rules. That is the provider's, Hearth can't see or empty it, and the fold says so in one line.
- Copies kept for merging are in `data/sync/packbase/`.

The fold shows the space in plain words, for example:

> In your cloud folder: 240 MB of pieces (the newest state of each very long chat). On this computer: 180 MB kept for
> merging, and 1.2 GB of old pieces kept aside (Hearth keeps them 30 days, then lets them go), 900 MB of them older
> than 7 days.

**Free up X: remove kept-aside pieces older than 7 days** shows only when something can be freed. X is what a dry run
really moves, not the trash's whole old part. A click opens a plain confirmation; then:
- Each chat folder of a pack trash day older than 7 days goes to **this computer's Trash / Recycle Bin**:
  `shell.trashItem`, after WinPolish / MacPolish's `trashCheck`.
  - A drive without a Trash keeps the pieces where they are, and says why. Hearth never deletes them instead.
  - App checks use a stand-in folder in the run's scratch space.
- **Never a piece any manifest still names.** Every manifest is read first:
  - each computer's manifests in the cloud folder (forgotten ones too);
  - this computer's packbase;
  - own versions kept aside lately in the pack trash.
  - A kept-aside piece one of them names stays where it is. A folder that holds one is freed file by file, around it.
  - An own version older than 7 days goes along with its pieces. It still has to read, but the pieces it names are
    not kept for it.
- **If any manifest can't be read** (cut, garbled, written by a newer Hearth, a cloud placeholder such as an iCloud
  `.icloud` stub, or a pieces folder that can't be listed), **nothing is removed at all**. The fold says why, and the
  button stays hidden until it reads.
- Under it, a note says: *"Hearth doesn't limit this space by itself. If you'd like an automatic limit (for example
  'keep 7 days' or 'at most 1 GB'), ask for one and it can be added."*

The 30-day purge from round 89 (chatpack's `purge`) is unchanged. No new automatic deletion was added.

## Safety argument (the rules)

- **A read failure is never "empty".**
  - A machine folder that can't be listed: the list says so, never "no computers".
  - A record that can't be read: listed, and never forgotten while it is being written.
  - A held record: nothing changed.
  - `rejoin` with its own record unreadable: nothing done.
  - Any manifest unreadable: nothing freed.
- **Deletes go to the Trash.**
  - Forget moves the record inside the sync folder; it deletes nothing.
  - Free up moves pieces to this computer's Trash; it deletes nothing.
  - The only removal is `rmdir` of a day folder that is already empty.
- **Nothing is uploaded except via the owner's sync folder.** Forget writes in `<cloud>/Hearth/.sync/`. No network
  code was added.
- **Secrets never sync.** Machine records carry nothing new. The forgotten note holds an id, a name, a time and the
  forgetting computer's name.
- **Never touch real data.**
  - The unit test uses made-up chats and folders in temp space.
  - The app check's cloud is in the run's own scratch folder, with made-up records and made-up pieces.
  - The stand-in Trash is in the run's save folder.
- **No click reaches anything unsafe.**
  - This computer can't be forgotten: there is no button, and the core refuses it.
  - A recent computer can't be forgotten: no button, and the core refuses it.
  - A forgotten computer returning loses nothing (tested with messages it wrote while away).
  - Free up can't take a named piece.

## Tested

- **`dev/devices90-test.js` (UNIT): 73 / 73 checks, 6 scenarios, ≈ 2 s.**
  - `forget`: the real engine and pack lane on three computers through `dev/sync-sim.js`.
    - An old laptop (an older Hearth) syncs once, then leaves for 8 days. The gate stays shut on the PC and the Mac.
    - The list shows name, system, last seen, version and reads-pieces. Only the laptop can be forgotten; this
      computer and the Mac are refused.
    - The forgotten record is moved with the same bytes, and the note is there.
    - The gate reopens on both, and the pieces carry the changes.
    - **Rejoin**: the laptop comes back with a message written while away. Then:
      - nothing is lost or doubled on any of the three, and nothing gets shorter;
      - its record is back, and the gate shuts again;
      - it syncs on, and it is listed as "came back".
  - `hook`: this version comes back after being forgotten.
    - Its first pass writes its record at once, with the same id.
    - What it wrote while away arrives.
    - A computer that was never forgotten gets nothing different.
  - `refuse`:
    - a record being written; a garbled one untouched for 10 days (forgettable);
    - a held read (EBUSY): nothing changed;
    - a record rewritten between the look and the move: kept;
    - odd names (`../`, hidden, a conflict copy);
    - `rejoin`'s four cases; an unreadable machines folder.
  - `free`:
    - space adds up;
    - a dry run (the button's size) equals the real move and leaves out named pieces;
    - only kept-aside pieces older than 7 days move;
    - named pieces (cloud folder, packbase, a recent own version) and young ones stay;
    - the live manifest still finds all its pieces.
  - `unreadable`: nothing moves for each of these:
    - a cut cloud manifest; an iCloud placeholder manifest;
    - a garbled packbase manifest; a garbled pack-trash manifest;
    - a newer Hearth's manifest; a pieces folder that can't be listed.
    - Also: a Trash that refuses keeps the piece; and an empty setup.
  - `words`.
- **App check `devices90`** (`run-checks --exact devices90`), by clicks:
  - The fold lists three computers with every detail.
  - Forget shows only on the old laptop.
  - The confirmation's words; Cancel changes nothing; Forget it moves the record (same bytes); the list says
    "Forgotten".
  - The packs gate goes from `older` to open.
  - The space line, the Free up label, and the two notes.
  - Free up moves the old orphan to the stand-in Trash. The named and young pieces stay.
  - A cut manifest means nothing is removed.
  - The laptop's record comes back: "came back", and the gate is `older` again.

## Runs

- Units:
  - devices90-test 73/73; packs89-test; bigsave88-test; sync72-test; syncscope79-test; synchard74-test;
    twocomputers-test; cloud-files-test;
  - datasafe-scan, winmac-test (609), errorcalm-scan, storeack-scan, chatsafe-scan, boot-test, lazymanifest-test.
  - All pass.
- App checks (under `flock /tmp/hearth-run.lock`, at most 5 per run): devices90, packs89, sync72, lazy. All pass.
- **First screen:** unchanged: 68 scripts, 1741 KB of code against the 1751 KB budget.
  - The UI is the new lazy group `devices90` (`devices90.js`, `devices90.css`, tier `use`), loaded when Settings
    opens.
  - `appui-dialogs.js` (itself lazy) only holds its slot.
  - `index.html` only gained the group's name in an existing `lazy-at.js` tag.

## What's left

- **An automatic limit** for the pack trash (a size cap, or fewer days for tails only) is the owner's call. The fold
  says it can be asked for.
- The pack lane's per-chat state on the other computers (`seen[by]`, the `peer-<by>` base copies) for a forgotten
  computer stays. It is small, and it is what lets that computer's later manifests merge correctly if it comes back.
- "Not seen for a while" is fixed at 7 days. A computer whose sync is paused for a week also shows the button.
  Forgetting it is harmless (it comes back by itself), but the words say "hasn't synced for over a week", not "gone".

## For Codex

`sync-engine.js` got **one line**, marked `(round 90, devices90)`, in `passOnce` right after `await readPeers();`:

```js
if (o.devices) await o.devices.beforePass({ id: machine.id, writeMachine: () => writeMachine(true) }).catch((err) => log('devices', err.message)); // (round 90, devices90) …
```

- Without `o.devices` it is a no-op.
- With it (`syncmain.js` passes `devices90-core.hook`), each pass costs one `stat` of this computer's own record.
  When that record is missing and a forgotten copy of it is in `.sync/forgotten`, it writes the record at once. That
  is the engine's own `writeMachine(true)`: the same record, just sooner.
- It never changes the id, the base or the state.

**`cloud-files.js`: no change.**

Other files:
- New: `devices90-core.js` (the logic), `devices90.js` + `devices90.css` (the fold, lazy group `devices90`).
- `syncmain.js`: the `devices` hook, the IPC `sync:devices` / `sync:forget` / `sync:packSpace` / `sync:packFree`, and
  `dvTrash`.
- `preload.js`: `sync.devices / forget / packSpace / packFree`.
- `appui-dialogs.js`: the slot.
- `lazy-data.js`, `index.html`, `docs/lazy-groups.md`: the group.
- `dev/run-checks.js`: `unit:devices90-test` and the `devices90` group.
- `docs/windows-test-plan.md`: § 4g.

## For the patch notes

- **New: Settings › This computer & sync › Your computers.** It lists every computer that syncs with this one: its
  name, Mac or Windows, when it was last seen, its Hearth version, and whether it can receive very long chats in
  pieces.
- **Forget a computer you don't use any more** (an old laptop, a computer you reinstalled). It shows only for a
  computer that hasn't synced for over a week, and never for the one you're on. Hearth asks first.
  - Nothing of its data is deleted.
  - Your other computers just stop waiting for it. For example, "Send very long chats in pieces" can switch on again
    if that old computer was the only one holding it back.
  - If it ever comes back, it simply joins again, and nothing it has is lost.
- **See how much room very long chats' pieces take,** and free the old ones with one click: **"Free up …: remove
  kept-aside pieces older than 7 days"**.
  - They go to your computer's Trash / Recycle Bin, not deleted for good.
  - Pieces a chat still needs are never touched. If Hearth can't read one of the chats' lists right then, it removes
    nothing.
  - Hearth doesn't set a limit by itself: if you'd like an automatic one, just ask.
