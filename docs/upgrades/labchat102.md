# labchat102: the AI chat and the Lab, checked again after ten rounds of Lab changes (round 102)

Round 92 (`labchat92.md`) made the AI chat and the Lab work together. Since then the Lab loads on intent (labload94),
models became several files (labmodels99, modeltex100), compiles moved after frames (labcompile90, labshadow91,
modelcompile101), History went per scene (labsync88), project bundles carry Lab work (labproj97, bundle98), and the
director's dock and task files load after the first screen (firstscreen96).

This round walked every round-92 flow again by clicks, plus the new cases. It used the fake Claude and Codex engines
making real Lab MCP calls, on scenes and models made by the checks in their own temp folders. No owner data and no owner
scenes were used.

- **Before:** the round-101 code (`a1b21a6`), with `dev/checks/labchat92.js` and the new `dev/checks/labchat102.js`
  (run in a separate worktree of that commit).
- **After:** this round.

## Before / after, flow by flow

### 1. Round 92's own flows (`labchat92`)
| | Before | After |
|---|---|---|
| The whole labchat92 check | **fails 4 steps** | passes |
| "Tell Claude what happened", then the chat redraws | The ▶ Apply note **came back** (it was only taken off the page, and `Native.note` keeps notes until they are dismissed). The next Apply's note was then mistaken for this one. | The note is gone for good once the owner clicks Tell. |
| A broken block applied after that | Its "1 error: SyntaxError" note was hidden behind the stale "runs with no errors" note | Its error shows, and so does **Send the error to Claude** |
| The owner's caret is in "Base" but they haven't typed for over 5 s, and 8 quick AI edits arrive for "Ring" | The editor **jumped to "Ring"**. The owner's next keys landed in "Ring" (`selected: Ring`, `/*busy*/` missing from Base). | The editor stays on "Base" while the owner's caret is in it. Their keys stay in Base. "Ring" changes and re-runs as before. |

### 2. ▶ Apply when the Lab isn't loaded yet (labload94), every lazy group held
| | Before | After |
|---|---|---|
| A reply's ▶ Apply › Replace "Ring" with the Lab not loaded | Works (the Lab loads on the click) | Same. About 4–8 s on this software-GL box with everything held. |
| ↶ Undo | Works | Same |

### 3. Undo after Apply, with History per scene (labsync88)
| | Before | After |
|---|---|---|
| Apply + Undo on the scene on screen | Scene A's History file (`kv/three-hv-lc102a.json`) gets the code from before and the applied code | Same |
| Apply + Undo from a chat whose scene is **backstage** (another scene on screen) | **Nothing in that scene's History.** A backstage edit (an AI's or an Apply) never kept the code it replaced. | The replaced code goes into **that scene's** History, as on screen. Versions identical to the newest are not repeated. Scene B's History gets nothing. |

### 4. ▶ Apply of a new layer held between frames (modelcompile101)
| | Before | After |
|---|---|---|
| When "the layer drew" was reported | The preview said "drawn" **700 ms after a layer's run, even while its renderer was still held** for its shaders. | "Drawn" waits while one of the layer's renderers is held (re-checked every 200 ms, up to 8.7 s). |
| The Apply note ("Added to From chat: it runs with no errors") | Written after a fixed 2.5 s (+ up to 1.2 s for errors). In the before run, a layer with 50 shader programs was held 3.7 s, and the note came at 3.8 s whether or not the layer had drawn. | Written once the layer has drawn its first frame (`building()` false when written), capped at 6.5 s. Its errors and console lines are read again at that moment. 5–7.4 s here for the 50-program layer (software GL); a light layer is unchanged. |

### 5. An AI adds a multi-file model (`three_model add`, `three_do model`)
| | Before | After |
|---|---|---|
| Claude, scene on screen: a `.gltf` with `buffers/car.bin`, `textures/paint.png` (4096²) and `../shared/glow.png` | All 4 files copied into `refs/<time>-car/` (it already went through `addRef` → `importRefWhole`) | Same |
| Astra, its scene backstage: an `.obj` + `.mtl` + `maps/seat.png` | All 3 files copied into that scene's references; the scene on screen untouched | Same |
| A `.gltf` dropped on a Claude chat linked to a scene, while the Lab isn't loaded | Copied whole into that scene's references (4 files, nothing missing) | Same |

### 6. The AI's screenshot right after (modeltex100)
| | Before | After |
|---|---|---|
| `three_screenshot` right after `three_model add` (or an Apply) | Taken at once. In the before run the page was still sending the 4096² picture up (a model texture job pending, 0 applied) when the picture was taken, so the frame showed the **64-pixel stand-in** (or no model yet). | It first waits, up to 2.5 s, while pictures are still going up: a model still loading, its picture decoding, a full picture behind its stand-in, slices or queued uploads, a renderer held for its shaders, or meshes still compiling (`window.__labPicsSettle`). If the page is too busy to answer within 3.5 s, the picture goes anyway. If something was still loading, the answer says so: "Some textures were still loading (blurry stand-ins may show): look again in a moment." |
| An auto-picture after an edit | — | Unchanged (it never holds an answer long) |

