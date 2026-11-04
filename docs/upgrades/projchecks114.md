# projchecks114: three failing checks, two real app races behind them (round 114)

Three checks failed on the round 113 base. Each was treated the way round 113 treated its "stale" failure: find what
the app does at that moment, and only then decide whether the app or the check is wrong.

| check | what failed | cause | app or check | fix |
|---|---|---|---|---|
| `projsearch81` (`BIGPROFILE70=1`) | "Clink card: something else is under the mouse at 0,0 … timed out: Clink open" | Projects home shows the cards it drew last time, then draws them again 20–50 ms later. The check had found the old card. | **Both.** The check aimed at a card that was already gone. The same redraw also **ate a real click** when it landed between press and release (5 of 22 presses). | The check re-finds the card at the press. The app holds a Home redraw while a card is pressed. |
| `projaudit108` `start` | "the Lab group not loaded yet when the switch began": loaded | The reload put the last view (the Lab) back, and that put-back loads the Lab's code at once (`freshen.js` `putBack`). labopen112 and lab-intent weren't involved. | **Check.** Its precondition was a race it used to win. | Hold the Lab back as labload94 does: "Open on start" + `lazy.lab.mode` none. |
| `labload94` (once, in a release run) | "palette / keys: the Lab is on screen" | On the first Ctrl/⌘+K of a start, the code behind Find anything arrives while you type. For one task its rows showed **without the tools**: the Lab row was gone and another row was selected. An Enter at that moment ran that other row. | **App.** | Ctrl/⌘+K keeps its plain rows until Find anything's own rows are complete. labload94 now judges the selection while that code arrives. |

Everything ran on throwaway data: fresh profiles from `dev/smoke.js`, perfguard's made-up heavy profile
(`/tmp/hearth-bigprofile72`: 40 projects, 1,500 chats) and projopen86's fixture. No real data was read or touched,
nothing was deleted and nothing was uploaded. No store read was changed.

## 1. projsearch81: the Clink card

### What happens
`projects-home.js` `paint()` on `hearth:activate`: Home's body still holds the cards it drew the last time it was on
screen (they are shown at once), and paint awaits `Projects.ready()` / `lookFor()` before `paintHome()` replaces them all
(`replaceChildren`). Measured with a probe on the heavy profile (`.click()` on the rail's Projects, the old card
watched): the card is found 2 ms after the click and **replaced 20–50 ms after it** (round 90: replaced 5 ms after).

The check's `realClick(card)` found the old card, waited a frame, read its middle and got `0,0` (a node no longer
in the page), so it "clicked" the rail at 0,0 and Clink never opened.

### Bisect (the real check, `run-checks --exact projsearch81`, each round's own checkout)

| commit | round | result |
|---|---|---|
| `7a3f0fc` | 90 | pass |
| `63bb36f` | 93 | pass |
| `7c34383` | 94, keptaside94 merged | pass |
| **`50e3b0d`** | **94, labload94 merged** | **fail** (the card, 0,0) |
| `3e1b184` | 98 | fail |
| `3543227` | 108 | fail ×2 |
| `98f439f` | 112 | fail ×2 |

labload94 stopped loading the Lab at every start. The Lab's code (≈ 3.4 MB) used to be in before the check's first click.
Now it loads in the background around that moment, which moves Home's redraw from ≈ 5 ms to 20–50 ms after the click.
That is past the check's look-up. Round 109's suspects (DeskPaint.held, ClickWatch, the menu fade) and desk89's deferred
scroll aren't the cause: the check already failed at round 94, and the redraw timing is the same at rounds 94, 108 and 112.

### Is a real click affected? Yes, when the press straddles the redraw
A probe on the heavy profile: Projects open and settled, a real press (CDP) on Clink's card, then a project change
while the button is down (`Projects.changed`, what a sync arrival or a save does; Home is drawn again 80 ms later),
then the release 250 ms later. Result: **0 click events, the project didn't open**. The pressed card was gone at the
release, so Chromium sent the click to no card. Round 109's `DeskPaint.held` holds a Desk/Home redraw while something is
pressed, but only for `button, a, input, select, textarea, summary, [role=button]`. A project card is a focusable
`<div>`, so it wasn't covered.

