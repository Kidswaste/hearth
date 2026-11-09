# Round 164 · groups164: fewer, larger lazy groups

The owner wants Hearth lighter to load. After 160 rounds there were 185 lazy groups (lazy-data.js), many of them one
small file that loads by the same trigger as its neighbour, and 51 `lazy-at.js#…` marker tags in index.html (each one a
script element the start parses and runs). This round merges the groups that always load together into one group with
the concatenated file list (no file content changed), and writes neighbouring marker tags as one tag. Zero behaviour
change was the rule.

## Result

| | Before (origin/main aecaca3d) | After | |
|---|---:|---:|---:|
| Lazy groups in all | 185 | **171** | −14 |
| Groups loaded by the time the start is over (every 'soon' group in) | 86 | **73** | −13 |
| `lazy-at.js` marker tags in index.html (script elements at the start) | 51 | **14** | −37 |
| Script elements in the window once the start is over | 311 | **274** | −37 |
| …after opening a chat | 311 (no group loads) | 274 (no group loads) | −37 |
| …after opening the Lab (main window, the Lab not prefetched) | 445 (+134 files, 8 groups) | 408 (+134 files, 8 groups) | −37 (same Lab files) |
| Lab window marker tags | 2 | 2 | (its list: `kit,lab` instead of `kit,nodes,lab,labintent`) |
| First screen up (`hearth:ready`, ms since the process started, median of 10 launches) | 494 ms | **471 ms** | −23 ms (−5 %) |
| `ready-to-show` (two medians of 5) | 475 · 455 ms | 472 · 433 ms | ≈ −12 ms |
| Every 'soon' group in with the calm gate forced open (coldstart `features`, median of 10) | 3,178 ms | 3,530 ms | +350 ms (see below) |
| Opening the Lab in Hearth's window (groups164 probe: activate → preview built, 2 runs) | 663 · 584 ms | 525 · 530 ms | ≈ −95 ms |
| Opening the Lab, split158-measure (first drawn frame, median of 3) | 1,501 ms | 1,456 ms | noise-level |
| Lab window: click → first frame (split158-measure, median of 3) | 1,821 ms | 1,919 ms | noise-level (1,422–1,970 across runs) |

The JS files themselves are unchanged: the same 134 files load when the Lab opens, the same files at the start. What
went is per-group bookkeeping (one load chain step, one idle wait, one stand-in pass, one `hearth:lazy` event each) and
the 37 marker scripts. Electron's file:// loads give no resource-timing entries, so "requests" is counted as script
elements.

**The `features` number.** With the calm gate forced open (coldstart-report calls `Lazy.calmNow()`), the background
groups load during the busiest second of the start. A bisect (origin/main with only the marker tags written as one,
nothing merged: 3,526 · 3,590 · 3,554 ms) shows it comes from the tag change, not the merges: the first screen is up
≈ 30–50 ms sooner, and the background groups then meet ≈ 0.6 s more of the start's busy time (two `requestIdleCallback`
waits run to their 600 ms timeout between polish8, juice and a11y). In a real start the non-`asap` groups wait for the
calm gate (10 s after the first screen and 3 s without input), so this doesn't show there; the `asap` groups load at
the same moments as before (`coldstart-report --groups`).

## How "always load together" was decided

All of these had to hold for a merge:

- same tier, same `asap`, same flags (`slots` / `redraw` / `send` / `keysNow` / `actionsNow` / `prefetch`);
- same feature in the HearthFeatures registry (an optional feature's groups only with each other, so Trim Hearth can
  still switch each feature off; most merges are inside an always-on feature);
- loaded one after the other in practice: consecutive in lazy.js' real load order (`soon()`: asap first, then GROUPS
  order, `after` first), checked with the loader's own log (`Lazy.state()[].at`, `coldstart-report --groups`) at the
  start, after opening a chat (no group loads) and when the Lab opens (lab + 4 'use' groups of 4 different optional
  features + 3 followers of 3 different features: nothing to merge there);
- stand-ins in the same order: the absorbed group registers nothing (no command, palette line, key, tool, app, agent
  prefix), or its marker tag is right next to the survivor's (compdispatch after directortask);
- same Lab window membership and tier (lab-window-pre.js).

### What merged (185 → 171)

| Group now | Took in | Feature | Loads |
|---|---|---|---|
| `chatcmds` | chatrest | Chats (core) | asap |
| `kit` | nodes, labintent | The Lab (core) | asap, both windows |
| `datasafe` | errorcalm | Safety nets (core) | asap |
| `directortask` | compdispatch, directordock | The Lab (core) | asap |
| `lite` | ctxmenus | Screen and calm (core) | asap |
| `a11y` | idlecpu | Screen and calm (core) | after the start |
| `addons` | memorytidycore, memory, notes | Chats (core) | after the start (addons needed memory and notes) |
| `aiundo` | undoall | Safety nets (core) | after the start |
| `costcoach` | usagelimits | Cost coach & Usage left (optional, one feature) | after the start |
| `gamemode` | gameready | ▶ Play (optional) | on use: ▶ Play loads both |

