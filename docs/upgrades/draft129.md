# Build a first draft from the brief (round 129, draft129)

The owner asked: build a first draft from the project brief. Round 128 gave a project a brief (aiprep128): mood, palette,
a tempo plan per song section, 3–6 first steps. Now the plan card can ask the director to build those first steps in one
go, show how far it has got, and take the whole draft back in one click.

## What it does, and where the owner clicks

On the **plan card** at the top of a project's Lab chat (or a Three Director chat in the project), under the brief:

- **✦ Build a first draft** and a small **"all N steps / up to step N"** choice. It runs only on that click, never by
  itself. It builds the brief's steps up to the one picked that aren't ticked yet.
- **One line with the estimated cost** before it runs, e.g. "About 86k tokens in (most re-read from the cache) and 6k out
  · Claude · sonnet". The base is the chat's real per-message cost: director-cost's measure of its prompt and tool lists
  (`hub.directorCost`, mcp/cost.js), or the chat's last reply's input if that's bigger. `ProjectBriefCore.draftCost`
  turns it into the run's estimate: about 3 model round trips a step plus 2, each one re-reading that base plus the tool
  results so far.
- **While it builds:** "Building step 2 of 5…" and **Stop**. Stop is the engine's own stop. What already landed stays,
  is ticked, and is still undoable.
- **When it ends:** "✦ Draft built by Claude: 5 of 5 steps ticked." (or "Stopped: 2 of 5 steps landed (kept).") with
  **↶ Undo the draft** and **Keep it**. If the draft changed one of the owner's layers anyway, the card names it.

What the director does: it gets ONE message (the owner's own message in the chat, so it costs no prompt budget) with the
mood, look, palette, tempo plan and the steps to build. For each step it adds new layers in the palette's colors
(`three_do add_layer`), keys them to the song's sections where the tempo plan says (`keyframes`, `timeline_edit` cues,
`media_info` for the times), and uses looks and materials where a step asks. It is told the names of the layers already
in the scene and to leave them alone unless a step names them. After each step it ticks it with
`three_do {"cmd": "brief", "done": N}` (`three_brief {"done": N}` in full mode). The card's checklist ticks as it lands.
It ends with one `three_screenshot` and checks the look against the brief.

Claude or Astra: whichever AI the project's chat uses. Nothing engine-specific: the message goes through `Native.send`,
and Stop goes through `hub.stop`.

### Safe to undo: one step

- Before the run starts, the scene is noted with `LabTxn.snap` (tools/three-txn.js): its layers, slider values,
  references, timeline, palette, cues and markers.
- The draft is one director reply, so LabTxn already makes it **one undo step**. The dock's ↶ (Alt+Shift+Z,
  /undo-edit) takes the whole draft back, and ↷ redoes it.
- **↶ Undo the draft** first uses that same step (`LabTxn.undoTurn`, so ↷ still works). If anything is left over (a
  reference the draft added, or a call outside the reply's step), it then puts back the checkpoint itself
  (`LabTxn.restore`). The result is the scene exactly as it was, by LabTxn's own signature. The ticks go back to what
  they were before the draft.
- If the scene changed after the draft (the owner or another chat), it asks first, because those later changes would
  go too.
- The checkpoint is kept in the window. After a restart, the dock's ↶, the Lab's history and the AI undo list
  (aiundo, undoall) still have the reply.

## ProjectBrief.seed (for next129)

`ProjectBrief.seed(projectId, { look, steps, mood?, palette? })` → `Promise<brief>` stores a brief without running the AI.
next129 calls it when a new project starts from a saved template. It also takes optional `tempo`, `risks` and
`questions`. The brief is:
- marked `by: 'template'`, with no step done;
- normalised the same way as ✎ Edit the brief (`toText` → `fromText`; at least one step);
- stored with the inputs' fingerprints taken now, so `stale()` works;
- synced like any brief, and shown on the plan card. Its compact form goes to the director.

The project's "Let the AI look at the moodboard" consent is kept as it was.

Also fixed on the way: a plan card in a chat view that the repaint loop didn't reach (the project's own chat surface
keeps a view per agent too) stayed stale, e.g. a "Preparing…" offer after the brief was ready. Every card in a chat is
now repainted when its key changes.

