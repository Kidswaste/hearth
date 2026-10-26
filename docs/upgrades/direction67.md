# Round 67, stream 2: ✦ Direction (Try 4 ways, Mark it up, plain sliders, vision card, branches)

Plan: `docs/upgrades/round67-plan.md`. Built for the problem "it's hard to describe what I have in mind; once I've gone
in a direction it's either a hard reset or deepening until the idea debt burns me out". Choosing between options beats
describing one, pointing beats rewriting a prompt, and branches beat resets.

## Where to click

The Lab toolbar has a new chip, **✦ Direction**, right after the scene picker (and ⚑ Finish line). It opens a card
over the top left of the preview (Esc or ✕ closes it):

- **✦ Try 4 ways**: type the idea in a few words (optional) → **Try 4 ways**. Four crew helpers each make one rough
  take on their own copy, each on a really different angle: colour and light · motion · form · texture. The crew panel
  shows the cost first; press **Start 4 helpers**. Pick a take in the crew panel as before.
  Once two or more takes exist, the card shows **Keep #a with its light / colours / motion / shapes / camera / texture
  from #b → Ask the director**: the director reads what #b changed and brings in only that part.
- **◯ Mark it up**: freezes the picture over the preview. Drag to circle a part; choose **More of this** (green) or
  **Wrong** (red), add a few words if you like. **Send to the director** sends the marked picture and the marks in words
  to the scene's director chat. Cancel / Esc leaves without sending.
- **Plain sliders**: **Calmer ↔ Busier**, **Colder ↔ Warmer**, **Softer ↔ Harsher** over the scene's own named
  sliders and its palette. Dragging previews; letting go keeps it (one undo step per layer, a time machine version).
  **Back to the middle** returns to how the scene was when you opened the card.
- **Vision card**: **Add this frame** (up to 3 pictures of how it should look), a few words, and one "It should feel
  like…" sentence. It is kept with the scene (Lab extras, key `direction`). Every new version's picture is measured
  against it; the chip turns orange ("drifting a little" / "drifting away") before drift piles up.
  **Send the vision to the director** gives the frames and words to the director. Try 4 ways adds the sentence to
  the helpers' brief.
- **⑂ Branches**: in the ⏱ time machine, go back to any version and keep working: that now starts a *branch in the
  same scene* (nothing is thrown away). The strip marks where a branch starts with ⑂; the card lists each branch's
  newest version with **Go there**.

## How it works

- `tools/three-direction-core.js` (`DirCore`, pure, tested in Node): the four angles, the rough brief, the combine
  request, `plain()` (busier = motion and count-like values ×2.3 at most, calmer ×0.43; harsher = contrast / bloom /
  glow / grain up and blur / soft / fog down; warmer / colder = colours toward orange / teal-blue by up to 50°, greys
  stay), the marks in words, the drift score (distance to the closest vision frame, 0–100: < 25 on track, < 45
  drifting a little).
- `tools/three-direction.js` (`LabDirection`): the chip, the card, the mark-up layer. Try 4 ways is
  `ThreeCrew.plan(chat, { n: 4, brief, angles })`; the crew's approval and budgets are unchanged. Drift is measured
  with `BoardVibe.fromPixels` / `distance` on the time machine's thumbnail (`hearth:tm-thumb`), only for scenes with a
  vision card. Nothing runs on a timer.
- Time machine branches: a version records `p`, the version it grew from (`TMCore.add(…, { p })`). The recorder keeps
  the version on screen per scene (`heads`); a restore grows from the version it went back to (`apply(…, { from })`).
  `TMCore.parentOf / tips / lineOf`; `ThreeHistory.branches(id)`. Versions without `p` (older ones) grew from the one
  before in time, so old histories read as one line; a parent removed by thinning falls back the same way. `p` is one
  more field, so syncing histories still merges by id.
- Lazy group `labdirection` (after `lab`).

## Tests

- `node dev/direction-test.js`: the core and the branch logic.
- `node dev/smoke.js --script dev/checks/direction67.js` (Windows: `ELECTRON` = `electron\electron.exe`): passed in a
  throwaway copy, no page errors. Chip, card, plain sliders change and restore four named sliders, Mark it up
  (circle → Wrong → red, Send button), two branches with Go there and the ⑂ start, a vision frame with its measured
  look and a drift word, Try 4 ways opening the crew's plan with the 4 angles (cancelled, no engine run).
- `node dev/timemachine-test.js` and `dev/checks/crew.js` still pass.

## Not verified live

- No real director reply to a mark-up, a combine request or a vision: how well a model acts on them isn't measured.
- A real crew run of Try 4 ways (the plan is tested; helpers are the existing crew).
- Plain sliders move **named** sliders only (`tweak()` controls, as 🎲 Variations): numbers the Lab merely detects
  in the code have no handle. On a scene without named sliders the card says to ask the director to add some.
- The 3D gizmo's picked object still isn't part of what the director gets.
