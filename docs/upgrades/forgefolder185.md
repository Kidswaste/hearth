# forgefolder185: the Forge chat works in the game's folder without asking (round 185)

The owner (17 Nov 2026): "the forgeheart thing keeps asking me for permissions for stuff, make it stop".

## What it was
The Forge agent's files setting (`fileAccess`) is Full, but its only folder was `data/projects/forge-debug`. The game
is in the project folder (`settings.forgeheartFolder`, its `outputs`) and its git checkout beside it (`work/…`).
`access-rules.js` asks for anything "outside the chat's folders": the owner's access log held 309 Forge entries, 255
of them answered by a grant or by hand (reads, edits, `cat >`, `node`, `git add` in that folder).

## Shipped
- `Forge.grantFolder()` (`tools/forge.js`): 5 s after the Forgeheart tool's code loads, the game's folder is added to
  the Forge agent's folders with `Access.addAiFolder` (the same call as ⋯ AI setup › Files). Once per folder
  (`settings.forgeFolderAccess`): taken out by the owner, it is not added again. Nothing when the agent's files
  setting is off, or when a folder it has already covers it.
- `Forge.gameRoot()`: the project folder; when that folder is `outputs` beside a `work` folder, the folder holding
  both.
- The level is not changed and no rule is loosened: `git push`, deletes, installs and network calls still ask.

## Checks
- `dev/checks/forgechat183.js`: before, a read / edit of a game file asks; after the grant, read, edit and a command
  there are allowed and `git push` still asks; a folder the owner removed is not added again; outputs beside work
  gives the root.
- The owner's real asks replayed through `AccessRules.classify` with the folder added: 9 of 10 kinds become "allow"
  (the tenth is `git push`).

## Not done / not verified
- Not seen in the owner's running app. It applies when Hearth restarts and the Forgeheart window's code loads.
- A chat that has its own files setting (not "as in AI setup") keeps that setting.
- On the owner's Mac the folder path differs: the grant runs there only if the project folder exists on it.
