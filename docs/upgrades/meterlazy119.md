# Round 119 · meterlazy119: the token meter's chat commands load after the first screen

Round 118 (docs/upgrades/startup118.md) left meter.js on the first screen at 55.5 KB, about half of it chat commands that
nothing needs at the first paint. This stream moves them into a lazy group, `metercmds`, and keeps the meter itself
(the rail pill / strip, the per-reply token line, the chats list totals, the engines' usage feed) on the first screen.

## Sizes

| First screen (`node dev/boot-test.js`) | Before | After |
|---|---:|---:|
| Scripts parsed before the first frame | 62 | 62 |
| Code (no whole-line comments) | 1,597 KB | **1,576 KB** (−21 KB) |
| Stylesheets | 27 · 416 KB | 27 · 416 KB |
| Budget (`dev/boot-test.js`) | 62 / 1,607 / 27 / 420 | **62 / 1,586 / 27 / 420** (1,576 + 10 KB headroom) |
| Lazy groups | 122 | 123 (`metercmds`) |

| File | Before | After |
|---|---:|---:|
| meter.js (code without comment lines) | 56,865 B | **33,832 B** |
| meter-cmds.js (new, lazy) | – | 23,928 B |
| lazy-data.js (the 50 stand-ins of the group) | 104.2 KB | 106.0 KB (+1.8 KB) |

The manifest's totals are unchanged: names 943, aliases 335, actions 1,379, keys 500, apps 51, tools 8, duplicates 0.

## What moved

- **meter-cmds.js** (lazy group `metercmds`, tier 'soon', its stand-ins at meter.js's place: `lazy-at.js#…,meterdash,metercmds,…`):
  the meter's 50 other chat commands with their helpers (`/usage`, `/meter`, `/meter-field`, `/budget`, `/budgets`,
  `/budget-warn`, `/alerts`, `/long-warn`, `/cost-free`, `/stats-today`/`week`/`month`, `/lifetime`, `/compare`,
  `/forecast`, `/hourly`, `/daily`, `/top-chats`, `/top-features`, `/unused`, `/hide-feature`, `/show-feature`, `/hidden`,
  `/hot`, `/cold`, `/streak`, `/areas`, `/feature`, `/clicks`, `/features`, `/cache`, `/models`, `/by-agent`, `/by-tool`,
  `/split`, `/replies`, `/speed`, `/peak`, `/streaming`, `/estimate`, `/last-reply`, `/chat-tokens`, `/badges`,
  `/panel-totals`, `/export-usage`, `/usage-rebuild`, `/session`, `/budget-left`, `/weekdays`, `/calibration`) and the run
  bodies of `/tokens` and `/context`. The code is the same; it reads meter.js's numbers and helpers through
  `Meter._dash` (as meter-dash.js already did), `Meter.prefs` and `Meter.stats`. `/meter reset` used to replace meter.js's
  `prefs` object itself; it now calls `resetPrefs()` in meter.js, which does exactly that.
- Stays in meter.js: the pill / strip, the reply token badges, the chats list totals, budgets' alerts, the long-context
  toast, Ctrl+Shift+U, the 11 Ctrl/⌘+K lines (they were registered there, unchanged), `report()` (the palette's "Copy a usage
  summary" and the dashboard use it) and the registration of `/tokens` and `/context`.
- The group loads in an idle moment after the first screen, or when one of its commands is first used. Its stand-ins
  are in the "/" menu, /help, the Commands page and the plain-language search from the start, with their words
  (lazy-meta.js), as for every other lazy group.

## How /tokens and /context stay correct

Today's order (checked in the app before the change): chat-cmds.js (`chatcmds`, its stand-ins at chat-ux.js) has a
simpler `/tokens` (alias `/cost`) and `/context` (alias `/ctx`). `Meter.init()` (start.js, right before `hearth:ready`)
registers the meter's `/tokens` (alias `/tok`) and `/context` with `override: true`, which replaces them; when chatcmds
loads, its own two land in its stand-ins, which are no longer in the registry, so **the meter's win** (and `/cost` still
reaches the meter's `/tokens`). chat-cost.js (`context` group) then joins `/context` as its `when` variant ("what it is
made of"), re-joining after the meter's override (`hearth:ready` and its timers).

A lazy stand-in cannot do this: lazy.js skips a stand-in whose name is already taken, so a `metercmds` stand-in for
`/tokens` would have lost to chatcmds' and the first `/tokens` would have run the chat stream's simpler one. So these two
are **not** part of the lazy group: meter.js still registers them itself, in `Meter.init()`, at the same moment, with the
same name, aliases, args, description, argument suggestions and `override: true`. Only their `run` changed: it loads
`metercmds` (`Lazy.load`, a no-op once it is in) and runs `MeterCmds.tokens` / `MeterCmds.context`, the old bodies. So:

- the same winner (the meter's), the same aliases (`/tok`, `/cost` → meter's `/tokens`; `/ctx` → meter's `/context`), and
  chat-cost.js's `/context` variant combines with it exactly as before;
- the very first `/tokens` or `/context` runs the full command (no "unknown command", no fallback);
- the manifest never sees them as the group's, so there is no stand-in to fight over.

Checked in the app (dev/smoke.js scripts, not added to the repo): with every group held back (`lazy.hold`), `/tokens today`,
`/context` and `/budgets` each ran the meter's full command at first use and loaded `metercmds`; no global was touched
before its group; the Meter area lists the same 56 commands with the same aliases and owners (`/cost`, `/tok`, `/ctx`,
`/today`, `/week`, `/free`, `/left`, `/dashboard`… → the meter's) as before the change, both at `hearth:ready` and after
every group loaded; `/context` is `{Meter + Messages}` combined as before; duplicates 0.

## Looked at and not moved

- **look.js** (≈ 8.5 KB of commands + ≈ 9.8 KB for the Appearance picker): `/theme` overrides the chat stream's `/theme`
  (the same stand-in problem as `/tokens`), `/look` is shared with the Lab's saved looks, and appui-dialogs.js (Settings)
  calls `Look.picker()` synchronously; Ctrl+Shift+L and tests open the dialog at once. Not identical without more
  forwarding than it saves.
- **keys-ui.js** (50 KB): most of it is the Keys registry, which the keys badges, the stand-ins' keys lines and Ctrl+/ need
  at once; the sheet itself is ≈ 8 KB.
- **sync.js** (/sync and /background ≈ 6 KB, the setup ≈ 8 KB), **chat-attach.js** (≈ 6.6 KB of /attach-*),
  **declutter.js** (7 small commands): too small for the risk, or drawn / used at the first paint.
- **astra.js** (65 commands) is Codex-owned and was not touched. The Three.js editor (the Lab) is already entirely lazy.

## Tests run

- `node dev/boot-test.js`: 2,812 checks, the new budget ✓
- `node dev/lazy-manifest.js` (rewritten), then `node dev/lazy-manifest.js --check` ✓
- `flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact qa-commands lazy fastboot unit:lazymanifest-test unit:tokens-test unit:tokenaudit-test chat-cmds context`
  with `HEARTH_THREE_DIR` set (chat-cmds and context are the checks that type `/tokens` and `/context`): see the result
  below.
- No new unit test: the only new logic is a one-line `resetPrefs()` (the old `/meter reset` body moved as is) and the
  forwarding `run` of two commands, both covered by the checks above.

**Result: 8/8 passed in 8 min**: qa-commands ✓, lazy ✓, fastboot ✓, unit:lazymanifest-test ✓, unit:tokens-test ✓,
unit:tokenaudit-test ✓, chat-cmds ✓ (`/tokens`, `/tokens today`, `/context`), context ✓ (`/context` with what the last
message was made of). qa-commands now also reads meter-cmds.js (area Meter) and was run again on its own ✓.
- Node scans for the new file: `dev/chatwin-scan.js` (its audit updated: meter.js 3 → 2 lines, meter-cmds.js 1, the
  `/last-reply` lookup that moved), datasafe-scan, storeack-scan, errorcalm-scan, chatsafe-scan, winmac-test ✓.

## For the patch notes
- Hearth has a little less to read before the first picture (about 20 KB): the token meter's many chat commands
  (/usage, /budget, /stats-today and the rest) now load just after the start.
- Nothing changes in use: the meter in the rail, the token line under each reply, and every command, /tokens and
  /context included, work from the first moment and give the same answers.

## For Codex
No Codex-owned file was touched (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch). The datalock119 files (access*, engines.js, mcp/access-mcp.js) were not touched either.
If Codex code ever calls a meter command directly before the start is done (`Commands.run('usage', …)`), it goes through
the stand-in and loads `metercmds` first, as for any lazy group; `Commands.get('tokens')` / `('context')` are the same
objects as before.
