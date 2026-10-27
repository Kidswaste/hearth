# 🕘 versions75: Earlier versions and Deleted things (round 75)

Hearth already keeps many safety copies: each store's `.prev` copy and automatic copies (datasafe / scenesafe), sync's
base and the version before it, what sync set aside, its Deleted files, conflict copies, "Keep both" copies, the Lab's
time machine, Recently deleted chats and projects, and the daily backups. Each one had its own corner (🛟 Recover…,
Deleted files…, the time machine, Backups…), and none of them answered the plain question "what did this chat / these
notes / this scene look like before?". This stream adds **one place** for that: a timeline per thing, gathered from all
of those copies, with a plain difference from now, a read-only Preview and a Restore that never loses the version in
place. Plus **Deleted things**: deleted chats, projects, Lab scenes and boards, with Restore.

New files: `versions-core.js` (pure: gathering, one entry per distinct content, ordering, the plain differences, what a
restore writes), `versionsmain.js` (main process, lazy IPC: where it looks, keep-then-restore, Deleted things),
`versions.js` + `versions.css` (the window, lazy group `versions`, loaded on the first click), `dev/versions75-test.js`
(UNIT, 87 checks), `dev/checks/versions75.js` (the app by clicks).

## Where it looks (one timeline, newest first, the same content once)
| place | which computer it says | for |
|---|---|---|
| kept before a restore (`data/.versions/<kind>-<id>/`, the newest 20) | this Mac / this PC | everything (the Undo) |
| copy before the last save (`<store>.prev.json`) | this computer | projects, scenes, boards, settings |
| automatic copies (`data/kv/.history/<store>/`, `data/.history/config/`) | this computer | projects, scenes, boards, settings |
| Recently deleted (`data/trash/<id>.json`) | this computer | chats |
| last synced version + the one before it (`data/sync/base/<rel>(.prev)`) | both computers | everything synced |
| set aside by sync (`data/sync/trash/<day>/…`) | this computer | everything synced |
| in the cloud folder now (`<cloud>/Hearth/files/<rel>`) | "on its way from Studio Mac" (sync's journal) | everything synced |
| sync's Deleted files (`<cloud>/Hearth/trash/<day>/…`, also the `1a2b3c4d-name` copies) | either computer | everything synced |
| conflict copies, open and settled (`.sync/conflicts/`, `trash/<day>/conflicts/`) | the computer named in the record | everything synced |
| "Keep both" copies ("Plan (from Mac)") | Mac / PC from the name | chats, scenes, projects |
| the Lab's time machine (`ThreeHistory.list`) | you / Claude / Astra | Lab scenes |
| the daily backups (the newest 12 checked zips; one file read out of each) | the backup's computer | everything in a backup |

The cloud provider's own version history (iCloud's "Browse All Versions", OneDrive's version history) is not reachable
from a plain folder without the provider's app or web page, so it is not looked at (skipped as the brief allowed).

The local places show at once; the backups are read after (the list fills in, "Looking in the backups too…"), and the
footer says where it looked. Nothing is read in the background: only on a click.

## Restore, safely
- **The version in place is kept first** (`data/.versions/…`, listed as "kept before a restore"). If it can't be kept,
  nothing is restored. If the thing can't be read just now (a held / damaged file), nothing is written over it.
- **Through the owner of the thing**: a project, the Lab's scene and a board that the window holds are changed in the
  window (so its next save can't put the old one back), a chat is written by the main process after the chat let go of
  it (never while a reply is coming in), the settings go through config.json's guarded save. Each is then saved like
  any edit, stamped now, so **sync sends it to the other computer as an ordinary change**, merged there with whatever
  the other computer changed meanwhile.
- **Settings**: only what syncs comes back; this computer's own paths, keys, zoom and window stay.
- **A Lab time machine version** is restored by the time machine itself (it records the scene as it was first).
- **Undo** (the toast) takes back only what the restore changed: a message that arrived from the other computer after
  the restore stays. Undo is itself undoable.
- A chat's engine session is dropped when its messages change (the next message sends the conversation as it is now),
  so Claude / Codex never continue a conversation the chat no longer shows.

## Upgrades
### Earlier versions
1. **🕘 Earlier versions…** on a chat: right-click it in the chats list.
2. On a project: its menu (right-click its group in the chats list, a card on the Desk) › Earlier versions….
3. On a Lab scene: ▦ All your sketches › right-click a card › Earlier versions…, and the Lab's menu › History › 🕘 Earlier versions of the scene….
4. On a board: Board ▾ › More › Earlier versions….
5. From the sync panel: **Earlier versions…** next to Deleted files… ("Earlier versions of synced things": pick a chat, project, scene, board or the settings, with a search box).
6. For the settings: "Settings and agents" in that list.
7. One timeline gathered from every safety copy: automatic copies, the last save, sync's base, what sync set aside, the cloud folder, Deleted files, conflict copies, "Keep both" copies, the time machine, the daily backups.
8. The same content kept in several places shows once ("automatic copy (+2 more)", the places in its tooltip).
9. **When** each version is from (today 14:02, yesterday, Mon 26 Oct), newest first.
10. **Which computer**: this Mac / this PC, both computers, "on its way from Studio Mac", the conflict's computer, the backup's computer, you / Claude / Astra for the time machine.
11. **A plain difference from now**: "12 messages fewer", "2 messages worded differently", "notes: 3 lines changed", "code: 14 lines changed", "1 layer fewer", "5 items fewer", "2 settings differ", "1 AI fewer", the old title / name.
12. The backups are looked into too (the newest 12 good ones, one file out of each), after the quick places; the footer says where it looked.
13. **Preview** opens a version read-only: a chat's messages, a project's notes and contents, a scene's layers and code, a board's items, the settings that sync; with "Compared with now: …".
14. **Restore** (on a row or in Preview) keeps the version you have first, then brings the earlier one back.
15. The toast's **Undo** puts it back, keeping what arrived from the other computer since.
16. A restore syncs to the other computer like any edit and merges with what it changed meanwhile (tested: restore on the PC while the Mac writes).
17. Settings restore brings back only what syncs; this computer's own paths, keys and zoom stay.
18. A chat is never restored while a reply is coming in it (it says so).
19. A thing that can't be read just now is never restored over (it says so, nothing changes).
20. A helpful empty state: where Hearth keeps versions by itself, and how many copies were all the same as now.
### Deleted things
21. **Deleted things** (a tab in Earlier versions, and a button under every timeline): chats, projects, Lab scenes and boards that are deleted but still kept, with when, how big and where.
22. Deleted chats from Recently deleted and from sync's set-asides / Deleted files (deleted on either computer).
23. Deleted projects (Recently deleted projects), deleted Lab scenes (History's deleted sketches), deleted boards (the board's data Hearth kept when the list forgot it).
24. **Restore** puts one back as it was, under its own id (its chat links still work); never over something already in your lists.
25. A restored deleted chat or project has **Open** on its toast.
### Ways in
26. Ctrl/⌘+K "Earlier versions…" and "Deleted things…".
27. Chat: `/versions` (this chat), `/versions all`, `/versions deleted` (secondary; the clicks above are the way).

27 upgrades.

## Tested
- `node dev/versions75-test.js` (UNIT, **87 checks**): the plain differences; one timeline (dedupe, the current one left
  out, newest first, the best place to read from, the thing's own time); every place on a temp data + cloud folder
  (base and the one before, set-asides, Deleted files with prefixed names, open and settled conflicts, the cloud
  folder with "on its way from", "Keep both" copies, backup zips incl. a missing and a damaged one); Preview tokens
  (a made-up token reads nothing); restore safety (bad token, a garbled chat never written over, a keep that fails →
  nothing written, restore → the replaced one listed first, Undo keeps a message that arrived since, 20 kept per thing);
  settings keep this computer's parts; Deleted things for the four kinds, Restore, twice → refused, a chat in the list
  never offered. **Two computers** (dev/sync-sim.js, real sync engine, iCloud-style Mac + OneDrive-style PC): the PC
  restores a chat to 3 messages while the Mac (offline) writes a 4th → both computers end identical with the 3 + the
  Mac's message, the title restored; Undo on the PC → all 6 messages on both; project notes restored on the Mac while
  the PC edits another line (and the other way round) → both lines on both computers.
- App, by clicks (`dev/checks/versions75.js`, sync on a temp folder): right-click a chat › Earlier versions… → the
  timeline ("2 messages fewer · title “Intro video”", both computers, last synced version; looked in … backups) →
  Preview (3 messages, read-only, "Compared with now") → Restore this version (the chat has 3 messages and its old
  title) → toast Undo (5 messages back); sync panel › Earlier versions… → type → the chat → "kept before a restore";
  every button named; Escape closes; a project's menu › Earlier versions… → "notes: 1 line changed" → Restore (in the
  window and on disk); Deleted things → a deleted chat → Restore; a Lab scene card › Earlier versions… → a time machine
  version → Preview → Restore.
- Also run: `unit:sync72-test` (179 / 179), `unit:boot-test`, `projects`, `backupauto`, `lazy` (results in the final report).

## Numbers
- First screen: +0.57 KB of code (the lazy group's line + its manifest, one menu row in panel.js): 1865.65 KB, budget 1866.
  Everything else loads on the first click (`versions` group, tier `use`; `versionsmain.js` is a lazy IPC module).
- Opening a timeline: the local places are a handful of small async reads; backups are read after the list is up.

## For Codex
- `syncmain.js`: one added line, `module.exports.engine = () => engine` (round 75, versions75), so versionsmain reads the
  engine's cloud folder, conflicts, Deleted files and `incoming()`; nothing in the engine changed.
- `projects.js`: `Projects.replaceWith(id, value)` (a project put back as an earlier version of itself, saved like any
  change) and "Earlier versions…" in the project menu. `tools/three.js`: `ThreeLab.scenes.undelete(id)` (a deleted scene
  back under its id, out of History's deleted list), "Earlier versions…" on a sketch card and in History ›.
- `panel.js` (chat right-click), `board-menus.js` (Board ▾ › More), `sync-panel.js` (footer button): one menu row each.
- `main.js` one `lazyIpc('versionsmain.js', …)` line; `preload.js` `hub.versions`; `index.html` one `lazy-at.js#versions` tag;
  `lazy-data.js` / `lazy-meta.js` regenerated (`node dev/lazy-manifest.js`); `docs/lazy-groups.md`; `dev/run-checks.js`
  (UNIT + group `versions75`).

## Risks
- A restore is an ordinary edit for sync: if the other computer's cloud client makes its own conflict copy of the same
  store at that moment (OneDrive-style, offline), sync72's keep-everything merge can keep both versions of lines
  changed next to each other (nothing lost; the owner may delete a line). Tested both ways in the simulator.
- Undo of a project / scene / board restore applies the earlier version through the window; what arrived since is kept
  by the three-way undo for chats and main-side restores, and by the window's merge (`versions:undo`) for the rest.
- Backups are read one file per zip (a temp folder, removed after); 12 zips at most, 8 s at most on a slow disk.

## For the patch notes
- **🕘 Earlier versions**: right-click a chat (or a project, or a Lab scene card) and pick **Earlier versions…** to see
  every older version Hearth still has, from both computers, with when, which computer and what changed ("12 messages
  fewer", "notes: 3 lines changed").
- **Preview** shows an old version without changing anything; **Restore** brings it back and keeps the one you had, so
  the **Undo** on the notification always works. The restore reaches your other computer like any edit.
- In the sync panel (click the sync word at the bottom of the left rail), **Earlier versions…** lets you pick any chat,
  project, scene, board or your settings.
- **Deleted things** (a tab there) lists deleted chats, projects, Lab scenes and boards; one click on **Restore** puts
  one back as it was.
- Boards: Board ▾ › More › Earlier versions…. Ctrl/⌘+K "Earlier versions…" and "Deleted things…" work too.
