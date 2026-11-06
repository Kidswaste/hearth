# What did the AI change? Review a reply, keep or undo per layer (round 137, replydiff137)

Under each director reply that changed a Lab scene there is now one folded line, **"Changed 3 layers · Review"**. Open
it to see what changed, layer by layer, in plain words, and take back just one layer. It works the same for Claude and
Astra replies.

## What existed (and what this builds on)
- **LabTxn** (`tools/three-txn.js`, round 73): takes a snapshot of the scene before and after every AI tool call. One
  reply is one undo step: the dock's ↶, Alt+Shift+Z and `/undo-edit` take back the whole reply. `LabTxn.step` (round
  130) records any other change as one undo step too. It also had `describe()` (one line of what a call changed, sent
  back to the AI). It kept no per-reply record after the fact, and offered nothing per layer.
- **aiundo / undoall** (rounds 28, 41): one timeline of everything AIs changed. Each reply gets **↶ Undo what it did** in
  its actions, plus Activity › Changes by AIs. For the Lab, each entry goes through the time machine's versions. You
  could undo a whole reply or a whole change, not one layer of it.
- **Lab history** (Sketch ▾ › History): the selected layer's code versions and the deleted sketches.
- **🕘 Scene versions** (versions132): named and automatic versions. One is made automatically "Before Claude's
  reply", with a picture. **Compare** shows a one-line diff ("1 slider changed, 1 layer added (Glow ring)"), and
  **Take only…** brings one layer back from a version. All of this works per version, not per reply.
- **◧ Before / after** (abcompare): two states, held or split, against the last change.
- **The reply's tool-call list** (native.js `toolFold`): "⚙ 3 steps · three", which folds open to show the tool names.
  It names the tools, not what they changed.

So the snapshots (LabTxn), the one-step undo (`LabTxn.step`), the pictures (the time machine's) and the reply's undo
already existed. This round reuses them: no new snapshot store, no new undo stack and no new history.

## What's new, and where the owner clicks
- **Under the reply**: a small grey line, **▸ Changed 3 layers · Review** (folded). It shows only on replies that
  changed a scene, and there is no new toolbar row.
- **Opened**:
  - At the top, **Keep all** closes the review. **↶ Undo all** takes back the whole reply. While nothing else has
    changed the scene since, this is the reply's own undo step (`LabTxn.undoTurn`, the same as the dock's ↶). After
    other changes, it takes back every change of the reply in one step and leaves the later changes alone.
  - A **Before / After** picture pair, from the time machine's pictures, when it has them. There is one pair per scene
    (see "Not done").
  - **A row per changed layer**, in plain words: "Glow ring: amount 0.6 → 0.9", "New layer: Bass particles",
    "Orb: code: 2 lines changed". Keyframes, material, opacity and other settings are named too, and so are
    "new keyframes on Drop (opacity)" when the keys sit on a cue. Scene-wide changes (palette, cues, timeline length,
    order) are a "Scene: …" row.
  - **↶ Undo this layer** on each row takes back just that layer's change. A new layer goes away, a removed layer comes
    back where it was, and a changed layer goes back exactly to its earlier code, settings and slider values. The rest
    of the reply stays. This is **one undo step**: the dock's ↶ (Alt+Shift+Z, `/undo-edit`) puts it back. The row then
    shows "undone". If you put it back with ↶, the row shows as a change again.
  - A code change has a folded **Show the code change**: the changed lines with three lines of context, added lines
    green and removed lines red.
- **Sliders only**: when a reply only moved sliders, **Keep some…** lists one tick per slider move ("Orb: size 1 → 2"),
  all ticked to start with. **Keep the ticked ones** puts the unticked ones back, as one undo step.
- After a restart, the newest 10 replies keep their review for 2 weeks (kv `labtxn-replies`). An older reply's line says
  the review isn't kept any more and points to Activity › Changes by AIs.

