# laberrors80: a scene's health flows back to the chat (round 80)

Until now, when a Lab scene broke AFTER a tool call had answered (an error a few frames later, a shader that didn't
compile, a camera gone NaN, a layer throwing on every frame, a file that 404s, the graphics card resetting), the AI
only found out if it thought to ask (three_console). And a layer that threw on every frame sent 60 errors a second to
the Lab and filled its console.

## What changed for the owner
### The preview notices problems (each once, never per frame)
1. **Every problem is kept once** per layer + message + line, with when it started, when it last happened and how many
   times. The Lab hears the first one at once; repeats are only counted and sent at most every 2 s (one message).
2. **The console holds a repeating error once** instead of one row per frame.
3. **Shader errors in plain words**: three.js' whole-program dump becomes one line, e.g. `a ShaderMaterial's fragment
   shader didn't compile: 'fooBar80' : undeclared identifier`. The dump stays in the devtools as a warning.
4. **A camera that went NaN** (a division by zero in the code that moves it, an aspect of 0 / 0) is said once:
   `the camera went NaN: its position is NaN, so nothing draws`. Read twice a second with the fps line, not per frame.
5. **Files that didn't load**: a fetch that answered 404 / failed, and a picture / video (three.js' TextureLoader
   included) that failed: `a file didn't load (404): wood.jpg`, with the layer that asked for it.
6. **A lost graphics context** (the GPU reset) is noted, and marked as back once the Lab has rebuilt it.

### The AI hears it in its next call
7. **One short `health:` line** at the end of the next Lab answer (any tool) of the chat linked to that scene, only
   when something new broke since that chat last heard, e.g.
   `health: layer "Neon" throws TypeError: Cannot read properties of undefined (reading 'x') at line 18 every frame since 7 s (paused after 90 frames so the preview stays smooth; its next edit runs it again)`.
   At most 3 problems, worst first; never repeated; skipped when the call's own answer already says it.
8. **Healthy scenes cost nothing**: no line, not one character or token added (the check compares answers with the
   feature on and off), nothing added to any prompt.
9. **Works backstage too**: a chat whose scene isn't on screen hears its scene's problems the same way; other chats
   don't hear about scenes that aren't theirs.

### In the chat: one click to ask for a fix
10. **"⚠ Scene error in Neon · Ask Claude to fix"**: a quiet note under the last reply of a chat whose scene is broken
    (shown once the AI's reply has ended; "Ask Astra to fix" in an Astra chat). Nothing is sent by itself.
11. **One click sends a prepared message**: what broke in words, and the layer's code around the error line (numbered,
    the line marked). The note goes away once used, once dismissed (until something new breaks), and by itself when
    the layer is fixed.

### A layer that throws on every frame no longer drags the preview
12. **Paused after 90 frames in a row** (and at least ½ s): its last picture stays, the other layers keep drawing at
    full speed. Its next edit runs it again. (Never in ▶ Play: the game's own frames are never held.)
13. **A note over the preview**: "⏸ Neon is paused: it threw … on every frame" with **▶ Resume** (it runs again, and
    pauses again if it still throws) and ×.

Upgrades: 13.

## Budget
- Per frame when healthy: nothing new. The layer frame wrapper's existing call gained a `catch` that never runs on a
  healthy frame, plus one property compare (the paused check). The camera check runs on the stats tick (2 / s, skipped
  while the picture dozes); fetches get one `then` each; images one listener each. No timer runs while healthy.
- Host side: one Map lookup per tool call while healthy (`LabHealth.decorate` returns the same result object).
- First screen: +2 lines in bridge.js (1874 / 1880 KB); `tools/three-health.js` loads with the lab group.
- gcchurn60 fails the same way on the base commit (lab 1112 B/frame base vs 1175 B here with a game playing: run noise;
  the top allocation is the pre-existing rAF wrapper for a game asking with a new function every frame) — pre-existing.

## Checks
- New `dev/checks/laberrors80.js` (group `laberrors80`): a plain Claude chat (fake engine, real MCP calls) linked to a
  scene on screen, a second one to a scene backstage. Healthy answers are byte-identical with the feature on and off
  (same tokens) and the pages send no health message. Then each kind is put in by another hand after a call: a layer
  throwing every frame (paused, the note over the preview with Resume, console holds it once, health line with layer,
  line, "every frame since N s", not repeated on the next call; the chat note; its click sends the error and the code
  around line 18; Resume → pauses again; the fix clears the line, the pill and the note), a shader, a NaN camera, a
  missing picture + file, the same backstage, and a lost WebGL context (simulated as glrecover does).
- Ran: laberrors80, labtools73, labcalls74, labbridge72, lazy, unit:boot-test, unit:director-mcp-test,
  unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:storeack-scan — all pass. gcchurn60 red on base too.
  `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js laberrors80`

## Files
New: `tools/three-health.js` (LabHealth: per-scene problems, the health line, the chat note, the paused pill),
`dev/checks/laberrors80.js`. Changed: `tools/three-sandbox.html` (`__labProblems`: dedupe + counts, shader words, file
failures, NaN cameras, catch + pause in the layer frame wrapper, `resume-layer`, `health-clear` on a layer's re-run),
`tools/three.js` (hands preview messages to LabHealth; `ThreeLab.healthHost`), `tools/three-backstage.js` (the same,
backstage), `bridge.js` (decorate the answer), `tools/three-lab.css`, `lazy-data.js`, `dev/run-checks.js`.
Not touched: three-direction*, collab-eyes, credits*, Swarm, astra.js.

## Left / risks
- A layer that throws on only some frames (not ½ s in a row) is counted, never paused.
- A file a layer loads later from inside a loader callback (no layer code on the stack) is named without its layer.
- Errors kept for a backstage scene stay after its backstage page goes idle (the code is still broken); "since N s"
  keeps counting from the first time.
- The prepared message names the worst problem's code only (the others in words).

## For the patch notes
- **The AI now finds out when your scene breaks after a change**: if a layer starts throwing errors a few frames
  later, a shader doesn't compile, the camera goes blank, a file is missing or the graphics card resets, Claude or
  Astra is told in its next step, in one short line. When everything is fine, nothing is added.
- **"⚠ Scene error · Ask Claude to fix"**: under the last reply of a chat whose scene broke. One click sends Claude the
  error and the code around it; it never sends by itself. The × hides it.
- **A layer that errors on every frame is paused** so the Lab stays smooth: a note at the bottom left of the preview
  says which one, with **▶ Resume**. Editing the layer runs it again.
- **Calmer console**: an error that repeats shows once instead of filling the console, and shader errors read in words.
- Works the same for scenes that run in the background (a chat's scene you're not looking at).
