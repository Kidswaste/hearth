# Round 175 · sweep175: the check suite under the faster harness, and first-screen CSS headroom

Two parts: (1) round 174 fixed `dev/smoke.js`' lazy-groups wait (since round 94 every check part had waited its full
30 s), so checks start ≈ 30 s sooner per part; the broad groups were swept for checks that leaned on that idle time;
(2) first-screen CSS was at 383 of its 385 KB budget: brought to **364 KB** with no visible change, budget lowered to
**375 KB**. The Lab, Scenes v2, the Lab's CSS, Codex's files and the off-limits areas were not edited.

## 1. The sweep

How: the groups ran on a frozen copy of round 174's main (98ab3b6c, `git archive` into a scratch folder: this round's
edits could not leak in), under `/tmp/hearth-run.lock`:

- `release` (qa + every unit test + core): **271 / 285** passed in 28 min.
- the lightening rounds' checks `perf151 idlecpu mem154 main162 chat165 audit166 paint167 forge168 settings169 switch170
  restyle172 audit174 playfix fastboot`: **13 / 14** passed in 36 min.

Each failure was run again alone, then on round 173's copy (51b47d50) with round 173's own `dev/` (the old 30 s wait).
Node-only tests don't go through smoke.js at all, so the harness can't be their cause; they were still compared.

| Check | Failure | Alone | Round 173 (own dev/) | Class | What was done |
|---|---|---|---|---|---|
| perf151 | first run: "hidden: every process ≤ 30 ms/s" (35); alone: "readouts: the usage pass woken by the Lab's live readouts ≤ 0.2/s" (0.4) | fails (readouts) | **fails the same** (readouts 0.4) | c (Lab) | The hidden step's 35 ms/s came from Node tests I ran beside it (passed alone). The readouts step fails the same with the old wait: the Lab's live readouts wake usage.js' decorate pass. For the Lab's owner |
| unit:devreport-test | `git rev-parse HEAD~1` | passes in the checkout | — | c (artifact) | the frozen copy had no `.git`; passes in a real checkout |
| unit:directorlean-test | `git show 7d8cb4e:tools/three-director.js` | passes in the checkout | — | c (artifact) | same: needs git history |
| unit:winmac49-test | key-text-raw: panel.js:711 `'Opens Ctrl/⌘+K …'` | fails | fails | b | **fixed**: the tooltip goes through `macText` (⌘K on a Mac, Ctrl+K elsewhere) |
| unit:errorcalm-scan | 3 new raw-error places | fails | fails | b + c | **fixed** lazy.js (Trim Hearth's "switched off" toast showed `err.message` of its own Error: now the same words from a variable, the scan's false positive gone). Left: tools/three-lab-tools.js:140, tools/three-labwin.js (Lab) |
| unit:datasafe-scan, unit:emptyread104-test, unit:datasafe-test | main.js:718 the IPC-channels cache's read (main162) taken as empty; tools/three-txn.js `labtxn-replies` | fail | fail | b + c | **audited** main.js:718 in dev/datasafe-baseline.json (a cache: a failed read only means the channels are read from source again). Left: three-txn.js (Lab) |
| unit:chatwin-scan | nextstep.js (6), projectbrief-draft.js (1), projectbrief.js (1), tools/three-labwin.js, three-refmatch.js, three-replydiff.js not in AUDIT | fails | fails | b + c | **audited** ours: nextstep reads the last reply, the count and the last 40 replies' tools (inside chatwin.js' TAIL of 300 always held), the brief the last reply's usage from the end and the count. Left: the three Lab files |
| unit:projperf120-test | "a switch: the bar repainted once" `barPaints: 0`; "an arrival … no repaint" `barPaints: 1` | fails | fails | b (test behind the app) | switch170 (round 170) paints the projects bar with the list's own draw (Panel.soon), or 400 ms later; the test's stand-in Panel.soon draws nothing, so the bar came 400 ms later inside the next step. **Fixed in the test**: it runs the list's draw after a switch, as Panel.soon does (22 / 22) |
| unit:chatsafe-scan | tools/three-critique.js, three-explain.js set `S.agentId` | fails | fails | c (Lab) | for the Lab's owner |
| unit:storeack-scan | `labtxn-replies`, `three-blocks`, `three-versions-trash` written and synced with no `StoreAck.hold` | fails | fails | c (Lab) | for the Lab's owner |
| unit:promptdiet-test | Three Director (full) 8,630 > 7,940 tokens a message | fails | fails | c (Lab) | for the Lab's owner |
| unit:directorfrugal-test | "add a camera move: 19,352 → 7,384 input tokens (budget 7,300)" | fails | fails | c (Lab) | for the Lab's owner |
| unit:scene-recording-test | `2 !== 1` (line 18) | fails | fails | c (Codex) | Codex's test of the sandbox's recorder: for Codex |

**No check relied on the idle wait** (class a: none). Every app check that failed under the faster harness fails the same
with round 173's 30 s wait, and every other app check (qa, core, the 13 lightening checks, and round 174's own runs)
passed with it. Worth knowing for later: checks that need "the start's one-off work done" already wait for it
themselves (perf151: `performance.now() > 60000`; idlecpu / mem154 their own settles), which is why none leaned on the
harness.

Not run this round: the Lab-heavy groups (lab, modelcompile101, labproj97…: the Lab's owner is changing them) and the
long journeys.

## 2. First-screen CSS: 383 → 364 KB

| | Before (round 174) | After |
|---|---:|---:|
| First-screen CSS (boot-test, with comments) | 383 KB | **364 KB** (−19 KB, −5 %) |
| First-screen stylesheets | 20 | 20 |
| Budget (`dev/boot-test.js`) | 385 KB | **375 KB** (364 + 3 %) |

### What moved

The rule is css159's: a rule moves out of a first-screen sheet only when every one of its selectors needs a class / id
that only some lazy group's code can write, so it can't match before that code runs; it loads with that code, right
after the sheet it came from (lazy-data.js `CSS_AFTER`, lazy.js `cssAfter`: same place in the cascade; a page without
that sheet, like the Lab window, never loads it). css159's guard against a rule that stays later in the sheet and could
now lose or win differently is unchanged.

`dev/css159-dead.js --movable` found only 5 KB more that way: most names lazy UI uses are written by more than one
group. Three additions to the tool (all opt-in flags):

- **The group they all load first.** A name written by files of several groups belongs to the group every one of them
  has in its `after` chain (loading a group loads its `after` groups and their sheets first; a group whose `after` group
  is switched off in Trim Hearth goes off with it — lazy-data.js' order-only `SOFT` pairs are left out of the chain).
  E.g. `.up-dlg` (updater.js, firstrun-core.js; firstrun is `after: updater`) → `updater`.
- **`--shared n`**: otherwise, a sheet up to n groups list (each with the same `cssAfter`); lazy.js never loads a sheet
  twice, so it comes in with whichever group loads first. The "a later rule could style the same element" guard then
  counts any of those groups' files.
- **`--join`**: pieces of one sheet bound for overlapping groups go in one sheet listed by all of them (a sheet loaded by
  more groups than need it is harmless: its rules can't match before their code runs) and keep their order.
- `--skip-under lab`: no owner that loads the Lab first; the Lab's own rules stay where they are.

Run: `node dev/css159-dead.js --movable --shared 6 --min-kb 0.3 --skip-under lab --round '175, sweep175' --join … --move --names …`

| New sheet | From | Loaded with | Rules | Size |
|---|---|---|---:|---:|
| meter-dash.css | meter.css | meterdash (the token dashboard) or options (memorytidy.js writes `mt-head` / `mt-row` / `mt-list` and `mt-${kind}` too) | 70 | 6.9 KB |
| addons-notes.css | addons.css | addons, gamemode, projtemplates or quickidea (the notes / prompts / memory lists) | 17 | 1.6 KB |
| polish-kit.css | polish.css | kit | 16 | 1.3 KB |
| chatcore-chatkit.css | chatcore.css | chatkit | 10 | 1.1 KB |
| chatcore-updater.css | chatcore.css | updater (the update button and dialog; firstrun loads it first) | 11 | 1.0 KB |
| bigscreen-on.css | bigscreen.css | bigscreen | 9 | 1.0 KB |
| polish-keyssheet.css | polish.css | keyssheet | 6 | 0.9 KB |
| makes-pgbar.css | makes.css | progressui or renders (the progress bars' base rules; progressui lists it before makes-progressui.css, their old order) | 5 | 0.9 KB |
| polish8-drop.css | polish8.css | board or chatattach (a board reference dragged over the chat box) | 3 | 0.8 KB |
| forge-skin-juice.css | forge-skin.css | juice (the click sparks) | 5 | 0.7 KB |
| director-chips.css | director.css | assist or directortask | 4 | 0.6 KB |

And one split by hand: **apps-window.css** (4.9 KB, 35 rules): apps.css held the app window's own chrome (`body.aw`,
`.aw-*`: classes only apps-window.html / apps-window.js write) next to the hub's card pickers. The app window now links
apps-window.css (the same rules, same order, the round-30 Chrome offer last as before); index.html's apps.css keeps the
hub's part (1.8 KB). The hub's rules never matched in the app window (its scripts don't make them) and the window's
never in the hub.

Where two moved sheets sit after the same eager sheet, their order depends on which group loads first. Checked by hand:
no pair of them styles a shared class (`pg-bar` base vs makes-progressui's states differ in specificity everywhere and
are listed base-first; polish8-board / -capture / -drop have no class in common; director-directordock's `.dd-chips` vs
director-chips' `.dd-chip`).

### Zero visual change

`node dev/css159-diff.js shoot` on round 174's copy and on this round, then `compare` (31 views + the final picture),
two shoots of each build (round 174's copy twice: the noise floor; this round twice).

- **Computed styles: identical** on every element in 22 of the 32 views both times (start, chats, the "/" menu, the
  message menu, the three looks, Settings in four positions, the palette, the keys sheet, the command bar, the Alt
  hints, the four dialogs, Forgeheart). What differs follows the run, not CSS: Trim Hearth's rows (their KB column: the
  groups that took sheets weigh ≈ 1 KB more), the progress fills (`i.fb-fill`, also between two runs of round 174), the
  Lab's state (as round 159 found), and the box's own slowness: in two of the four runs Jank recorded a ≥ 1 s hiccup
  after the start, which puts the slow dot on the rail's ⋯ (`#rail-more[data-slow]`) and, in the Lab, Lite's "Things are
  slow" toast; a probe of the first 20 s (2 launches of each build) saw that hiccup on both builds. One run of this
  round also caught the composer's five elements in another state in views 01–05 (not in the second run).
