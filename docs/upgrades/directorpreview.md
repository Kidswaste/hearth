# ◧ Try it first (round 43, directorpreview)

The problem: when the Three Director's edit isn't what the owner wanted, they ask again, which costs tokens and time,
and the unwanted edit is already saved into the scene. **Try it first** is an optional mode where a director turn's
edits land on a preview copy of the scene. The preview shows them live, ◧ Before / after works on them, and the
scenes file isn't touched until the owner chooses one of three:

- **Keep** saves the edit as one undo step.
- **Undo** throws it away. Nothing was saved and nothing is recorded.
- **Try another way** undoes it and sends one short follow-up. The follow-up names the rejected edit in one line, so
  the director doesn't repeat it.

It is off by default, and nothing changes while it is off.

New files: `tools/three-try-core.js` (the pure part, Node-tested), `tools/three-try.js` (`LabTry`) and
`tools/three-try.css`. They are in the `lab` lazy group, right after ◧ Before / after.

## Upgrades
### The mode
1. **Try it first**: with it on, the Lab director's edits show in the preview but aren't saved until you press Keep.
   The scenes file keeps the scene as it was. This follows the scenesafe rules: the Lab's own save writes the scene
   as it was when the turn started, and never writes an unread or partial list.
2. **One switch** in ⋯ AI setup › Habits: "In the Lab: shows me its edit first". It is saved on the director agent
   (`agent.tryFirst`), off by default, and costs 0 tokens because nothing is added to the prompt.
3. **◎ "Show me first"**: a mission in the director's chat box that does the same for the next message only. It hides
   while the switch is on.
4. **Follow-ups build on the waiting edit**: a message sent while an edit waits continues the same trial. It keeps the
   same "before", and one Keep or Undo covers all of it. The cost adds up ("· 2 replies").
5. **Works the same with Claude and Astra**: it follows the chat's turns, not the engine. The bar says "Claude's edit"
   or "Astra's edit".