## How it works
- `tools/three-txn.js` (marked): when a reply ends (`Native.hooks.finish`), the reply's LabTxn steps for each scene are
  joined (the first one's before, the last one's after). They are kept in kv `labtxn-replies` (the newest 10, 2 weeks),
  and the message gets `labDiff: { id, layers, scenes }`. New exports: `LabTxn.reply(id)` and `LabTxn.isTop(key)`.
  Nothing extra runs while a reply is running.
- `tools/three-replydiff-core.js` (new, pure, loads in Node, `ReplyDiffCore`): `rows` (the plain words per layer, and
  whether the reply only moved sliders), `revertLayer`, `revertScene`, `revertSliders`, `revertAll` (each builds the
  scene as it is now with just that change taken back), and `lineDiff`.
- `tools/three-replydiff.js` (new, `ReplyDiff`): draws the line under replies (`Native.hooks.message`) and builds the
  review only when it is opened. Each undo uses `LabTxn.restore`, then `LabTxn.step` once the scene has settled, so it
  is one ordinary undo step.
- `tools/three-replydiff.css` (new).
- `lazy-data.js`: a new **replydiff** group (tier soon, ≈ 20 KB, needs nothing else; the Lab loads only when a review
  opens). Also `index.html` (its lazy-at line) and `docs/lazy-groups.md`. The generated manifest is unchanged, because
  the group registers no commands.
- `dev/run-checks.js`: the `replydiff137` group. `HANDOFF.md`: one line.
- No new MCP tool, and no prompt change: the AIs see nothing new.

## Not done
- The before / after picture pair is per scene, not per layer. A picture of one layer alone would need a backstage stage
  for each layer, two for each row. The scene's pair comes for free from the time machine.
- Undoing one layer doesn't mark the matching entry in Activity › Changes by AIs as undone. That timeline still offers
  its own whole-reply undo.

## Tests
One check, `dev/checks/replydiff137.js` (group `replydiff137`), runs through the fake engine with real Lab MCP calls, on
its own temp data:
1. One Claude reply changes 3 layers (a slider on Glow ring, a new layer Bass particles, a code edit on the main layer).
   The reply has the folded line "Changed 3 layers · Review", and nothing is built until it is opened.
2. Opened, it shows the three rows in plain words, Keep all and Undo all, no Keep some, and the code change folded with
   its 2 added lines.
3. ↶ Undo this layer on Glow ring: that layer and its slider values are exactly as before the reply. The other two
   layers stay exactly as the reply left them, and it is one undo step: one `/undo-edit` gives back the reply's state
   exactly.
4. ↶ Undo all, after a new layer was already undone too, makes the scene exactly as it was before the reply. One Undo
   reverses that. Then, as the reply's own undo, Undo all again gives exactly the state from before.
5. An **Astra** reply that only moves 2 sliders: "Changed 1 layer", "What Astra changed", and Keep some… with 2 ticks.
   Unticking one puts that slider back and keeps the other, as one undo step that one Undo reverses exactly.

Run: `export HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, then
`flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact replydiff137 labchat92 versions132 draft129 takes130 unit:boot-test`.
All 6 passed, and so did `node dev/boot-test.js` (first screen 62 scripts / 1585 KB, budget 62 / 1586 KB, unchanged).

## For the patch notes
- **What did the AI change?** Under a director reply that changed your scene there's now a small "Changed 3 layers ·
  Review" line. Open it to see each changed layer in plain words, like "Glow ring: amount 0.6 → 0.9" or "New layer: Bass
  particles", with a before / after picture.
- **Undo just one layer.** "↶ Undo this layer" takes back only that layer's change and keeps the rest of the reply. If
  you change your mind, ↶ in the dock puts it back.
- **Keep all / Undo all** at the top. A code change shows its lines when you ask ("Show the code change").
- **Keep some sliders.** When the AI only moved sliders, tick the moves you like and the others go back.
- The same works for Claude and Astra.

## For Codex
No Codex-owned files were changed (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch are untouched). Astra replies get the review through `native.js`'s shared hooks and LabTxn,
so nothing engine-side is needed. The new kv `labtxn-replies` is a plain kv store like aiundo's. It can be dropped at any time: a missing record only
means "isn't kept any more".
