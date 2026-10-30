# labchat92: the AI chat and the Lab, really working together (round 92)

The owner asked for "connectivity to three js lab": the AI "can't see the scene… can't interact with stuff they're
being given". Rounds 54–80 built most of the pipe (per-chat scenes, the 🔗 chip, backstage calls, one undo per reply,
the scene's health in the next call). This round walked through a Lab chat **by clicks**, with the fake Claude and
Codex engines making real Lab MCP calls, on scenes made by the check (no owner data, no owner scenes), and fixed what
was broken on the chat side.

The same check (`dev/checks/labchat92.js`) was run on the round-91 app (`dev/smoke.js --app <copy of 7968a7b>`) for
the **Before** column and on this round for **After**.

## Before / after, flow by flow

### 1. Opening a chat from the Lab
| | Before | After |
|---|---|---|
| ⋯ Sketch › More › **Ask Claude about this layer** | A new Claude chat **not linked to any scene**; its draft was the layer's whole code. Once the owner sent it from the chat view, every Lab call of its AI failed: "This chat isn't linked to a Lab scene yet, so nothing was changed". | The new chat is **linked to the scene it came from** (with its first message). Its draft starts with one line about the scene: `[Lab scene "Chat A" · layers, bottom first (* = selected): Base, Ring*]` (≈ 18 tokens). A Claude with the Lab's tools isn't handed the whole layer code (it reads it with `three_read_code`); a Claude without them still gets the code. Its first Lab call reaches the scene. |
| The console's **Ask director to fix** | Put the errors of scene A into Claude's **open** chat, even when that chat worked on scene B: its AI then "fixed" scene B. With no agent that has the Lab's tools: an error toast. | A chat whose scene isn't this one is left alone: a new chat for this scene is started (linked when sent). No agent with the Lab's tools: a Claude draft, linked to the scene (its reply's code can be applied, see 2). |
| The selected object | The AI couldn't know which object the owner picked in the scene editor. | `three_layers` (`three_do layers`) says `picked: "Duck" (Mesh) in layer "Base"` while one is picked (nothing otherwise). The scene line names it too. |
| The scene, its code, its layers | Not in the prompt; the AI pulls them with the Lab tools (this stays: lean). | Same, plus the one line above for chats started from the Lab. |

### 2. The AI proposes a code change
| | Before | After |
|---|---|---|
| A whole layer in a reply's code block | Only **Open in Three.js Lab**: it made a **new sketch** ("From chat 6:07 PM"); the chat's scene didn't change. No undo, and the AI never learned what happened. | **▶ Apply to scene** on the block (whole layers only): *Replace "Base" (the selected layer)* · *Replace another layer ›* · *Add it as a new layer* · *Open it as a new sketch* (the old way). It goes into the chat's own scene, on screen or backstage, through the same path as an AI's call (the time machine, the layer's history). |
| Does the scene re-run? | — | Yes, in place (hot run of that layer). |
| What happened | — | A note in the chat: `▶ Applied to Ring in Chat A: it runs with no errors · console: applied92 ready`, or `1 error: SyntaxError: missing ) after argument list` (the scene's errors a few frames in included, each said once). |
| Undo | — | **↶ Undo** in the note (an added layer is taken out). If the layer changed since, it asks first. |
| The AI gets back what happened | — | **Tell Claude what happened** / **Send the error to Claude** (Astra in an Astra chat): one click sends a short message (what was applied where, the errors with their lines, console lines; never the code again, ≈ 50–80 tokens). Nothing is sent without that click. |
| A layer the owner typed in after the reply was written | — | Apply asks first ("You changed "Ring" by hand after this reply was written…"); Cancel changes nothing. |

### 3. A scene error (syntax or runtime)
| | Before | After |
|---|---|---|
| In the chat | `⚠ Scene error in Ring · it threw an error` with **Ask Claude to fix** (round 80). A syntax error read as "it threw an error". | `⚠ Scene error in Base · a syntax error (on line N)` and the error itself on a second line; **Ask Claude to fix** as before (one click: the error + the code around it). The error from an Apply shows in its own note with **Send the error to Claude**. |

### 4. Many quick AI edits, and the owner typing meanwhile
| | Before | After |
|---|---|---|
| The AI edits another layer while the owner types | The editor **jumped to the AI's layer**; the owner's next keys **landed in that layer** (check: `/*more*/` typed in "Base" ended up inside "Ring"). | The owner's editor stays on their layer; the AI's layer changes and re-runs without taking it (its old code goes in its history). Their keys stay where they type. |
| The AI edits the layer the owner types in | Their **cursor jumped to the end** of the code. | Their cursor (and scroll) stay at their word; the AI's change is merged around it (find → replace on the text as it is, typing included, as before). |
| A whole-layer rewrite (`three_set_code`, `three_update_layer` with code) that hasn't seen the owner's typing | **Silently replaced** what the owner had typed. | Refused, in words: `The owner is editing "Base" by hand (last change 3 s ago) and your code doesn't have those changes, so nothing was changed. Read it again (three_read_code) and change your part with three_edit_code.` Once the AI has read the layer, the rewrite goes through. Only within 10 min of the owner's last key in that layer. |
| 8 edits in one reply while the owner types | All 8 landed; the owner's typing went into the AI's layer. 18 hot runs (the owner's keys re-ran the AI's layer too). | All 8 land; the owner's typing stays in their layer; 10 hot runs (8 edits + the owner's own). See "Slow" below for the time. |

