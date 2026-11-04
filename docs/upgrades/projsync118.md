# One project per chat, across two computers (round 118, projsync118)

Round 116 made every chat belong to exactly one project (`projchats-core.js`, `projchats.js`,
`docs/upgrades/projchats116.md`). This round checks that rule through sync between the Windows PC and the Mac,
mostly while **one computer still runs the older Hearth**. The Mac often updates later. On the older Hearth a chat can
be in several projects or in none, and "Take out of" still exists. Wherever something failed, it is fixed here.

Everything was run through the two-computer simulator: the real sync engine and its merge, on temp folders, with the
pattern of `dev/syncfix111-test.js`, `dev/merge105-test.js` and `dev/projsync76-test.js`. The PC's Hearth is
`ProjChatsCore` as `projchats.js` runs it (the careful read, then the sweep, then a save when something changed). The
older Mac's edits are what its Projects did: an add that isn't a move, a take-out, and a delete to Recently deleted.

## The cases and what happened

| Case | Before this round | Now |
|---|---|---|
| 1a. Older Mac adds a chat to a second project | Passed: kept in one project, both agree, no back-and-forth | Same |
| 1a'. …gives a chat back to a project the migration had moved it out of, Mac clock 1 h behind | **Failed**: the keeper flipped the chat back to the old project. "First joined" read the Mac's early clock. | Stays where the migration put it |
| 1b. Older Mac takes a chat out of its only project | Passed: Earlier chats after the 3-minute grace, never gone | Same |
| 1c. Older Mac makes a chat with no project | Passed: Earlier chats after the grace | Same |
| 2. Both computers migrate at once, clocks 7 min apart | Passed: one Earlier chats, the same placement, no sync conflict | Same |
| 3a. Earlier chats deleted on the PC while the Mac moves a chat into it | Mostly passed. **Failed** when Earlier chats came back from Recently deleted: it brought back every chat it ever held, so a chat moved out of it meanwhile was in two projects (an older Mac showed both) until the next sweep. | Only the chats that still need it come back with it |
| 3b. A project with chats deleted (here or on the Mac) | Its chats went to Earlier chats only after the 3-minute grace. Meanwhile they were in no project and not in the list, although the toast said they move to Earlier chats. If Hearth closed, the wait started again. | At once. The project waits in Recently deleted. |
| 4. A store read failure | The migration skipped. **The keeper didn't read carefully at all.** It also didn't treat an empty store after the migration as a failed read, so it would make a store holding only "Earlier chats" with every chat, and sync would take the other projects out. | Both skip, and nothing is written |
| 5. Import past chats | Earlier chats after the 3-minute wait | The open project, at once, with a note. With no project open, Earlier chats at once. |

Found while reading the code (not one of the five cases): a make's room chat was added back to the make's project at
every start (`Projects.fromMake`), even after the owner moved it elsewhere. That put it in two projects, the keeper took
it out again, and the store was written each time. The older Mac still does this. The keeper now handles it (see the
next section), and this release no longer does it.

## The fixes

- `projchats-core.js`
  - **keeper**: a project that holds a record of moving this chat out (`chatsMovedOut`) and has it again was given it
    back by an older Hearth. It now ranks below the project the chat was moved to. This rule comes before "its own
    chat", "Earlier chats last" and "first joined", so a skewed clock can't flip it back.
  - **`landed(p, chatId)`**: a chat moved *into* a project on this release clears that project's record of it, so a
    real move back counts as a move. `move()`, the sweep's Earlier chats and `adopt()` call it, and so does
    `Projects.add` (below).
  - **`ensureEarlier`** from Recently deleted: it comes back only with the chats that are in no other project.
  - **`lostReady(data, seen, now, grace)`**: a chat with no project goes to Earlier chats at once when a project that
    had it is in Recently deleted, whether it was deleted here or on the other computer. Otherwise it goes after the
    grace, as before.
  - **`readable(r, { held, chats, done })`**: the careful read's rules in one place. The answer is "not now" when:
    - the store is unreadable;
    - the file isn't a projects store;
    - the chats list hasn't been read;
    - this window's copy is empty while the disk has projects;
    - (new) there are no projects at all, and none in Recently deleted, after the migration ran, while there are chats.
  - **`adopt(data, chats, toId)`**: chats with no project go into a given project (else Earlier chats) at once.
