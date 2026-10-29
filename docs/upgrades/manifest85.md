# The lazy manifest, stable and complete (round 85, manifest85)

`node dev/lazy-manifest.js` writes the generated part of `lazy-data.js` (`LazyData.META`: what each lazy group
registers by the first screen) and `lazy-meta.js` (`LazyText`: those commands' words). `/help`, Ctrl/⌘+K and the keys
sheet show the lazy groups' commands from it until each group loads. It had two defects: two files threw while it
recorded, and its output changed from one run to the next. Nothing new on screen, no new setting, 0 tokens.

Changed: `dev/lazy-manifest.js`, `chat-cost.js` (one listener), `lazy-data.js` / `lazy-meta.js` (regenerated).
New: `dev/lazymanifest-test.js` (`unit:lazymanifest-test`, in UNIT; group `manifest85` in `dev/run-checks.js`).

## Cause

### 1. `FollowCore is not defined`, `Projects is not defined`

The manifest records the "old order": a throwaway copy of the app gets each lazy group's files back after the file
named by its `at` (LazyData.GROUPS), with `dev/lazy-record.js` noting who registers what. Two placement rules were
wrong:

- **Groups sharing an `at` came out reversed.** Each group was inserted *directly* after its `at` file, so a later
  group landed in front of an earlier one. `projects` and `projbundle` are both `at: 'makes.js'`, so `projbundle.js`
  (`const P = Projects;` at load) ran before `projects.js`. The same reversal applied to `places` entries that share
  a file (`tools/three-comp.js` and `tools/three-crew.js`, both after `director-task.js`) and to 24 other `after`
  pairs that happen not to touch each other at load.
- **`after` was ignored.** `questjournal` (`at: 'astra.js'`) needs `follow` (`at: 'offline.js'`, further down the
  page). `follow-hook.js` (in questjournal) does `const F = FollowCore;` at load, so it threw before
  `follow-core.js` existed. At run time lazy.js always loads `follow` first. The recording didn't.

A file that throws at the top of its IIFE registers nothing after the throw. Today `projbundle.js` and
`follow-hook.js` register no commands, actions, keys, apps or tools, so no entry was missing yet. The next
`Commands.register` added to either file would have been dropped from the manifest without any warning.

### 2. The flapping line: `/context`

Two modules register `/context`:

- `chat-cmds.js` (group `chatcmds`) registers the base command.
- `chat-cost.js` (group `context`) registers a `when` variant ("what it is made of") at DOMContentLoaded, which
  `Commands.register` combines with the base.
- `meter.js` (first screen) registers `/context` with `override: true` from `Meter.init()`, which `start.js` calls
  after its startup IPC, just before `hearth:ready`. That replaces the combined command with a plain one.
- `chat-cost.js` joins again only on timers: 1.5 s, 5 s and 15 s after it registered.

The manifest reads `Commands.list()` about 4 s after launch to find "shared" names (`d.variants`). A command with a
shared name keeps its words in `lazy-data.js`. Otherwise its words go to `lazy-meta.js`. The result depended on
start-up speed:

- **Fast start** (`Meter.init` before 1.5 s): the 1.5 s join puts the variant back, so `/context` is shared and
  chatcmds' description stays in `lazy-data.js`.
- **Slow start** (`Meter.init` after 1.5 s): nothing joins again until 5 s. `/context` is read as not shared, so its
  description moves to `lazy-meta.js` (one line changes in each file). The same race also made the lazy-build
  comparison fail with `✖ actions: lost ["/context — "] added ["/context —  · what it is made of: …"]`.

Proof of the cause: the round-84 manifest and `chat-cost.js`, six runs, with four CPU burners on every second run:

```
old run 1 idle   rc=0 data=c3b9b380 meta=abbc5855 exceptions=2
old run 2 loaded rc=1 data=61978088 meta=f9133dc7 exceptions=2
old run 3 idle   rc=0 data=c3b9b380 meta=abbc5855 exceptions=2
old run 4 loaded rc=1 data=61978088 meta=f9133dc7 exceptions=2
old run 5 idle   rc=0 data=c3b9b380 meta=abbc5855 exceptions=2
old run 6 loaded rc=1 data=61978088 meta=f9133dc7 exceptions=2
```

The only difference between the two outputs is `chatcmds.commands:context.desc` ↔ `LazyText.chatcmds.context.desc`.

I checked the other suspects and none of them affects the output. `readdirSync` order only decides which files are
copied first. The temp script's `Math.random` name, `Date` and the timings in the "globals touched" lines appear only
on stdout. Every JSON object is built in registration order, which is deterministic once files load in a fixed order.

## Fix

- **Placement (`dev/lazy-manifest.js`).** Groups that share an `at` are put one after another, in the order of the
  `lazy-at.js#…` tags in index.html. That is the order lazy.js registers their stand-ins at run time. Groups without
  a tag follow in LazyData.GROUPS order. Then any group whose `after` group still lands later moves to right after
  that group's last file. This moves four groups: `questjournal` after `follow.js`, `handoff` after `concise.js`
  (budget), `historylean` after `handoff.js`, and `publishkit` after `publish-hooks.js` (renders). A cycle in `after`
  stops the run with an error. `projbundle.js` and `follow-hook.js` are not edited.
- **No recording with a throw.** The exceptions printed while the old order loads now stop the run (`✖ N
  exception(s)…`) and nothing is written. `--force` writes anyway.
- **Read after the first screen.** The old-order snapshot waits for `hearth:ready` (at most 30 s) plus 300 ms before
  it reads the registry.
- **Shared names from the recording.** Any name a group registers with `when` always counts as shared, whatever the
  registry shows at that moment. This name always shares with its base command, so the result is the same on a fast
  or a slow start.
- **Root fix in `chat-cost.js`.** Its `/context` also joins on `hearth:ready`, which `start.js` fires right after
  `Meter.init`. On a slow start the real app also lost "/context: what it is made of" for up to 5 s (or 15 s). That no
  longer happens. In the lazy build the context group loads after ready and joins at load, as before.
- **`--check --emit <file>`.** `--check` already wrote nothing and exited 1 when a file would change. `--emit` also
  writes the would-be text of both files as JSON, for the unit check.

## Proof

- **10 runs, identical.** `node dev/lazy-manifest.js --check --emit …` ran 10 times, with four CPU burners on every
  second run (the condition that flapped before). Every run gave `rc=0` (up to date, lazy build equal), 0 exceptions
  and the same emitted bytes (`f96070c431da`, 5 idle and 5 loaded).
- **`unit:lazymanifest-test`.** It runs `--check --emit` twice. Each run must exit 0, throw nothing and match the
  committed files. The two runs must give the same bytes. Result: 12 checks passed, about 36 s.
- **`--check` fails when it should.** A line appended to `lazy-meta.js` gives `✖ lazy-meta.js is out of date`, exit 1.
- **Before and after the regeneration**, counting every META entry (each command, action, key, tool prefix, app and
  tool, with each field) plus every LazyText word: 5827 entries before, 5827 after, **0 lost, 0 added**.
  - The only change is order: in `lab`, `/comp` (with its `precomp` alias) now comes before `/crew`. Both files go
    after `director-task.js` via `places`, which lists comp first. The old insertion reversed them. The same swap
    shows in `LazyText.lab` (14 positions in all, the same two commands).
  - Compared with the flapped output (the other state of the old manifest), the only difference is `/context`'s
    description, which now always stays in `lazy-data.js`.
- **Checks.** `lazy`, `projects`, `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`,
  `unit:storeack-scan`, `unit:chatsafe-scan`, `unit:boot-test` (first screen 1805 / 1810 KB, unchanged: lazy-data.js
  is still 108.5 KB) and `unit:lazymanifest-test` all pass.

Noticed, not changed: in `meter.js` the `/context` override's `args`, `desc` and `complete` sit inside a `//` comment
on the line `R({ name: 'context', aliases: ['ctx'], override: true, // replaces …`. The meter's `/context` therefore
has no description of its own, and Ctrl/⌘+K shows "/context — " with an empty description until chat-cost joins.

## For Codex

No Codex-owned file was touched (`projbundle.js`, `follow-hook.js`, `projects*`, `quest-*` unchanged).

## For the patch notes

Behind the scenes: the help, the command list (Ctrl/⌘+K) and the keyboard-shortcuts sheet no longer lose entries or
their descriptions. The list they are built from now comes out the same every time.