### 5. Switching scenes or projects while a chat replies
| | Before | After |
|---|---|---|
| The owner opens another scene mid-reply | The reply's edit landed in the chat's own scene (round 72's routing): fine. | Same. An Apply's note shows only in the chat it was made from (the 🔗 chip says which scene). |

### 6. Cost: what the chat sends about the scene
| | Before | After |
|---|---|---|
| Per message | Nothing about the scene (an echo turn returned exactly the 14 characters typed, linked or not). The Lab guide + tool list are fixed and cached: ≈ 742 + 1,299 tokens (Claude), 645 + 1,142 (Astra). | Unchanged. |
| A chat started from the Lab | The layer's whole code in the draft (≈ 1 token per 4 characters: ≈ 180 tokens for a 700-character layer, more for big ones). | ≈ 18 tokens of scene line + one sentence for a Claude with the Lab's tools. |
| The AI learning an apply's result | — | Only on the owner's click: ≈ 50–80 tokens, no code. |

### 7. Both engines
The check runs the Apply, its Tell button and the refused stale rewrite from an Astra (Codex) chat with the Lab's tools
too: the same buttons ("Tell Astra what happened"), the same answers. Both go through Hearth's existing paths (the
Lab's MCP server, HubBridge, LabTxn, ThreeDirector).

## Slow
- An Apply answers in ≈ 0.5–2.5 s (the layer's first frame or its error; up to 1.2 s more for an error a few frames
  in). Software GL here; a real GPU is faster.
- 8 quick edits in one reply: the reply took ≈ 4 s before and ≈ 7 s after on this loaded 4-CPU box with SwiftShader;
  the extra time is the owner's own layer re-running from their typing (before, their keys re-ran the AI's layer
  instead, between its edits). Per-call medians are in the check's output (`many.medianCallMs`).

## What changed (files)
- New `tools/three-chatlink-core.js` (pure: the caret through an edit, what a whole layer is, when a rewrite is stale,
  an apply's outcome said once, the Tell message, the scene line) and `tools/three-chatlink.js` (LabChatLink: ▶ Apply,
  the note and its buttons, chats started from the Lab linked to their scene). Both load with the Lab (lazy group
  `lab`); nothing new on the first screen except the button in native.js.
- `tools/three.js`: the owner's keystrokes per scene + layer; an AI edit keeps the owner's editor and cursor;
  `three_layers` says the picked object; Ask Claude about this layer / Ask director to fix go to a chat linked to
  this scene.
