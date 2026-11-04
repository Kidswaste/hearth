# Round 118 · selfmap118: the AIs' map of Hearth's own code

Goal: when Claude or Astra works on Hearth itself, it should get a short, true map of the code and know where to find
more. Before this round, the docs it would read (FEATURES.md, HANDOFF.md, README.md) still described the old app: the
Life tab, the music studio, After Effects, Video Review and Agent Hub's first layout.

## What changed
- **HANDOFF.md** is rewritten (31 KB → about 12.5 KB). It covers what an AI needs to work on Hearth: the stack, processes
  (main, the store thread, the window, engines, tool servers, workers), windows and pages, the store and sync,
  projects, lazy groups, engines (Claude Code and Codex, the prompt parts, file access), the `mcp/` tool servers, the
  Lab and how its tool calls flow, the checks, the rules and how self-edit works. The rules cover: deletes go to the
  Trash; a store read failure is never "empty"; secrets are never in prompts, code, logs or sync; never edit `data/`;
  token frugality; no automatic upload or silent install; the list of Codex-owned files. Every path, module and
  function it names was checked against the code (and the new check does this again on every run).
- **FEATURES.md** is a short current list (258 KB of round-by-round history → about 6 KB). The history is still in
  `docs/upgrades/` and `docs/patch-notes/`. **README.md** describes the current scope.
- **One map, one place**: the `hearthCode` prompt text moved from `engines.js` into `mcp/hearth-map.js` as `CODE`.
  `engines.js` adds it from there, the same text for both engines, and it is loaded only when a chat's folder is
  Hearth's source (the module is already loaded for directors). The text now says to read HANDOFF.md first, says
  `data/` is the owner's data and must never be edited, and names the Trash and unreadable-store rules (1,071
  characters, under the 1,200 limit in astraparity116-test). `engines.js` `_test.HEARTH_CODE_GUIDE` is now a getter on
  the same text.
- **hearth-map.js**: a new on-demand topic `hearthcode` (aliases: source, sourcecode, architecture, codebase, selfedit,
  hearthsource). Note that "code" alone stays the Lab's big-code topic. It holds CODE plus restart, update-stash and
  "say which checks to run" notes. The `app` topic lists it. The header comment no longer names `hearth_help`, a tool
  that doesn't exist. The sync topic no longer lists the removed features' "What syncs" kinds by name: they still exist
  in `sync-kinds.js` for old data and are now "older kinds kept for data from earlier versions". The always-sent
  `LINE` is unchanged, so no prompt budget moved.
- **dev/selfmap118-test.js** (added to UNIT) checks four things. Every backticked path or glob in HANDOFF.md exists,
  and so does every file name in hearth-map.js; bare names are looked up in the root, tools/, mcp/ and dev/.
  Every `Module` and `fn()` named in HANDOFF.md is declared in the code. No removed file, module or feature name
  (slim116-test's lists, read from its source, plus a word list) appears in hearth-map.js, HANDOFF.md, FEATURES.md or
  README.md. Claude and Astra get the identical `hearthCode` part for a chat on Hearth's folder, equal to `CODE`, which
  points to HANDOFF.md; another folder gets none; this checkout is recognised as Hearth's source.

## What I found in the self-edit flow
- **There is no special "edit Hearth" mode**, and no `hearth-dev` or repo-folder setting. The only path is file
  access: the owner gives a chat (or an AI) access to Hearth's folder through ⋯ AI setup › Files or `/access`.
  `engines.js` `isHearthSource()` recognises the folder by `engines.js` + `mcp/hearth-map.js`. Both still exist after
  round 116, so detection works. A chat's old project folder (`agent.workspace`) goes through the same test.
- **Both engines get the same part**, now from one source. astraparity116-test and selfmap118-test both check this.
  Codex reads no AGENTS.md (`project_doc_max_bytes=0`) and the repo has no CLAUDE.md or AGENTS.md, so the map in the
  prompt and HANDOFF.md, read on demand, are what both AIs get.
- **Fixed:** the docs the map pointed to were stale (HANDOFF.md opened with "You're picking up development of Agent
  Hub…" and described removed tools). The map's header named a `hearth_help` tool that doesn't exist. Directors had no
  way to read the code map on demand (now `three_do help hearthcode`).
- **Left as is (by design):** only the folder itself counts, not a subfolder such as `Hearth/tools`. Walking up the
  parents would tag every chat workspace, because `data/` (and so `data/workspace`, `data/projects`) lives inside
  Hearth's folder. That is also why CODE and HANDOFF.md now say "never edit `data/`".
- **Worth knowing (not changed):** access to Hearth's folder includes `data/` (chats, config). No rule in
  `access-rules.js` protects it; only the prompt tells the AI not to edit it. A hard guard would be an access-rules
  change for a later round. Self-edits survive updates: `updatermain.js` keeps hand edits in a named stash and puts
  them back.
- Nothing uploads or installs by itself in this flow, and nothing was added that does.
- Not touched: `docs/lazy-groups.md` still has notes for the groups round 116 removed (it is not read by any AI
  prompt).

## Tests run
- `node dev/selfmap118-test.js` (also checked that it fails on a made-up file, module, function, glob and a removed
  feature name)
- `node dev/boot-test.js`: 2696 checks passed
- `flock /tmp/hearth-run.lock timeout 1800 node dev/run-checks.js --exact unit:selfmap118-test unit:promptdiet-test
  unit:tokens-test unit:astraparity116-test unit:astra-engine-test unit:slim116-test`: 6/6 passed

## For the patch notes
- When you let a chat work on Hearth's own folder, Claude and Astra now get the same up-to-date map of how Hearth is
  built. It points them to a new HANDOFF.md, which describes the app as it is today.
- FEATURES.md and README.md now describe the current Hearth: chats with Claude and Astra in projects, cloud sync,
  Hearth working on itself, and the Three.js Lab.
- In the Lab, a director can look up Hearth's architecture with "help hearthcode".

## For Codex
- No Codex-owned file was edited (`projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
  `codex-*`, `workbench-*`, `engine-watch.js`).
- HANDOFF.md now lists those files as Codex-owned under "Rules", and describes `codex-server.js` (the app-server
  transport, one per chat; `codex exec` as the fallback), `astra.js` and `astra-workspace.js` in one line each. Please
  correct those lines if they drift.
- `engines.js` (not Codex-owned) had a two-line change: the `hearthCode` part now comes from `mcp/hearth-map.js` CODE.