### 7. The director dock and `/task` while their groups load (firstscreen96), every group held
| | Before | After |
|---|---|---|
| An ask sent to the docked director before director-task.js is in | Kept; `/task` then shows "Goal: goal102: …" | Same |
| `/task` through its stand-in | Answers | Same |
| The Lab shown with a director docked | The dock's strip shows | Same |

### 8. Both engines
Claude and Astra (Codex) both go through the same paths: Hearth's Lab MCP server, HubBridge, LabTxn and ThreeDirector.
Astra's ▶ Apply lands in its own backstage scene and offers "Tell Astra what happened". Every error an AI got was a
sentence.

## Cost
- Nothing new is sent to any AI: 0 tokens per message. The only new words are the line about textures still loading, ≈ 15
  tokens, and only when that happens.
- A `three_screenshot` makes one extra small call to the preview first. It costs about one frame when nothing is
  loading, and at most 3.5 s when something is.

## What changed (files)
- `tools/three-chatlink.js`: Tell removes its note for good. Apply waits for an on-screen layer's first frame (≤ 6.5 s)
  and reads the Lab's errors and console again (`stats.waitedDraw`).
- `tools/three.js`: the editor stays on the owner's layer while their caret is in it (`typingNow`). New
  `api.keepVersion` / `ThreeLab.keepVersion(scene, layer, code)` puts a version into that scene's History.
- `tools/three-backstage.js`: a layer's code changed backstage keeps the code it had (`keepVersion`).
- `tools/three-director.js`: `three_screenshot` waits for pictures still going up, and says so if they were still
  loading. `ThreeDirector.settled()` reports these waits for checks.
- `tools/three-sandbox.html`: the layer's 700 ms "drawn" fallback doesn't fire while its renderer is held.
  `picsBusy` / `picsSettle` / `window.__labPicsSettle` (`busy`, `why`, `wait(ms)`, `state`). A model's texture job
  records when its picture arrived (`job.at`), and `MTX.inflight` counts pictures still being fetched or decoded.
- `dev/checks/labchat102.js` (new, group `labchat102` in `dev/run-checks.js`).
- First screen: unchanged (no first-screen file touched). `unit:boot-test` passes.
- Not touched: collab-eyes.js, three-direction*, credits*, quest-*, projects*, project-workspace*, sync-engine.js,
  cloud-files.js, workbench-*, creative-vst*, astra*, engine-watch, the labstartfast check and the perfguard baseline.

## Checks
- `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js --exact labchat102`
- Also run: labchat92, labload94, labmodels99, modeltex100 (passed; modeltex100's one late frame is judged "can't
  tell under load"), director-dock, labboot, lazy (passed), labcompile90 (its `layer:heavy` step hit the 6 s hold cap
  once in a batch at load ≈ 8, passed alone right after), and the units unit:labchat92-test,
  unit:labmodels99-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:storeack-scan,
  unit:chatsafe-scan, unit:chatwin-scan, unit:boot-test, unit:lazymanifest-test (all passed).

## Left / risks
- **A renderer can stay held for its shaders longer than modelcompile101's 6 s cap.** The check's page timeline showed a
  new 🧊 model layer held from 2.6 s to 15.6 s while its model loaded and its 4096² picture decoded, on this loaded
  software-GL box. Every round, `__labWarmGap` reported `waiting: 1` after an Apply of a 50-program layer. The Apply
  note's wait is capped (6.5 s), so nothing hangs. But a held layer shows nothing on screen until it lets go.
  Steps: run `labchat102`, then read `info.pageTimeline` and `info.held.stillHeldAtNote`. Worth a look in the
  modelcompile101 stream (`wgGap` only checks `WG.maxMs` when a gap runs).
- Under heavy load the preview may not answer the screenshot's check within 3.5 s. The picture then goes without
  waiting, and the AI is told it may show stand-ins.
- With a real GPU (and on the owner's RTX 4080, with background compiling), the waits are much shorter or zero.

## For the creative-direction session
- `collab-eyes.js` calls `three_screenshot` (`force: true`) for a duo's look. That picture now also waits (≤ 2.5–3.5 s)
  for textures still going up, so a duo started right after a model was added sees the full textures. Nothing to change.
  The two items from round 92 (a collab's look counted as the host chat's, a new picture file each time) are still open.

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Applying the AI's code tells you the truth.** After ▶ Apply, the chat now waits until the new layer actually shows
  before saying "it runs with no errors", so an error on its first frame isn't missed.
- **The AI sees your model properly.** When Claude or Astra adds a 3D model and then looks at the scene, the look waits
  a moment for the model's full pictures instead of showing the blurry preview version. If they're still loading, the
  AI is told so.
- **History keeps everything.** Changes made in a scene that isn't on screen (an AI working in the background, or your
  ▶ Apply and Undo there) now show up in that scene's History too.
- **Your typing stays where it is.** If your cursor is in a layer's code, an AI edit to another layer no longer moves
  you there, even if you paused for a while before typing.
- **One-click notes stay gone.** After "Tell Claude what happened", the Apply note no longer comes back when the chat
  redraws.
