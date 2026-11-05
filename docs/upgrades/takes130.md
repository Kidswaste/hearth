# Three takes, side by side (round 130, takes130)

The owner asked: when I ask for something ("make the glow more aggressive", "try a different look for the chorus"), give
me 3 takes to compare live, then let me pick one.

## What existed (and what each does today)

- **🎲 Variations** (labvariations, `tools/three-variations*.js`): 6 takes made on this computer with 0 tokens by nudging
  the scene's slider values (colours, motion, camera, look). Pictures in a grid, hover plays one live in the preview,
  click applies it as one slider undo step. No AI, so it can't do "what I asked for", only value nudges.
- **👥 Crew** (labcrew, `tools/three-crew.js`, engines.js `options.crew`, `three_do crew`): 2–6 lean helper runs of
  the chat's AI (Claude or Astra), each on its own copy of the scene on its own hidden stage
  (`ThreeBackstage.make`), one angle each. Cost first (the helper's real fixed cost from director-cost / mcp/cost.js),
  Start, a running total, Stop, small thumbnails every 3 s, pick one (it replaces the scene), undo, keep the others as
  sketches, copy a layer across. The stages were thrown away as soon as the helpers ended, and the thumbnails were
  stills.
- **◧ Before / after** (abcompare, `tools/three-abcompare*.js`): hold B or a split view to compare the scene with how it
  was before the last change. Two states, not three takes.
- **◫ Comp / precomps** (`tools/three-comp.js`): a scene inside a scene, live. A way to build, not to compare takes.
- **Saved looks** (`three_looks`, Sliders › looks) and the **gallery** (`tools/three-gallery.js`): named slider sets on
  a layer, and starting points with pictures. Neither makes takes of an ask.

The crew is the right base: it already makes AI takes on copies, with cost first, Stop and a pick. ✦ 3 takes is a crew
of 3 with its own card, live stages and a one-step undo. Nothing is duplicated.

## What's new, and where the owner clicks

- **✦ 3 takes**, a small button just left of **Send** in a director's chat (and in any chat that works on a Lab scene,
  such as a project's chat). Type what you want ("make the glow more aggressive"), then click ✦ 3 takes instead of
  Send. **`/takes <ask>`** does the same.
- **The card opens with the plan first.** It shows the ask, the 3 ways it will be done (**A · All the way**,
  **B · Colour & light**, **C · Motion & rhythm**), the project's palette swatches when the scene belongs to a project,
  and one line with the estimated cost in round 129's words ("About 29k tokens in (most re-read from the cache) and 3k
  out · Claude · ≈ 1 min"). **Nothing runs until you click Make 3 takes** (or `/takes go`). Cancel closes it.
- **The takes follow the project.** When the scene belongs to a project, the takes' shared brief carries the
  project's palette ("stay in it") and the brief's compact form (the same ≤ 600 characters the director gets).
- **While they're made**, the three boxes show each take's stage live as it's built, each with what its helper is doing.
  **■ Stop** stops them at any time. What they made so far stays in the boxes.
- **When they're done**, the three boxes play the takes **live, side by side, in step with the song**. Each take's
  stage stays (bigger and smoother than a crew's: 480 px, 30 fps), plays the scene's song silently (`opts.song`), and is
  kept on the Lab's clock: when the scene is on screen with its song, every take follows the Lab's time and play / pause;
  otherwise they follow take A. Under each box: a one-line label of what differs (the helper's own line).
- **Click a take to keep it.** Its layers become the scene as **one undo step**: the toast's **Undo**, the dock's ↶,
  Alt+Shift+Z, `/undo-edit` or `/takes undo` put the scene back exactly. The card and the stages go.
- **Any other way out discards them**: ✕, **Discard**, Esc, or asking for new takes. The scene is untouched: it is never
  changed before the click.
- **Mix**: when two takes changed nothing but slider values, one the colours and the other the motion, the card offers
  "Mix: A's colours with take B's motion", kept the same way (one Undo). AI takes usually rewrite code, so this shows only
  sometimes; the takes' brief asks the helpers to change `tweak()` defaults where a value does the job, to make it more
  likely.
- **Engines**: the takes run on the chat's own AI, Claude or Astra, through the crew's helper runs. Nothing is
  engine-specific.

`/takes` also takes `status`, `stop`, `keep A|B|C`, `discard` and `undo`.

## Files

- `tools/three-takes-core.js` (new, pure, loads in Node): the 3 takes' angles, the brief lines, the cost line, the
  labels, the Mix plan.
- `tools/three-takes.js` (new, `LabTakes`): the button beside Send, `/takes`, the card, live stages over the boxes and
  their clock sync, keep / mix / undo / discard / stop.
- `tools/three-takes.css` (new).
- `tools/three-crew.js` (marked `round 130, takes130`): `plan()` takes `ui: false` (no crew grid), `live: true` (the
  stages stay after the helpers end, bigger and smoother, on the scene's song) and `extra` (lines added to the shared
  brief, still byte-stable for the cache). `end()` is exported, and it now also ends a crew whose helpers were still
  running (their stop events were dropped, so the crew stayed "running" and the next crew was refused).
- `tools/three-backstage.js` (marked): `opts.song` lets a stage on its own scene data play that data's song, and
  `stage.clock` says where its page's clock is.
- `tools/three-txn.js` (marked): `LabTxn.step({ before, after, … })` notes a change made outside a tool call as one
  undo step of its own (what the dock's ↶ and `/undo-edit` take back).
- `lazy-data.js`: the new **takes** group (a small 'soon' group: the button must be there when a director chat shows;
  it loads the Lab itself on first use), with the manifest regenerated; `index.html`'s lazy-at tag, `docs/lazy-groups.md`.
- `dev/checks/takes130.js` and the `takes130` group in `dev/run-checks.js`.

No prompt budget changed: nothing was added to any director prompt, tool list or guide. The takes' brief is a crew
helper's brief (≈ 120 tokens more for the ask and project lines). The first screen is unchanged (boot-test: 62 scripts,
1577 KB, budget 1586 KB).

## Tests

One app check, **dev/checks/takes130.js** (group `takes130`, `--fake-engines`), on the check's own temp data, by clicks:
1. A project with a brief and palette. The ask is typed in its chat and **✦ 3 takes** clicked: the card shows the cost
   line and three planned takes, the takes' brief has the ask and the palette, and nothing runs (no helper started, the
   scene's LabTxn signature unchanged).
2. **Make 3 takes**: 3 different takes built on copies through the fake engine's real MCP calls. The owner's scene is
   unchanged. The grid shows **3 live previews**: each take's stage is over its box, visible and running, and each draws a
   picture. Each take has its own label.
3. **Click take B**: it becomes the scene, the card and stages go, and it is one undo step. One `/undo-edit` restores the
   scene exactly (LabTxn's signature and the code).
4. **Stop** mid-run (a slow fake helper) stops every take in about half a second, and **✕** discards them: the card and
   stages are gone and the scene is untouched.
5. **Mix**, as a plan: A's colours with B's motion for two slider-only takes.

Run: `takes130` ✓ (54 s), `labchat92` ✓, `draft129` ✓, `unit:promptdiet-test` ✓, `unit:director-mcp-test` ✓,
`node dev/boot-test.js` ✓ (2894), plus `slim116-test`, `selfmap118-test` and `lazymanifest-test` ✓. The card was
checked by eye in a screenshot of the check (three live takes, labels, Discard).

## Risks / not done

- Three live stages are three more WebGL pages while the card is open (the crew already ran up to six, smaller). They go
  when you keep a take or discard them.
- References (pictures, videos) aren't loaded on a crew copy (as before for crews), so a scene built on a reference
  shows it missing in the takes. The kept take still uses it on screen.
- Keeping a take replaces the scene's layers with the take's. If you changed the scene while the takes were made, those
  changes are replaced too, though one Undo brings them back.
- The clock sync seeks a take when it drifts more than 0.2 s from the Lab, checked about every 1.6 s. It isn't
  frame-exact.

## For the patch notes

- **✦ 3 takes: three versions of what you ask for, side by side.** In a director's chat, type what you want ("make the
  glow more aggressive") and click **✦ 3 takes** next to Send, or type `/takes` and your words.
- Before anything runs, you see roughly how many tokens it will use and which AI does it. Nothing starts until you
  click **Make 3 takes**.
- The three takes do your ask three ways: all the way, through colour and light, and through motion and rhythm. If the
  scene is in a project, they stay in the project's colours and follow its plan.
- They play live, side by side, in time with your song, each with one line saying what it changed.
- **Click the one you like** to keep it. One Undo puts your scene back. Close the card (✕ or Esc) and nothing changes.
- **■ Stop** works at any time. Your scene is never touched until you pick.
- When two takes differ only in their sliders, **Mix** offers one take's colours with the other's motion.
- Works with Claude and Astra.

## For Codex

No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. The takes use only public calls:
- `Projects.projectOfChat(chatId)` and `Projects.ofItem('scene', id)` to find the project, and `p.workspace.palette`
  (read only);
- `ProjectBrief.get(id).palette` and the brief's compact form (`ProjectBrief._.entry(id).compact`, read only). The
  check also uses `ProjectWorkspace.create`.

Astra's takes run through the crew's helper runs (`hub.send` with `options.crew`), the same way as Claude's.