### Fixes
- **App** (`desk-paint.js`, not Codex's): `held()` also holds for a pressed `.pj-card`. Home is then drawn again after
  the card's click has run (the task after the release; 1.5 s at most, as before). Same probe: **1 click, the project
  opened, `held` 1 / `ran` 1**.
- **Check** (`dev/checks/projsearch81.js`): `realClick` takes a finder as well as a node. A finder is asked again right
  before the press when the node it gave was drawn again: the owner aims at what is on screen now. The Clink card uses
  it. The `elementFromPoint` test is kept, so a cover is still caught.
- **New check part** (`dev/projopen109-menu.js`, run by `projopen109`'s `menu` part, 2 busy CPUs beside it): Projects
  home, a project change, and a real card press 0–240 ms after it (22 presses, a human's 70 ms hold). It counts whether
  each press's click reached a card. The click is stopped there, so no project opens.

### Proof
- `projsearch81`: passes (54 s), and on the 3 runs below.
- A cover over the cards, put in for the test and not committed (a transparent `div` over Home's body in
  `projects-home.js`): `projsearch81` fails with **"Clink card: something else is under the mouse at 774,584
  (TEMP-COVER)", "timed out: Clink open"**. The check still catches a real cover.
- `projopen109 --only menu` **without** the `.pj-card` hold (the selector put back as before, not committed): **5 of 22
  card presses reached nothing** (at 0, 60, 0, 20, 60 ms). **With it: 0 of 22**, and the ⋯ / row parts still 0 of 66.
  ClickWatch didn't name the card misses (it watches buttons).

## 2. projaudit108 `start`: the Lab held back

The step now says who loaded the Lab (`Lazy.by('lab')`, LabIntent's state, the view). The failing run said:
`{"lab":"loaded","by":"putBack freshen.js:182 < comeBack freshen.js:164","intent":null,"view":"tool:three"}`.
The part's session ends in Alpha's Scene, so the reload (an unasked reload) puts the Lab back
(`freshen.js` `comeBack` → `putBack` → `Lazy.load('lab')`), whatever `lazy.lab.mode` says. In round 108 the Lab was
still "loading" when the check first looked; on today's box it is "loaded" by then. That's why it also failed on
`fdd0147` and `98f439f`. labopen112's early page and lab-intent's prefetch had nothing to do with it: `intent` is null.

This is intended: a reload brings back what you were looking at. The check now holds the Lab back the way labload94
does. It sets an explicit **Open on start** (Projects) before the first restart, so an unasked reload keeps that screen
(`comeBack` returns early) instead of putting the Lab back, and keeps `lazy.lab.mode` = none. The Lab's own last scene
stays Alpha's (`three.current`), so the switch to Beta must still win over it. The second restart goes back to no
"Open on start" (the Lab put back and loading by itself), as before.

**The path works in the app:** the start (Lab held back) → Ctrl/⌘+K › "Start Beta" › Enter → ready in 2.6–3.8 s, the
Lab on Beta's scene and still there 5 s later. Then the second start, with the Lab loading by itself, lands on Alpha's
scene.

**Proof the check still catches its bug:** a Lab that puts its own last scene back late was reintroduced and not
committed (`tools/three.js`: 4 s after its code loads, `ThreeLab.scenes.open(<the three.current read at load>)`).
The step fails with **"…the Lab is on Start Beta's scene, and stays on it" ✖** (`after.scene` = Alpha's).

## 3. labload94: the Lab row that vanished for a task

### Reproduced under load
`labload94` with 3 busy CPUs beside it (`smoke.js --burn 3`) failed **1 of 4**. The view was taken by
**`ask appsearch.js:450 < runItem`**: the Enter ran "Ask Claude: Three.js Lab" instead of the Lab row (the check's new
`activate` trace names it). Two other tries (10 starts each in one app, the same Ctrl/⌘+K › "Three.js Lab" › Enter)
failed 1 of 10 and 0 of 10, so the race is narrow. In the failed start, Enter changed nothing on screen. That try's list
recording looked at the wrong list (Projects home has a `.palette-list` too; fixed in the check), so it isn't
explained. It wasn't seen again in the 7 labload94 runs after the fix, 3 of them with 3 busy CPUs.

### Why
The first Ctrl/⌘+K after a start loads Find anything's code (`appsearch`, a lazy group). Until it's in, the palette
ranks its plain rows. "Three.js Lab" puts the Lab row on top, selected, and that row starts loading the Lab
(labload94's palette intent). When the code arrives, `appui.js` gathers the rows again and draws them through it.
Since round 113 (search113), that **first** opening builds Find anything's live rows (menus, tools, AIs, projects) in
the **next** task, to keep the first Ctrl/⌘+K's task short. For that one task the list had no tool rows. The Lab row
was gone and the selection (`pal.sel`, an index) landed on whatever was first: **"Use the Three.js Lab"** (a how-to),
or "Ask Claude: …". An Enter in that task ran it.

Recorded directly (the list watched after "Three.js Lab" was typed, 6 starts, no Enter): **6 of 6** starts had a
**7–90 ms** stretch with "Use the Three.js Lab" selected, e.g. `60 ms sel Three.js Lab (plain rows)` → `405 ms sel Use
the Three.js Lab (Find anything in)` → `418 ms sel Three.js Lab`. A person who types and presses Enter at once on a
busy start hits it.

### Fix (app)
- `appsearch.js`: `ready()` is false while that first opening's live rows are still to come.
- `appui.js` `paletteRender`: draws Find anything's rows only when it is `ready()`. Until then it keeps ranking the plain
  rows. `prepare`'s `refresh()` draws the full rows when they're in. The live rows are still made in their own task,
  as round 113 wanted. One line in the first screen's `appui.js`: **1694 / 1696 KB** (was 1693).
- Same recording after the fix: **0 of 6** starts left the Lab row (`Three.js Lab` selected throughout:
  `60 plain` → `421 Find anything in` → `461 + the menus`).

### Check (labload94's palette part)
- It watches the list from the typing to the Enter. Before pressing Enter it now waits for Find anything to be in, with
  its live rows. It judges that every list drawn since the Lab row was first selected kept the Lab row selected (new
  step: **"the Lab row stays selected while Find anything comes in"**). So the check crosses the risky moment on every
  run, not once in ten.
- When the view is lost, "the Lab is on screen" names the view, each `activate()` with its caller, and the last lists
  drawn.
- Proof: with the app fix taken out (not committed), the new step fails **2 of 2 on an idle box** ("left for: 3884 sel
  Use the Three.js Lab …", "3703 sel Use the Three.js Lab …"). With it, see the runs below.

## For Codex
No Codex-owned file was changed. (A reintroduced bug for a proof sat in `tools/three.js` for one run and was taken out.
The cover sat in `projects-home.js` for one run and was taken out.) One thing for whoever owns `projects-home.js`:
Home draws every card again each time it comes on screen, even when nothing changed. The Desk has had `deskSigOf` for
that since round 74. A Home signature would remove the 20–50 ms redraw this round's fixes now live with.

## Checks
All under `flock /tmp/hearth-run.lock`, `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`.

- Each fixed check 3 times (`BIGPROFILE70=1 node dev/run-checks.js --exact projsearch81 labload94 projaudit108
  projopen109`, three runs): **4/4, 4/4, 4/4**.
  - projsearch81 took 51–53 s.
  - labload94 took 48–53 s.
  - projaudit108 (pc, fresh, start, giant) took 211–212 s. Its start's switch was ready in 2.9–4.1 s.
  - projopen109 took 234–235 s. Its card part missed 0 of 22 each run, and its ⋯ / row parts missed 0 of 66.
- labload94 3 more times with 3 busy CPUs beside it (`smoke.js --burn 3`): 3/3.
- `node dev/run-checks.js --exact projects desk89 projopen109 search113 labload94 lazy` (`BIGPROFILE70=1`): **6/6**.
- Unit, by hand:
  - `boot-test`: 3117 checks pass. First screen: 64 scripts, **1694 / 1696 KB**.
  - `appsearch-test`: 10/10.
  - `desk89-test`: 100/100.
- `node dev/run-checks.js release`: **308/311**. The other 3 are the known failures in KNOWN_FAIL (Codex's tests:
  playback-volume, quest-chat-service, questguide-flp), and 1 opt-in check was skipped. The full output has **no ✖
  line**. It took 30 min and left 0 `/tmp/hearth-*` folders.

## Files
- `desk-paint.js`: `held()` covers a pressed project card.
- `appsearch.js`: `ready()`; `appui.js`: `paletteRender` waits for it.
- `dev/checks/projsearch81.js`: `realClick` with a finder; the Clink card uses it.
- `dev/projaudit108-start.js`: the Lab held back (Open on start + `lazy.lab.mode` none) for the first restart; the step
  names who loaded the Lab.
- `dev/checks/labload94.js`: the palette part's selection judged while Find anything comes in; screen changes and lists
  named.
- `dev/projopen109-menu.js`: the card part.

## For the patch notes
- **Project cards always open.** If something changed in your projects at the very moment you clicked a project card
  (a sync landing, a save), the click could do nothing. Now the card waits for your click before it redraws.
- **Ctrl/⌘+K right after starting Hearth opens what you picked.** If you typed quickly and pressed Enter (for example
  "Three.js Lab"), the list could change for an instant and Enter ran the row below, such as "Ask Claude…". The list
  now stays put until it's complete.