6. **A scene the director makes during the turn** (three_new_sketch, or a chat's own copy) isn't written either.
   Undo removes it and goes back to the chat's previous scene. Keep saves it.

### The bar (top centre of the preview, where ◧'s chip sits)
7. **"◧ Claude's edit, not saved yet · Orb +3 −1 · palette · “Made the rings pink.”"**: what changed in the scene
   (the time machine's summary) plus the first sentence of the reply.
8. **The edit's cost on the bar**: tokens for the turn(s), with the cached part ("1.3k tokens (1.1k cached)").
9. **◧ on the bar**: press and hold to see before, click for the split view (the same as holding or tapping B). ◧'s
   own chip waits while the bar shows, so there aren't two sets of buttons.
10. **While it works**, the bar reads "Trying it first: Claude's changes wait here, not saved".
11. **Keep**: saved now, as exactly one version in ⟲ History ("Claude's edit, kept · …"). The toast's **Undo** puts
    the scene back, also saved, and ⟲ History's "back before Claude's edit" works too.
12. **Undo**: the preview goes back as it was. The scenes file and ⟲ History are untouched, and ◧ forgets the
    comparison.
13. **Try another way**: undoes the edit, then sends one message of about 40–50 tokens: "Not that one: I undid it, so
    the scene is back as it was (it was: <the edit in one line>). Try a different approach to my last ask." That next
    edit is tried first too.
14. **Right-click the bar**: ✓ Keep · ⟲ Undo · ↻ Try another way · ◧ Split view.
15. **An edit on a scene that isn't on screen** (the chat's scene is backstage): a line in the chat with Show it ·
    Keep · Undo · Try another way.
16. **A turn that changed nothing** (it only answered) leaves nothing waiting and shows no bar.

### Ways in
17. `/try-first [on | off | next | keep | undo | again | status]` for power users and the AI.
18. ⌘/Ctrl+K: "Lab: Try it first on / off".
19. The app map's lab topic has one line, so the director knows what "I undid it" means. It is read on demand, so
    the prompt doesn't grow.

## How it works
- `tools/three.js` `save()` writes `LabTry.disk(sketches)` instead of the raw list. `TryCore.diskList` substitutes the
  copy of each waiting scene taken at the turn's start. While a turn runs, it leaves out any scene made since then.
  After the turn, it leaves out only the scene the chat moved to. The scene in memory (what the preview runs) is
  never copied or swapped, so the director's tools, directorlean's session memory, backstage scenes and labboot all
  work as before.
- "Before" is taken when the message is sent (`Native.hooks.send`), or at the first editing call if the Lab wasn't up
  yet (`ThreeHistory.director` → `LabTry.touch`). The owner's typed code and moved sliders are persisted into the
  scene first, so they stay.
- The time machine records no version for a waiting scene (`record()` asks `LabTry.holds`; the turn's bookmark is
  still made). Keep is then one forced `capture` labelled "…'s edit, kept". Undo puts the state back with
  `ThreeLab.tm.show(before, { keep: true })`, or for a backstage scene by setting its layers + `scenes.changed`.
  Because nothing was recorded, the state after Undo equals the last version and no version is made.
- The turn's end (`Native.hooks.finish`) adds its usage and compares the state with `TMCore.changes`. A turn with no
  change ends the trial silently.
- Nothing waits across a restart: if Hearth closes with an edit waiting, the scenes file has the scene as it was.

## Tests
- `node dev/directorpreview-test.js` (unit, in `UNIT`), 7 tests: the list written while an edit waits (the scene as
  it was, a copy; new scenes left out while running, then only the chat's), two chats at once, the one-line summary
  (≤ 140 characters, Markdown and code stripped), the short follow-up (< 260 characters), and the cost line.
- `dev/checks/directorpreview.js` (`lab:` group, `--fake-engines`, real MCP calls): **24 steps, all pass**:
  - off by default, saved as it comes
  - the ⋯ AI setup row switches it on, and ◎ hides
  - an edit shows in the preview while the scenes file and ⟲ History are unchanged (a save forced meanwhile)
  - the bar's words, cost and buttons; ◧'s chip waits
  - Keep: on disk, exactly one version with its label, and the toast's Undo puts it back on disk
  - Undo: preview back, file and History untouched, no bar
  - Try another way: undone at once, one message with the line and "different approach", and its reply tried first
  - /try-first off; ◎ Show me first for one message only, then saved as it comes again
  - Astra as the director: "Astra's edit", its cost, Undo
  - no page errors
- Group `sh dev/run-checks.sh directorpreview` = directorpreview + its unit test + abcompare, directorlean,
  labdirector, director-tools, scenesafe, labrecipes, lazy, unit:boot-test, unit:director-mcp-test and
  unit:cache-test: **12/12 pass** (run twice).
- The bar was checked by eye in the screenshot (top centre of a 1:1 frame, under the frame's own bar).

## Edits outside the new files (small, additive)
- `tools/three.js`: one line in `save()` (`LabTry.disk`).
- `tools/three-history.js`: one `LabTry.touch` line in `director()` and one `holds` guard in `record()`.
- `options.js`: one row in the Lab directors' habits (`try-first`).
- `mcp/hearth-map.js`: one lab-topic line.
- `lazy-data.js` (the lab group + the regenerated manifest), `dev/run-checks.js` (the unit test, `lab:`, the
  `directorpreview` group).

## Risks / not done
- **Your own changes to that scene while an edit waits** (a slider saved, code typed) are part of the waiting state.
  Undo drops them with the director's edit, and Keep keeps them.
- **The edit only lives in memory until Keep.** If Hearth quits with an edit waiting, it's gone, and the scene is as
  it was. That is the point, but it isn't announced. Safetynet's journal may offer it back as a version.
- **Things the director changes outside the scene itself** aren't held: the frame size, the song link, looks and
  references live in other stores (`three-lab-extras`, `three-refs`). A director turn that only changes those has
  nothing waiting.
- **After a plain Undo, the director isn't told.** No silent context is added. It sees the restored code as a diff the
  next time it reads the layer (directorlean), and Try another way tells it in words.
- **◧ split / hold compares with the state before the last turn**, not before the first turn of a multi-message
  trial.
- **The AI setup row isn't in Find anything (appsearch-data.js)**: it only exists for Lab directors, and
  appsearch's check opens AI setup for the default AI, so a row there would fail that check.
- Tested with the fake engines under Xvfb (SwiftShader). No real Claude Code or Codex runs were made.

## For the patch notes
- New for the Three Director: **Try it first**. Its edit shows in the preview but isn't saved until you say so.
- Turn it on in the director chat's ⋯ AI setup › Habits › "In the Lab: shows me its edit first", or pick ◎ **Show me
  first** for one message. It's off by default.
- A bar over the preview names the edit and what it cost, with **Keep** (saved, one undo step), **Undo** (back as it
  was, nothing saved) and **Try another way**.
- Try another way undoes the edit and sends the director one short message saying what you didn't want, so it tries
  something different. It costs about 50 tokens, not a full re-ask.
- ◧ on the bar (or hold B) shows how it was before; click for the split view.
- Works the same with Claude and Astra. While it's off, nothing changes.
- Caveat: an edit that's waiting lives only in this window. If you quit before pressing Keep, your scene stays as it
  was.