- **Pixels:** the reply's clock (the time of the run), the slow dot and the Lite toast above; no other UI pixel.
- A direct probe of the composer's elements 4 s after start (every computed property, both builds): **0** differences,
  and the same sheets in the same order apart from the new ones, each right after its old sheet.

### Not done, and why

- Dropping CSS comments (≈ 48 KB of the first screen's sheets are notes for people): no runtime gain worth the lost notes.
- The ≈ 56 KB of rules with no class or id (`:root` variables, `html[data-skin~=forge] …`, element rules) and the
  per-look rules in look.css (round 159's note): first-screen by nature or a design change.
- Lab-owned names (`stage-`, `three-`, `lab-`, the Lab's dialogs): `--skip-under lab` kept them in place (≈ 4 KB more
  would move with the Lab's group).

## For the Lab's owner

- unit:promptdiet-test: Three Director (full) 8,630 tokens a message, budget 7,940. unit:directorfrugal-test: "add a
  camera move" 7,384 input tokens, budget 7,300. Both fail on round 173 too.
- unit:storeack-scan: `labtxn-replies` (tools/three-txn.js:298), `three-blocks` (three-blocks.js:70), `three-versions-trash`
  (three-versions.js:203, 218) are written and synced with no `StoreAck.hold`.
- unit:datasafe-scan / datasafe-test / emptyread104-test: tools/three-txn.js reads `labtxn-replies` with a fallback and
  saves it without DataSafe.load / save.
- unit:chatsafe-scan: tools/three-critique.js:144/147, three-explain.js:145/148 set `S.agentId`.
- unit:errorcalm-scan: raw errors shown at tools/three-lab-tools.js:140 and tools/three-labwin.js.
- unit:chatwin-scan: tools/three-labwin.js, three-refmatch.js, three-replydiff.js read `.messages` and aren't in its AUDIT.
- perf151 "readouts": while a scene plays, the Lab's live readouts wake usage.js' decorate pass 0.4 times a second
  (≤ 0.2); same on round 173.
- First-screen CSS: the Lab's rules in features.css / polish.css / look.css (`.stage-pill`, `.three-toolbar`,
  `.lab-tabs`, `.layers .ly-*`, Lab dialogs) could load with the lab group (`node dev/css159-dead.js --movable --shared 6`
  without `--skip-under lab` lists them) when the Lab work settles.

## For Codex

- unit:scene-recording-test fails (`2 !== 1` at dev/scene-recording-test.js:18), on round 173 too.

## Checks

`flock /tmp/hearth-run.lock timeout 2900 node dev/run-checks.js --exact unit:boot-test unit:lazymanifest-test fastboot
playfix audit174 restyle172 chatcore settingscalm` + the checks this round changed or whose CSS moved (`unit:projperf120-test
unit:chatwin-scan unit:datasafe-scan unit:winmac49-test unit:errorcalm-scan unit:lazy-groups-test lazy trim153
apps-windows bigscreen updater`): **16 / 19 passed** in 8 min. The three that fail are only the Lab's remaining findings
listed above (chatwin-scan: three-labwin / three-refmatch / three-replydiff; datasafe-scan: three-txn.js; errorcalm-scan:
three-lab-tools.js, three-labwin.js); the parts of them this round owns pass. bigscreen left `/tmp/hearth-bigscreen`
(4 MB), as before this round.

`node dev/whatsnew-test.js`: 49 passed. `node dev/lazy-manifest.js --check` (in lazymanifest-test) and
`node dev/trim-weights.js --check`: up to date.

Merges: origin/main and origin/claude/intelligent-galileo-yaiqem fetched: both already in this branch (nothing new).
