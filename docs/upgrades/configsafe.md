# configsafe (round 55): your settings live in your data folder, so updates can't set them aside

## Why
Round 54's lost Lab chats had one root: the owner's settings (`config.json`: agents, settings, look) and CSS
(`theme.css`) were files git tracks. Every update had to put them in a stash while it merged and put them back after;
during the round 53 → 54 update the window saved the repo's copy in that moment and the owner's copy stayed in the
stash (the Three Director, so its chats, left the Lab). labchats54 patched the symptoms (holds, bring back). This
round removes the cause: Hearth no longer writes any file git tracks.

Every git-tracked file Hearth wrote at runtime (checked: writes in `main.js` and every `*main.js`, `fsapi.js`,
`portable.js`, `sync-engine.js`, the MCP servers, against `git ls-files`): only `config.json` and `theme.css`. Everything
else Hearth writes is under `data/` (git-ignored) or outside the app folder.

## Upgrades
### Your settings in the data folder
1. **Your settings, agents and look now live in `data/config.json`, your CSS in `data/theme.css`.** The data folder is
   never touched by updates, so ⬆ Update has nothing of yours to stash any more.
2. **Moved by themselves, once**, at the first start of this version, before anything reads them: the content is
   copied exactly (written to a temp file, flushed, renamed, read back) and a byte-for-byte copy of what the old files
   held is kept in `data/.configsafe/`.
3. **The files next to Hearth's code are now read-only defaults.** After the move they go back to the repo's own
   version (only once what they held is safely in the data folder), so the checkout is clean and updates need no stash.
4. **What Hearth uses = your settings + what the defaults add.** Agents join by id (your fields win, a field only the
   default has is filled in); a new default agent or a new part of the settings shows up after an update; a default
   agent you removed stays removed (`defaultsSeen`, which travels with your settings so the other computer agrees).
5. **Anything still sitting in an update's stash comes into the data folder** a moment after the start (labchats54's
   bring back, now aimed at `data/config.json` / `data/theme.css`): the owner's agents join, their CSS comes in only
   while the data copy is still the repo's own. Stashes are never dropped; each is read once.
6. **A file that can't be read is never decided on**: a tracked `config.json` that is held (Windows: antivirus,
   OneDrive), half-written or missing leaves that start on the old layout, exactly as before; the move happens at the
   next start that can read it.
7. **↶ Go back to a version from before the move keeps your settings**: that version reads the tracked files, so
   your settings and CSS are handed to it there (the Lab's director and its chats stay put); what you change while on
   it comes back into the data folder (its edits win, nothing of data's lost) at the next start after updating again.
8. Settings › Edit config.json / Edit theme.css open your own copies (a `theme.css` never made starts from the default).

### Everything that reads the settings follows
9. The window, the engines, AI setup, Check this AI / this computer, the MCP connections: the defaults + yours
   (`readConfig` in main.js).
10. 🛟 Recover… and the data health card read and save the same config (`cfgView`).
11. Backups (automatic and manual), Export, Pack for a Mac: your copies from the data folder, still named
    `config.json` / `theme.css` at the zip's top, so old and new backups restore the same way.
12. Sync: your `data/config.json` / `data/theme.css` travel as before (`app/config.json`, `app/theme.css`, the portable
    part), and never a second time as data files (`sync-merge.js` LOCAL_FILES).
13. The capture MCP server, fsapi's backups / restore and the scene / backup Recover helpers read your copy too
    (`configsafe-core.ownFile` / `readEffective`).
14. Edits from outside Hearth (an editor, sync) to your copies or to the defaults (an update) reach the window as
    before.

15. The Windows finish-at-restart path and the ⬆ restore (fixes55's `restoreSteps`) aim at the owner's data copies
    once moved (the tracked files keep the update's version); before the move, the old files as before.
16. chatsafe55's "Bring back <its AI>" reads the settings Hearth uses (data copy + defaults), the update stashes, then
    the copy kept in `data/.configsafe/` (`updatermain.agentAside`).

### Kept as a safety net
- labchats54's holds stay: `main.js` still holds the window's config saves and the watchers while an update moves
  files, `updatermain.stashRestore` still keeps a mid-update write in its own named stash and merges it back.

## How it works (for the next developer)
- `configsafe-core.js` (plain Node): `migrate({ appDir, dataDir, fs })` (sync, main.js before `datasafe.config`;
  `fs` is datasafe's test-fault wrapper), `effective(own, defaults)`, `ownFile`, `readEffective`, `afterStart(U, cfg)`
  (bringBack into data, then settle), `writeAtomic` (crashsafe + read back), `keepCopy` (`data/.configsafe/<name>`,
  dated copies when something new is kept).
- `updatermain.js`: `bringBack({ own })` (config.json → `configFrom(rev, head, file)`, theme.css → `themeFrom`),
  `settle({ own, keep })`: per tracked file that differs from HEAD, keep a copy, bring what it has into data
  (`bringConfig`; the repo's agents the owner lacks count as removed), then `git checkout HEAD -- <file>`; never while
  an update runs or a journal says one stopped half-way. `back()` → `handBack(target)`: a target without
  configsafe-core.js gets the owner's effective config / CSS written into the tracked files (state `handedBack`), and
  the next settle lets those edits win once. `configFrom` now reads / merges / writes in one go after git's
  answers (a window save can't slip in between).
- `main.js`: `CONFIG_PATH` / `THEME_PATH` = the owner's copies (data mode) or the tracked ones (old layout this start);
  `DEFAULT_*_PATH` = the tracked defaults, read once per version of the file; watchers on both.
- Tests: `node dev/configsafe-test.js` (`unit:configsafe-test`; real throwaway git repos), group `configsafe`
  (configsafe-test, labchats54-test, updater-test, updatesafe-test, updater).

## Checks run
- `node dev/run-checks.js configsafe`: configsafe-test (56 steps), labchats54-test, updater-test, updatesafe-test,
  updater: all pass.
- `unit:datasafe-scan`, `unit:winmac-test`, `datasafe` (window check, held settings at the start), `unit:datasafe-test`,
  `unit:sync-test`, `unit:backupauto-test`, `unit:scenesafe-test`, `unit:capture-mcp-test`, `unit:powerwise-test`, `lazy`,
  `unit:boot-test`: all pass.
- A smoke run: a save from the window lands in `data/config.json`, the tracked `config.json` stays byte-identical, the
  copy is kept in `data/.configsafe/`.

## Caveats
- The tracked files going back to the repo's version needs git (a zip copy without git keeps them as they are: they
  are only read as defaults there, so nothing changes for the owner).
- A default agent removed on the other computer before it ran this version can come back once here; removing it
  again sticks (it is then in `defaultsSeen`, which syncs).

## For the patch notes
- **Your settings now live in your data folder.** Your agents (the Three Director included), settings, look and your
  own CSS moved by themselves into Hearth's data folder, the folder updates never touch.
- **Updates can't set your settings aside any more**: there is nothing of yours left for an update to stash, so what
  happened to the Lab's chats in round 54 can't happen again.
- The move happens once, at the first start, and keeps an exact copy of the old files in `data/.configsafe`.
- Anything an earlier update still had put aside comes back into your settings by itself.
- New defaults from an update (a new agent, a new setting) still show up; an agent you removed stays removed.
- Backups, sync between your two computers, Export, Recover and "Edit config.json / theme.css" all use your copies.
- ↶ Go back to an older version still shows your settings and your Lab chats where they were.