- `projchats.js`
  - The keeper now reads carefully before every sweep (`readOk` → `ProjChatsCore.readable`), the same way as the
    migration.
  - It uses `lostReady`.
  - A local delete (`why: 'delete'`) runs the keeper half a second later.
  - New `ProjChats.imported(ids)`: chats the owner imported go into the open project, or into Earlier chats, with a
    toast. It is skipped while the store can't be read; the keeper places them later, so a chat is never left without a
    project.
- `importer.js`: the summary carries `ids`, the imported chats' ids (not filled on a dry run).
- `addons-cmds.js` `importChats()`: after the import, it loads the projects group and calls `ProjChats.imported(ids)`.
  If an older main process gives no ids, it uses the chats that are new in the list.
- `projects.js` (Codex): see below.

The sync guarantees are unchanged. Every write is still an ordinary save of kv `projects` (`Projects.changed` +
`flush` → `kv:set`), so sync's guard bases, `store.settle` and `choiceWrite` treat it like any other edit. Nothing
writes files directly, and a read failure is never "empty".

## Tests

- New: `dev/projsync118-test.js` (in UNIT). It has 96 checks in about 5 s:
  - `old`: cases 1a, 1a', 1b and 1c, run twice, once with the Mac's clock 1 h behind. Each run ends with six more
    syncs that must write nothing and change nothing, and with no sync conflict.
  - `both`: case 2.
  - `deleted`: case 3, with the Mac on this release and then on the older one. It covers Earlier chats deleted while a
    chat is moved into it, and a project with chats deleted on the Mac and on the PC. The checks: no chat lost, one
    Earlier chats, both computers agree, nothing moves on repeated syncs.
  - `unread`: the PC's store held by another program (EBUSY) and the store gone after the migration. The keeper skips
    and nothing is written. Once the store can be read, the keeper runs on both computers.
  - `window`: `projchats.js` in a small fake window. The keeper skips while the store is unreadable. A deleted
    project's chat is placed at once. An import goes to the open project with a note, or to Earlier chats when none is
    open. `Projects.add` clears the old record.
- The 1a' and 3a failures were reproduced against round 117's `projchats-core.js`:
  - 1a': the chat ended in `pjA` instead of `pjB`.
  - 3a: one chat ended in two projects.
- Passed with `run-checks --exact`: `projsync118-test`, `projchats116-test`, `boot-test`, `importer-test`,
  `projects-test`, `storeack77-test`.
- Passed when run directly:
  - `node dev/boot-test.js`: 2,696 checks.
  - `node dev/projsync76-test.js`: 125 passed.
- No full release run, as asked.

## For the patch notes

Chats now stay in exactly one project even while your two computers run different versions of Hearth. If the computer
that hasn't updated yet puts a chat in a second project, Hearth keeps it in one, and both computers agree. If that
computer takes a chat out of its project or makes a chat with no project, the chat goes to "Earlier chats" after a few
minutes and is never lost. When you delete a project, its chats move to "Earlier chats" right away; the project waits in
Recently deleted. "Import past chats…" now puts the imported chats in the project you have open, with a note saying
so. If no project is open, they go to "Earlier chats". If Hearth can't read your projects for a moment, it waits and
changes nothing.

## For Codex

Codex-owned file touched, minimal edits, each marked `// (round 118, projsync118)`:

- `projects.js`
  - `add()`: for a chat, `ProjChatsCore.landed(p, ref)` clears the project's "moved out" record of that chat (a real
    move back). Guarded with `typeof ProjChatsCore !== 'undefined'`.
  - `fromMake()`: a make's room chat that is already in another project is not added back to the make's project. It was
    added back at every start, which put it in two projects and made the keeper write the store again each time.
- Not touched: `sync-engine.js`, `cloud-files.js`, `project-workspace*`, `projects-core.js`, and the rest of the list.
