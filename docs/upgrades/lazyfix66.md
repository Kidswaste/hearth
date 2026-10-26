# lazyfix66: the lazy check after Codex's project workspaces

`node dev/run-checks.js --exact lazy` failed after merging Codex's c3c40e4..becd52e. Both failures were already there at
c3c40e4 (checked on an export of that commit): they come from Codex's 3d7723c ("Make projects complete creative
workspaces…", 2026-10-19), which made `renderer.js` always open on Projects (`const startOn = 'tool:home'`), not from
the 55 merged commits (resume points, lab-file-drop and the rest load nothing at boot).

## What caused each failure
1. **all held at start** (`projects: loaded`). Traced with a temporary stack log in `Lazy.load`: the one and only
   load at boot came from the Projects home stand-in's `mount` (lazy.js `stubTool`), called by `activate()` in
   `apply()`. Projects home is the first screen, so showing it *is* the group's first use. Nothing else (assets.js
   `need('projects')`, resume / return points, projects-home.js, the Lab file drop) loads it eagerly. On a normal
   start the group loads after the first frame (first paint 412 ms, projects in at 486 ms, 36 ms of work), so it
   doesn't hold the first screen back.
2. **starts on the Lab** (ended on `tool:home`). Same line: 3d7723c replaced `H.settings().startOn` with a fixed
   `'tool:home'`, so the Settings choice *Starting and closing › Open on start* was still offered but ignored. That
   is a regression of the owner's setting, not an intended removal (the menu, its summary and freshen.js still use
   it), while "Projects first" for everyone who made no choice is Codex's intended new default.

## What changed
1. `renderer.js`: the first screen is the Open on start choice when there is one, else Projects (Codex's default kept).
2. `appui.js`: the Open on start menu's empty choice reads "Projects" (it said "What you used last", no longer true).
3. `renderer.js`: `H.surfaceIdFor` and the workspace bar's `project()` ask `Lazy.isIn('projects')` before peeking at
   `ProjectWorkspace`: during boot each `activate` / sync touched the stand-in global, which logged a miss (a stack
   trace per call, 16 per start) and pulled the projects group forward when the first screen isn't Projects.
4. `dev/checks/lazy.js`: the held start pins a chat as the first screen (Open on start = the Claude chat), since a
   first screen that is a lazy tool rightly loads its own group; the rest of the check is unchanged.

## Checks
- lazy ✓ (was ✖ at c3c40e4 and becd52e), unit:boot-test ✓, project-continuity ✓, project-lifecycle ✓,
  project-fluidity ✓.
- project-workspaces ("Timed out: project overview") and projects ("its page lists chats and scenes, with notes")
  fail the same way on unchanged becd52e: pre-existing, not from this change (left for Codex / a later round).

## For Codex
No Codex-owned file was edited. The start-screen line you set in `renderer.js` (3d7723c) now reads
`H.settings().startOn || 'tool:home'`: Projects stays the default; an explicit Settings › Open on start choice wins.
`H.surfaceIdFor` / WorkspaceNav `project()` skip `ProjectWorkspace` until `Lazy.isIn('projects')`.

## For the patch notes
- Settings › Starting and closing › Open on start works again: if you picked a screen there (the Lab, a chat…),
  Hearth opens on it. With no choice, Hearth opens on Projects, as before.
- That menu's first choice now says "Projects", which is what it does.
- Starting Hearth does a little less work when it opens somewhere other than Projects: the projects part loads in
  a quiet moment instead of right after the first screen.