## Files

- `projectbrief-draft.js` (new, `BriefDraft`, lazy group `projectbrief`): run / stop / undo / tick, the card's row, the
  cost line.
- `projectbrief-core.js`: `draftSteps`, `draftMessage`, `draftCost`, `draftLine` (pure).
- `projectbrief.js`: `seed()`. The card adds the draft row (outside the fold, so progress shows when the card is folded), its key
  includes the draft's state, `three_brief {done: N}` ticks a step, and `ProjectBrief._` exposes `set`, `project`,
  `projectOfChat`, `agentOf` and `paint`.
- `projectbrief.css`: the row.
- `lazy-data.js`: the file and the `BriefDraft` global in the `projectbrief` group, with the manifest regenerated.
  `docs/lazy-groups.md`.
- `dev/fake-common.js`: `draftPlan`. The fake director builds a "Draft N" layer per step in the palette's colors, keys
  its opacity, ticks it, and takes one screenshot. "draft-slow" in a step adds a pause, so a check can press Stop.
- `dev/checks/draft129.js` and the `draft129` group in `dev/run-checks.js`.

No prompt budget changed. The `three_brief` schema and the `three_do` description are as they were (the `done` argument
is named only in the draft's own message), and the guide is untouched. The first screen is unchanged: one more file in
an existing lazy group.

## Tests

One app check, **dev/checks/draft129.js** (group `draft129`, `--fake-engines`), all on the card by clicks, in the check's
own temp data:
1. **Nothing runs without the click:** a project with an owner's layer, a brief from the fake engine, the card and its
   cost line (tokens · Claude). No message is sent, and the scene and ticks don't change.
2. **The draft run:** Claude, all 4 steps. The 4 steps' layers are built in the palette's colors, every step is ticked,
   "Building step N of 4…" is shown, the owner's layer is untouched, and it is one message ending in a screenshot.
   **↶ Undo the draft** puts the scene back exactly (LabTxn's signature), and the ticks go back.
3. **Stop:** "up to step 3", with a slow director. Stop after step 1 lands: "Building step 2 of 3…" was shown, what
   landed is kept and ticked, and nothing past it is built. Undo restores it exactly.
4. **`ProjectBrief.seed`:** one assertion. A template brief is stored (`by: 'template'`, no step done, not stale) and the
   card shows it.
5. **Astra:** a project directed by Astra, "up to step 1". Its cost line names Astra, step 1 is built and ticked, and
   one Undo restores the scene exactly.

Run: draft129 (the check, labchat92, unit:aiprep128-test, unit:promptdiet-test, unit:boot-test), and
`node dev/boot-test.js`.

## For the patch notes

- **Let the AI build a first draft from your plan.** On a project's plan card, click **✦ Build a first draft**. The
  director works through the plan's first steps in one go: new layers in your palette, timed to the parts of your song.
  Each step is ticked off as it lands, and at the end it takes a look at the result.
- Pick **up to step N** if you only want the first few. Before you click, the card shows roughly how many tokens it will
  use and which AI and model will do it.
- While it builds you see "Building step 2 of 5…" and a **Stop** button. Stop keeps what's already built.
- **↶ Undo the draft** takes the whole draft back in one click, so the scene is exactly as it was before. The usual ↶ in
  the dock does too. Your own layers are left alone.
- Works with Claude and Astra, whichever directs the project.

## For Codex

No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. The draft uses only their public calls:
- `Projects.get` and `projectOfChat`;
- `ProjectWorkspace.open` and `currentChat`, through `ProjectBrief.open`. The check also uses `ProjectWorkspace.create`.

It sends through `Native.send(agentId, text, { chatId })` and stops with `hub.stop(chatId)`, so an Astra director
(Codex) runs the draft the same way as any message. The draft's ticks go into the synced `project-briefs` store
(`done`), the same as the card's checkboxes.