- `tools/three-director.js`: `handGuard` (a stale whole-layer rewrite refused); `picked` in the layers answer.
- `tools/three-health.js`: the chat note says "a syntax error" and shows the error itself on its own line.
- `native.js`: the **▶ Apply to scene** button on whole-layer code blocks (two lines).
- `lazy-data.js` (the lab group's files), `dev/fake-common.js` (`layercode` / `layercode-bad`: a reply proposing a
  whole layer), `dev/run-checks.js`.
- Not touched: `tools/three-sandbox.html`, collab-eyes.js, three-direction*, credits*, Swarm / manager / missions,
  astra*, quest-*, projects*, project-workspace*, sync-engine.js, cloud-files.js, workbench-*, creative-vst*, engine-watch.

## Checks
- `dev/checks/labchat92.js` (group `labchat92`): every flow above by clicks, Claude and Astra, real MCP calls.
- `node dev/labchat92-test.js` (`unit:labchat92-test`): the core.
- `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js --exact labchat92 unit:labchat92-test`

## Left / risks
- Apply takes whole layers only (an ES module that imports three, draws and loops). A snippet (a few lines) still goes
  through the AI (`three_edit_code`) or the old "Insert in my message".
- The owner's keystrokes are kept in memory only (not across a restart); the refusal window is 10 minutes.
- The note after an Apply lives in the chat until dismissed or replaced (like other notes, it isn't saved).

## For the creative-direction session
Found while auditing `collab-eyes.js` (not changed here):
1. **A collaboration's look counts as the host chat's AI having looked.** `CollabEyes.packet(chatId)` calls
   `three_screenshot` and `three_layers` through `HubBridge.call(…, { chatId })` of the host chat, so ThreeDirector
   files them under that chat's AI: the screenshot sets the chat's `lastSig` and the Lab-wide `prevShot`
   (tools/three-director.js, `three_screenshot`), the layers call marks the scene name / note as seen (`onlyNew`).
   Steps: in a chat linked to a scene, run a duo (or `/ask-astra` with the scene on); then in the same chat ask the AI
   for `three_screenshot { compare: true }`: its "before" is the collab's picture, not one it took; a plain
   `three_screenshot` of the same size in that reply can answer "No visible change since your previous picture"
   although that AI never saw it. Suggestion: call them with a ctx of their own (e.g. a `collab:<id>` chat id routed
   to the same scene) or pass `force: true` + `report: 'full'` and keep them out of the chat's bucket.
2. **Each collaboration saves a new picture file** (`scene-<id>-<time>.jpg` through `hub.saveAttachment`) that is
   never cleaned up. Steps: run 20 duos from a scene-linked chat → 20 files in the attachments folder.
3. Collab seats now also get `picked` in the layers answer when the owner picked an object in the scene editor
   (`layerText` ignores it; nothing breaks). It could go into the seats' scene line.

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Apply the AI's code to your scene in one click.** When Claude or Astra answers with a whole layer of code, the
  block has a **▶ Apply to scene** button: replace the selected layer, another layer, or add it as a new one. The
  scene updates right away, the chat tells you if it runs or what error it hit, and **↶ Undo** puts it back.
- **Tell the AI what happened, in one click.** After applying, "Tell Claude what happened" (or "Send the error to
  Claude") sends a short note with the result. Nothing is sent unless you click.
- **Your typing is safe while the AI works.** If you're typing in a layer while the AI edits another one, your editor
  stays where it is and your keys stay in your layer. Your cursor no longer jumps when it edits the layer you're in,
  and the AI can't replace a whole layer you've just typed in without reading it first.
- **Chats you start from the Lab know your scene.** "Ask Claude about this layer" and "Ask director to fix" open a
  chat that works on that scene (not another one), with a short line naming the scene, its layers and what's
  selected.
- **Clearer scene errors in the chat.** A syntax error now says so, with the error itself shown.
