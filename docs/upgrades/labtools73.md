# labtools73: every Lab tool works backstage, whole or not at all (round 73)

Round 72 (labbridge72) gave every chat its own Lab scene, on screen or backstage, but left gaps: a 3D model couldn't be
added to a scene that wasn't on screen, and materials, physics, keyframes, the timeline and contact sheets answered
"needs the scene on screen". A tool that failed half-way (a three_do batch whose 3rd op failed, a camera move whose
2nd keyframe failed) left half its work in the scene, and each of an AI's calls was its own undo step.

## What changed for the owner
### Lab tools backstage (a chat's scene that isn't the one on screen)
1. **3D models**: `three_do model` add / replace / remove (remove_layer) / material / look / light / ground / fx / clip
   / turntable / explode / react / fit / lite work on the chat's own scene; the model file goes into THAT scene's
   references (no switch to it). A sky (.hdr) and Mixamo clips (clipfile) too. Only the move / rotate / scale handles
   (gizmo) are on-screen (they're for your hands; the AI is told to use `set {x, z, turn…}`).
2. **Lights and cameras**: model light presets, camera moves (orbit, dolly, crane, hero… as keyframes + a 🎥 cue) work
   backstage with the same keys and cue as on screen.
3. **◉ Materials**: `three_do material` set / off / info (chrome, glass, gold…) on any 3D layer or one part, backstage.
4. **Physics**: add / set / body / react, and now a live kick / drop / reset (`poke`) and the live `info` (sim time,
   awake bodies) backstage too.
5. **Keyframes** (layer properties and sliders) and **animation presets** (fade in, pop in, pulse…) backstage; the
   scene's own timeline is made / lengthened as on screen.
6. **The timeline**: `three_timeline` reads it; `timeline_edit` adds / removes cues and markers, shows lanes and sets
   the scene timeline's length backstage (grid, loop, zoom and speed are how the Lab on screen plays: said in words).
7. **Capture a frame**: `three_screenshot at: <seconds>` gives the frame at that time backstage (the backstage page now
   runs the scene's own timeline, silently), and `contact_sheet` makes the numbered sheet there too.
8. **References backstage**: models, pictures and videos now draw backstage (the stage loads the scene's references),
   and `references remove` / `palette {colors}` work there.
9. **Play-test and looks**: `three_do input` (play-testing) works backstage; `looks list` too.
10. **Backstage frames match**: keyframes, slider keyframes, ◉ looks, time ranges and camera moves are sent to the
    backstage page exactly as the Lab on screen sends them, so a backstage screenshot shows what you'd see.

### Results in plain words, a picture on request
11. **"applied:" line**: a call that changed the scene answers what it changed, e.g. `applied: added layer "🧊 duck";
    reference "duck" added` or `"Base": keyframes opacity (2), lane opacity shown; cue "Hit" at 1 s`. The same words
    on screen and backstage (both come from the scene's data). Calls whose answer already says it (edit_code,
    set_code, add_layer, update_layer, sliders, undo) don't repeat it.
12. **`shot: true` on any Lab call** adds a fresh small picture of the chat's scene (on screen or backstage) when the
    call didn't send one (named in three_do's one-line description; the lean tool list stays within its budget).

### Whole or not at all, one undo per reply
13. **A failed call never leaves a half-applied scene**: if a Lab call (a model add, a camera move, a physics preset, a
    material…) fails after changing part of the scene, the scene goes back to how it was before the call — layers,
    slider values, keyframes, looks, references it added, the timeline length, cues and markers — and the AI is told
    "Nothing was left half-done: the scene is back as it was before this call."
14. **A batch is one transaction**: a `three_do batch` whose op fails is put back as a whole (it used to keep the ops
    before the failure).
15. **One undo step per AI reply**: everything Claude or Astra changed in one reply on a scene is one step for the
    docked chat's ↶ (also Alt+Shift+Z, `/undo-edit`); ↷ / `/redo-edit` puts it back. The toast says "Undid what Claude
    did in one reply to "Orb" (12 calls)". A change by you or another chat in between starts a new step, and an undo
    after you changed the scene asks first ("Undo anyway"). Files it added stay in References (a redo needs them).

### Faster backstage
16. **Backstage answers at the first new frame** (+ 220 ms for console lines), like the Lab on screen, instead of a
    fixed 1.25 s per edit; the chat row's still is taken after the answer has gone instead of before.

Upgrades: 16.

## Measured (dev/checks/labtools73.js, fake engines, real MCP calls, SwiftShader, loaded 4-CPU box)
The same 17-call reply on screen vs backstage (sum of call times, HubBridge log):

LATENCY_TABLE

Before this round, the backstage calls in this reply failed ("needs this scene on screen") from the model add onward.

## Checks
- `dev/checks/labtools73.js` (group `labtools73`): a plain Claude chat and a plain Astra chat each run the same reply of
  real MCP calls (model add · material · light · camera move · ◉ look with `shot: true` · physics preset · keyframes on a
  property and a slider · animation preset · a cue and a lane · a second model added and removed · replace · a frame at
  1 s · contact sheet · a physics kick · layers) on a scene on screen and on an identical scene backstage. Checks: no
  call failed; the four scenes end the same (layers, code shape, slider values, keyframes, looks, lanes, timeline,
  cues, references); every call's "applied:" words are the same on screen and backstage; `shot: true` sent a picture;
  one ↶ takes the whole reply back and ↷ puts it back (each of the four); a batch whose 2nd op fails and a camera move
  whose 2nd keyframe call fails leave the scene exactly as before and say so; backstage ≤ 1.5× on screen.
- Run with: `flock /tmp/hearth-run.lock node dev/run-checks.js labtools73` (HEARTH_THREE_DIR for three.js).

## Files
New: `tools/three-txn.js` (LabTxn: transactions, plain-words results, `shot`, one undo per reply; lazy group `lab`),
`dev/checks/labtools73.js`. Changed: `tools/three-backstage.js` (references, the scene clock, keyframes / presets /
timeline / looks / input / contact sheet, same layer data as on screen, settle at first frame, stills after the
answer, timing stats), `bridge.js` (setAround: every three_ call through LabTxn; a batch that stops is `partial`),
`tools/three-director.js` (undo / redo of a whole reply, forget; awaits a preset), `director-dock.js` /
`director-cmds.js` (toast and /undo-edit words), `tools/three-models.js` (models, skies, clips into the chat's scene),
`tools/three-materials.js` (looks backstage), `tools/three-physics.js` (kick / info backstage), `tools/three-media.js`
(mapAt / editMapAt: another scene's cues and markers), `tools/three-tweaks.js` (labelOf exported), `tools/three.js`
(ThreeLab.removeReference), `mcp/three-mcp.js` (three_do: `shot: true adds a picture`, two shorter phrases to stay at
199 / 200 tokens), `lazy-data.js`, `dev/run-checks.js`. Not touched: three-direction*, collab-eyes, credits*, Swarm,
astra.js.

## Left / risks
- A rollback puts the whole scene back to its state before the call: if another chat changed the same scene while the
  call ran (two chats on one scene), that change is put back too (rare: only when a call fails).
- The very first call of an unlinked project chat (the call that links it) isn't covered by a rollback.
- Backstage, a song scene still has no music (its keyframes play on a silent clock of its length); animation presets
  that follow beats use the song's saved grid / markers (no audio analysis backstage). Grid, loop, zoom and speed
  edits, looks save / apply and a palette taken from a picture still need the scene on screen (the AI is told so).
- ♪ music links made by physics `react` are live-only on screen; backstage it sets the kick / bass sliders instead.

## For the patch notes
- **Claude and Astra can now do everything in the Lab even when you're looking at another scene**: add and replace 3D
  models, change materials and lights, move the camera, add physics, set keyframes and cues, and grab a frame at any
  time. The result is the same as if the scene were on screen.
- **No more half-finished changes**: if something an AI tries in the Lab fails partway, the scene goes back to exactly
  how it was, and the AI is told.
- **One undo per AI reply**: the ↶ button in the docked chat takes back everything the AI changed in its last reply in
  one click, and ↷ puts it back.
- **Clearer answers**: after each change the AI gets one plain line saying what changed, and it can ask for a small
  picture with any change.
- **Faster in the background**: changes to a scene you're not looking at now come back as soon as they show, instead
  of waiting a fixed time.