Each merged group lists its files in the old load order (`places` keeps the recording of the manifest at the old spots),
the union of `after` / `wait`, its CSS in order (`cssBefore` and css159's `CSS_AFTER` sheets moved under the new name:
`directortask` carries comp-compdispatch.css and director-directordock.css), its globals, and `also: [...]`.

Tried and taken back: `projects` + projmenu + projectbrief + nextstep. When Projects is the first screen, `projects`
loads while the first screen is built, and projectbrief.js then touched `Board` before the board group was in
(fastboot: "no lazy global touched while the first screen was built"). Those four stay apart.

### Keeping every name working (lazy.js, `also`)

A merged group keeps the names it took in. `Lazy.load('notes')`, `Lazy.when('aiundo')`, `Lazy.isIn('directordock')`,
`Lazy.loaded('labintent')`, `Lazy.off` / `used` / `by` / `names` / `report`, and other groups' `after` / `wait` lists
answer for the group the name is part of now (`groups.get` / `has` resolve them; `Lazy.real(name)` says which).
`Lazy.state()` and `Lazy.groups()` list real groups with their `also`. HearthFeatures' `featureOf` / `isOff` resolve the
old names, and Trim Hearth's usage counts add what was counted under them (localStorage 'hub.trim.use').

### Marker tags

Neighbouring `<script defer src="lazy-at.js#…">` tags with no other script between them are one tag listing the same
names in the same order (lazy.js registers each group's stand-ins in that order either way); the names taken into
other groups are out of the tags.

### Files

lazy-data.js (groups, CSS_AFTER, HearthFeatures), lazy.js (`also`), index.html / lab-window.html (marker tags),
lab-window-pre.js (the Lab window's list), trim-data.js (core lists, weights), trim.js (usage counts), lazy-meta.js
(regenerated), dev/lazy-manifest.js (a group whose `at` file arrives with a later group goes in after it, as `places`
already did: prompt-library.js after memory.js). Checks that read a group's state by an old name accept `also`
(firstscreen87, firstscreen96, labchat102, undoall, usagelimits, labwin153).

## Part 1: stage150 and the Lab dock

The owner's "Lab dock" commit (2377682f) moved the preview's stats line into a solid strip under the picture
(`.three-right > .lab-dock > .three-stats`, same element) with big QUALITY and FPS controls, always fully shown.
stage150 now asserts that layout: the view controls stay on the picture, the dock sits right under it (next sibling,
not overlapping, ≥ 30 px tall) holding the stats line and both segmented controls with a current choice, and no stats
line is left in the picture. Idle / pin / clean / Plain keep testing the hide-on-idle of the view controls and the
header readouts and now expect the dock's stats to stay in sight; the bottom edge is still zone b. redux151's
"every control is still in the Lab" lists the dock (stats, QUALITY, FPS) among the essentials in sight at rest.
look148, lab143 needed nothing.

Found, not changed (Lab CSS is the owner's): **redux151's "nothing animates at rest"** can fail (2 of 3 full runs on
this branch before the last merge; it passed in the final run) with
`transform@fb-fill` (the frame budget bar's .25 s transition, tools/framebar.css). In the dock the bar is always drawn,
and the rule that stopped its transitions while the stats were hidden (three-hudstage.css `.three-preview.st-on … >
.three-stats *`) no longer applies there. On origin/main the same check passes because the bar is often missing: the
stats line is built once, and `typeof FrameBar` is still a stand-in at that moment on a busier start. A
`.lab-dock .fb-fill { transition: none }` (or the same rule for the dock) would fix it.

labcalm's "pointing at the picture shows More…, 📷 and ⋯" fails as on every build since round 150 (redux151.md, css159.md).

## Checks

`flock /tmp/hearth-run.lock timeout 2900 node dev/run-checks.js --exact stage150 look148 redux151 lab143 labcalm playfix
lazy fastboot firstscreen96 trim153 labwin153 split158 lite153 qa-keys cmdbar141 unit:lazymanifest-test
unit:boot-test` after the final merge of origin/main and claude/intelligent-galileo-yaiqem: **16 / 17** (labcalm as
above; redux151 passed this time, see its intermittent fb-fill step above). `node dev/whatsnew-test.js` 49 passed,
`node dev/trim-weights.js --check` up to date (171 groups), `node dev/lazy-groups-test.js` ✓.

Measured with `node dev/coldstart-report.js --app <copy> --runs 5` (twice each, interleaved), `--groups`,
`node dev/split158-measure.js --app <copy> --runs 3`, and a probe run through `dev/smoke.js --no-lazy-wait` that counts
groups and script elements at the start, after opening a chat and after opening the Lab; before = a copy of origin/main
aecaca3d, after = this branch, all under the shared check lock.
