# eyes112: what the AI sees of the Lab, checked against the screen (round 112)

The owner's first complaint was that the AI "can't see the scene". Since then the AI has had `three_screenshot` and
`three_layers` (tools/three-director.js), small pictures after each change (round 49), and the wait for textures
(round 102, `__labPicsSettle`). This round looked at what the AI actually receives, in a scene like the owner's music
visuals, and fixed what was wrong or misleading.

The scene is labchecks109's real scene (`dev/checks/realscene-lib.js`), built from the bundled **Beat burst** demo:
a shader backdrop, particles bursting on the kick, a textured 🧊 model, a beat rig with six frame loops, ✦ Bloom on
top, and a generated 124 bpm song with ⚡ kick / snare / hats triggers, playing. Files are in the check's own temp
folder. No owner data and no owner scenes were used. Calls go through `HubBridge.call`, the same path an AI's Lab call
takes, with fake chats.

- **Before:** the round-111 code (`fdd0147`), run with the same check in report mode (`window.EYES112_REPORT = 1`,
  `dev/smoke.js --app <copy of fdd0147>`).
- **After:** this round.
- The box: 4 CPUs, software GL, the preview at about 9 frames a second. A real graphics card is much faster: see "Left".

## 1. The screenshot itself
### Is it the picture on screen?
The check compares the AI's picture with the compositor's own capture of the Lab preview (`Page.captureScreenshot`
of the preview's frame). It uses a still layer under ✦ Bloom with the song paused, so both pictures show the same moment.

| Case | Mean difference (0–255), before | After |
|---|---|---|
| ✦ Bloom on | 4.7 | 4.7 |
| ✦ Bloom off | 5.4 | 5.3 |
| ✦ Bloom back on | 4.6 | 4.7 |
| The layer at 50 % opacity, Screen blend | 2.9 | 2.9 |

- **It was already right.** The picture is the drawn, merged frame, with post-processing: with ✦ Bloom it is brighter
  by the same amount as the screen. Colours match within JPEG noise (blue about 4 higher in dark areas). It covers the
  scene only: the Lab's own overlays (Freeze / Fit, the fps line, "Before: …" chips) are not in it, which is right.
- **The size is right:** 512×288 for a 640×360 frame, the frame size said once (`frame custom 640×360`).
- Nothing to fix here.

### Is it taken at a useful moment of the music? (fixed)
Before, a look was taken at whatever frame came next. In a sound-reactive scene, the kick's flash, the particles' burst
and the rig's pulse were there in one look and gone in the next. Two looks in a row could not be compared either.

**After:** while the song plays and the scene reacts to sound (a visible layer's code uses `audio.`, `onHit`,
`everyBeats`, `onBar`, `onBeat` or `beatPulse`), a plain `three_screenshot` waits in the preview for the **next kick**
and takes the next frame. The kick comes from the owner's kick markers or the ⚡ kick band. With no kick, it waits for the
next beat of the grid. The answer says when the look was taken: `Screenshot (512×288). Taken on a kick (6.4 s, bar 4 beat 1).`
`on: "kick" | "snare" | "beat" | "bar"` picks the moment and `on: "now"` takes the next frame, as before. If the song is
paused, the scene is backstage, a seek (`at`) was asked for, or the scene doesn't react to sound, the look is taken as before.

The check measured each picture's **age after the last kick** in the preview page. A probe notes each kick's rising edge
and the moment the preview encodes the picture.

| 6 looks each | Before | After |
|---|---|---|
| A plain look: time after the kick (median) | 205–368 ms in two runs (anywhere in the 484 ms beat: 15–851 ms) | **58 ms** (26–113 ms) |
| `on: "now"` (any moment) | – | 409 ms (47–943 ms) |
| The answer says when | no | "Taken on a kick (…, bar 4 beat 1)": 6/6 |
| Extra wait per look | – | 208–302 ms on average (at most about one beat) |

At 9 frames a second, 58 ms is the next frame after the kick. At 60 fps it is one frame (≈ 17 ms), and the hit is at its peak.

### A short strip over one bar (fixed)
`frames: n` took n frames 0.5 s apart in one row. Four frames fit in 780×108, so each frame was **192×108**, too small
to read. Each picture's own time (here 0.4–0.9 s) was also added to the gap.

| `frames: 4`, song playing | Before | After |
|---|---|---|
| What | 4 frames 0.5 s apart, left to right | **4 frames over one bar**, from its first beat, one per beat, each labelled `beat 2 · 9.73 s` |
| Sheet | 780×108 (each frame 192×108) | 772×436, 2 across (each frame 384×216) |
| Image tokens | 112 | 449 |

Without a song (or with `gap` given) the strip keeps its gap on a steady clock and is laid out 2 across up to 4 frames
(3 up to 6, 4 up to 8).

### `at: "kick"` (fixed)
`at` promises `"kick"`, `"snare"`, `"hit"`. It only read the owner's hand-placed markers, so on any song whose kicks
weren't kept as markers (the analysis finds them: "KICK · 92 found · keep them") it answered
`Can't go to "kick": give seconds, drop, kick, snare, hit or a cue name (and load a song).`
**After:** with no markers it uses the hits the analysis found (and `beat` the grid's beats): `Screenshot (512×288).`

### compare (fixed)
`compare: true` put "the previous screenshot" on the left. That was **one picture for the whole Lab**: the last look of
any chat, of any scene, or a collaboration's look, or an automatic picture after an edit.

The check: chat X looks (the square is blue), chat Y turns it red and looks, then turns it back to blue. Then chat X
asks for `compare`.

| | Before | After |
|---|---|---|
| The left picture in X's compare | chat Y's look (**red**: rgb(255,32,33)) | X's own previous look (blue: rgb(33,63,255)) |
| What it says | "Left: the previous screenshot, right: now." | "Left: your previous look (1 s ago), right: now." (with "on a kick" when it was) |
| A chat that hasn't looked yet | another chat's or scene's picture, said the same way | the last look at this scene, said so: "Left: the last look at this scene (1 s ago)" |

Kept per chat (with the chat's other "already said" memory) and per scene. A different scene never shows up as "before".

## 2. The layer summary (`three_layers`)
Before, it listed the layers, their sliders and the selected one, but nothing about what was drawing: a layer that
threw an error was listed like the others, and a model still loading looked the same as one loaded.

**After**, three short lines are added, each only when it applies:
- `errors`: `none`, or up to 3 as `[Broken] line 3: Error: eyes112 broke` (the rest: "… n more (three_console)").
- `models` (when a visible layer loads a model): `rsbot (🧊 RS bot) loaded · textures sharp`. It can also say
  `loading 40 %`, `failed: …`, or `pictures still going up (blurry stand-ins may show)`.
- `motion` (song playing, the scene reacts to it): `the song plays and the scene reacts to it: three_screenshot waits for
  the next kick or beat (on: "now" for any moment)`.

| | Before | After |
|---|---|---|
| Size (this 5-layer scene) | ≈ 145 tokens | ≈ 195 tokens |
| The selected layer, picked object | yes (`*`, `picked`) | same |
| A broken layer | not said | named with its line |
| Model state | not said | said |

It stays short: sliders are names only, and the scene name and note are said once per chat.

## 3. After an Apply, Undo or edit
The check changed a still square's colour and looked right after each change. It read the square in the AI's picture.

| Change | Before | After |
|---|---|---|
| `three_edit_code` ×4 (blue ↔ red), then `three_screenshot` | right colour each time | same |
| `three_do undo` | right | same |
| ▶ Apply from a chat (`LabChatLink.apply`), then its undo | right both times | same |
| A new 🧊 model layer with a fresh 4096² picture, looked at right away | taken once the model was in (no stand-in left) | same (round 102's wait: 0 ms needed here) |

No stale frame was found. The picture is merged from the layers' own canvases (not the cross-fade from the old
version), and its request goes after the change in the preview's message queue. Round 102's wait covers layers held
for their shaders (modelcompile101) and textures still going up. labchat102 checks the slower cases (a 4096² picture
mid-upload, a held layer).

## 4. Cost
What one look costs the AI (image tokens ≈ w × h / 750, the text in characters / 4):

| Look | Size | KB | Image tokens | Text tokens (before → after) |
|---|---|---|---|---|
| `three_screenshot` (default small) | 512×288 | 5–14 | 197 | 11 → 17–21 ("Taken on a kick …") |
| a later look in the same reply | 384×216 | 4 | 111 | 23 (same) |
| `size: "medium"` | 640×360 (the frame is 640 wide) | 6 | 307 | 6 (same) |
| `compare: true` | 1028×288 | 9–13 | 395 | 17 → 18–26 |
| `frames: 4` | 780×108 → 772×436 | 7 → 15 | 112 → 449 | 16 → 27 |
| automatic picture after an edit | 384×216 | 3–4 | 111 | (same) |
| `three_layers` | – | – | – | 145 → 195 |

- **When pictures are sent (unchanged):** only when the AI asks (`three_screenshot`), or as a small picture after a
  change that shows (round 49; `shot: false` / `/director-autoshot off` turn it off). An unchanged view in the same
  reply is a one-line note instead of a picture. Nothing new is sent without the owner's action. The tools' fixed
  description is unchanged: the lean list is still 2,127 tokens a step (the new `on` option is in the full description
  and in the answers).
- **Time:** a look while the song plays waits up to one beat for its kick (about 200–300 ms on average here). A strip
  over one bar takes up to two bars.

## 5. Also fixed
- `three_console` and other compact results gave the song's tempo as **`0 bpm`**. The Lab's report has no `bpm`, only its
  grid does. Now: `song124.wav · 124 bpm · 19.0/45 s · playing`.

## What changed (files)
- `tools/three-director.js`: looks on the music (`MOMENT_JS`, run in the preview through `evalInSketch`, ≤ 2.4 s,
  3.4 s for a bar line), `on`; the strip over one bar (`UNTIL_JS`) and its layout; compare per chat and per scene
  (`keepLook`, `lookBefore`); `at` from the analysis's hits; `sceneNow` (errors, models, motion in `three_layers`); the
  tempo in the music line; `ThreeDirector.moments()` for checks.
- `mcp/three-mcp.js`: `three_screenshot`'s full description and schema name `on` (the full list 9,132 tokens, under its 9,150 budget). The lean one is unchanged. `dev/promptdiet-test.js`: `on` in the args its help topic lists.
- `dev/checks/eyes112.js` (new, group `eyes112` in `dev/run-checks.js`).
- Not touched: `tools/three-sandbox.html` (no hook needed: the wait runs as an eval in the page), `tools/three.js`,
  collab-eyes.js, three-direction*, credits*, Swarm / manager / missions, every Codex-owned file.

## Checks
- `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js --exact eyes112`
- Also run: labchat92, labchat102, labmodels99, modeltex100 (its one late frame judged "can't tell under load"), labboot, lazy, unit:boot-test: 8/8 passed. `node dev/run-checks.js release`: 306/310, the 3 known failures (KNOWN_FAIL) and unit:promptdiet-test (the full director list 20 tokens over: trimmed, and its help-args line given `on`; it passes now, as do unit:directorlean-test, unit:directorfrugal-test, unit:directorgame-test and unit:director-mcp-test, which hold the lean list at 2,127 tokens).

## Left / risks
- On this software-GL box a look is one frame after the kick (≈ 60 ms). On a real graphics card that is ≈ 7–17 ms.
  If the preview is too busy, the eval may answer late: the look then goes at the cap (2.4 s), said as "mid-motion".
- "Reacts to sound" is read from the layers' code. A layer that follows the music only through a ♪ slider link (no
  `audio.` in its code) is taken at once, as before. `on: "kick"` asks for the kick anyway.
- A half-time song whose kick is on beats 1 and 3: a look may fall on a beat with no kick (said "on a beat").
- The strip's frames come one by one from the preview. A slow page makes them late, and their labels give their real time.

## For the creative-direction session
Found while auditing `collab-eyes.js` (not changed here):
1. **A collaboration's look still counts as the host chat's.** `CollabEyes.packet(chatId)` calls `three_screenshot` and
   `three_layers` with the host chat's `chatId`. Since this round, `compare` uses the chat's own previous look, so the
   host chat's next `compare` shows the **collaboration's** picture as "your previous look". Steps: in a chat linked
   to a scene, run a duo, then ask that chat's AI for `three_screenshot { compare: true }`. Suggestion (as in round 92):
   call with a chat id of its own (e.g. `collab:<id>`), routed to the same scene.
2. **The collab's picture now waits for the kick** when the song plays and the scene reacts to sound (≤ about one beat).
   It is taken on the kick, like the AI's. Nothing to change. Pass `on: 'now'` if a seat should see any moment.
3. **New lines in `three_layers` the seats don't get:** `errors`, `models`, `motion` (see 2). `layerText(v)` reads
   `v.layers` only. Adding `v.errors` (when not `none`) and `v.models` to the packet's text would tell a seat that a
   layer is broken or a model is still loading (≈ 10–30 tokens, only then).
4. Still open from round 92: each collaboration saves a new `scene-<id>-<time>.jpg` that is never cleaned up.

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **The AI sees your music visuals on the beat.** When your song is playing and your scene reacts to it, the AI's
  screenshot now waits for the next kick, so it sees the flash and the burst you made. Before, it might catch the
  quiet moment between beats. Two looks in a row are at the same point of the beat, so comparing them means something.
  The AI is told when the picture was taken.
- **A clearer strip of frames.** When the AI asks for several frames, it now gets one bar of your song (one frame per
  beat), twice as big as before, each labelled with its beat.
- **"Compare" compares with the right picture.** The AI's before/after now uses its own last look at this scene, not
  a picture another chat took.
- **The AI knows when something is broken or still loading.** The layer list now says which layer has an error, and
  whether your 3D models have loaded with their full textures.
- **"Jump to the kick" works on any song.** The AI can look at the moment of a kick even if you haven't placed kick
  markers yet.
- **The right tempo.** The AI is told your song's real BPM (it read "0 bpm" before).
