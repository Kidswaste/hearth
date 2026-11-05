# Two app bugs from the check sweep (round 126, deskfix126)

Round 125's check sweep (docs/upgrades/checksweep125.md, "App bugs") left two real app bugs open. Both are fixed here.
These are bug fixes only, with no redesign; the Lab gets its full rework later.

## 1. projaudit108: a scene row on the Desk didn't open the Lab after an import

**What the owner saw.** After **Projects › ⋯ › Import project…**, the project opens by itself on its Desk. A click on
its scene row (Project files › Scenes) did nothing. The window stayed on the Desk.

**The cause.** It wasn't the route ticket. Round 125 suspected an early `ticket !== route` return in
`ProjectWorkspace.go()`. To test that, every `open()`, `go()` and `leave()` was logged with its ticket and its caller.
After the click, no `go()`, no `openScene()` and no `Projects.openItem()` ran at all. The click never reached the row.
`document.elementFromPoint` at the click's spot returned the import's own note: the toast
**"Imported “Garage108”: 1 chat · 1 scene · 1 board [Open] ×"**.

- The import shows that note for 9 s. Opening the project on a fresh profile takes about 7.5 s, because the Lab's code
  loads for the first time.
- The note sits at the lower right, over the Desk's lower rows, where the Scenes row of Project files is.
- A note under the mouse stays until the mouse leaves it (ui.js). So moving to the row kept the note there, and the
  click landed on the note's text.
- Its **Open** button was also pointless, because the project was already opening.

**The fix** (`projbundle.js` `done()`): when an import opens its project by itself, the note has no **Open** button. It
goes away as soon as that project is open (`ProjectWorkspace.state()` is `ready` for it). A note that lists skipped
things keeps its **What was skipped** button and its 9 s, as before. Copying a project (no auto-open) is unchanged.

Nothing in `project-workspace*.js` changed. The route ticket works as designed, and a newer click still wins over an
older one.

## 2. laberrors80: a shader that didn't compile never reached the chat

**What the owner saw.** When a layer's shader failed to compile, the Lab noticed it (a `LabHealth` record existed).
But the chat working on the scene got no `health:` line, and the chat's note said only "⚠ Scene error in *the scene's
name* · a shader didn't compile". The other kinds (a layer throwing every frame, a NaN camera, a file that doesn't
load, a lost GPU) all got their line.

**Where the line is made.** The preview page (`tools/three-sandbox.html`) turns three.js's shader dump into one
sentence and posts it as an `error` with `kind: 'shader'`. The Lab passes it to `LabHealth.fromBox` (tools/three.js on
screen, tools/three-backstage.js backstage). `tools/three-health.js` keeps it per scene. `decorate()` (called from
bridge.js for each tool call of a linked chat) adds the `health:` line, and `paintChat()` puts the "⚠ Scene error in
… · Ask Claude to fix" note under the reply.

**The causes** (there were two):

1. **No layer.** The page names the layer from the error's call stack. Since rounds 89–102, the Lab compiles a new
   layer's programs ahead of its frame, in tasks of its own (`lcAhead`, `lcSceneAhead`, the warm-gap `wgGap`).
   three.js reports the failed compile from there (`wgGapWork › link › WebGLProgram.getUniforms › onFirstUse`), and no
   layer is on that stack. So the record had `layer: null`. The note then named the scene, and the line could never
   say `layer "Glass"`.
2. **The quote check.** `decorate()` skips a record that the answer already quotes. Since round 112 (eyes112), every
   Lab answer (three_layers, three_add_layer…) lists the scene's errors. So the shader's words were always "already
   in the answer", the record was marked as told, and the `health:` line never came. The AI read a bare line in an
   errors list, with no layer and no sign the layer draws nothing, and could still say "done". The every-frame
   errors were exempt from that check. Camera and file problems aren't in the errors list. That's why only shaders
   lost their line.

**The fixes:**

- `tools/three-sandbox.html`: the Lab's ahead-of-frame compiles run inside `compiling(r, …)`, which records the
  renderer being compiled. The shader branch of the console wrapper falls back to that renderer's layer
  (`window.__compileLayer()`) when the stack names none. This runs only in those tasks, never per frame.
- `tools/three-health.js` `decorate()`: a shader that doesn't compile is no longer skipped because the answer quotes
  it. Like a NaN camera, it stays broken until an edit, so the chat gets the line once, for example
  `health: layer "Glass": a ShaderMaterial's fragment shader didn't compile: 'fooBar80' : undeclared identifier (line
  57 of the GLSL three.js built)`. These are the same words three_console reports. The next call doesn't repeat it.
- `tools/three-health.js` `paintChat()`: the chat's note for a shader gives the error itself on a second line (in
  three_console's words), as runtime errors have done since round 92. **Ask Claude to fix** sends it with the layer's
  code.

Not covered: on a graphics card that compiles in the background (KHR_parallel_shader_compile through `compileAsync`),
three.js reports the error later, from its own polling. A shader that fails there still has no layer, so it is
reported as the scene's. It still gets its `health:` line (fix 2) and its note. The check machine's software GPU takes
the path that is fixed.

## Tests

`export HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, then
`flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact projaudit108 laberrors80 labload94 labchat92 projects projopen109`:

| check | result |
|---|---|
| projaudit108 | pass (190 s); failed twice in round 125 and was reproduced 3× here before the fix |
| laberrors80 | pass (85 s); failed 3× in round 125 and 2× here before the fix |
| labload94 | pass (45 s) |
| labchat92 | pass (120 s) |
| projects | pass (48 s) |
| projopen109 | pass (225 s) |

`node dev/boot-test.js`: 2822 checks passed. The first screen stays within its budget (62 scripts / 1574 KB, budget
62 / 1586 KB), and neither fix touches a first-screen file's size beyond comments.

No check was changed. The tracing used to find the causes (route log, click target, shader stack) was temporary and
has been removed.

## For the patch notes

- After you import a project, clicking its scene on the project's Desk opens the scene in the Lab again. The "Imported…"
  message used to sit over that row and catch the click. It now goes away once the project is open, and it no longer
  has an "Open" button, since the project opens by itself.
- When a shader in a Lab scene doesn't compile, the AI working on the scene is now told, with the layer's name and the
  error. Before, it could say "done" on a scene that drew nothing. The note under the chat names the layer, shows the
  error, and has "Ask Claude to fix", like other scene errors.

## For Codex

- **No edit to `project-workspace*.js` or `projects*.js`.** Round 125 suspected an early `ticket !== route` return in
  `ProjectWorkspace.go()`, but the trace shows the click never reached `Projects.openItem`. It hit the import's toast,
  which covered the Desk's lower rows. The route ticket is untouched and works as designed.
- The fix is in `projbundle.js` (`done()`, new `goneWhenOpen()`), marked `(round 126, deskfix126)`. It reads
  `ProjectWorkspace.state()` (`project`, `phase`) to know when the imported project is open. If that state's shape
  changes, keep `phase: 'ready'` for the open project, or update `goneWhenOpen`.
