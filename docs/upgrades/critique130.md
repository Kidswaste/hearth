# Round 130 · critique130: "Critique this", 3 concrete improvements as chips

The owner asked for a way to have the AI look at the Lab scene and suggest 3 concrete improvements, each one a chip
to apply or dismiss.

## What existed (and what this round uses)

| Piece | What it does | Used here? |
| --- | --- | --- |
| **✨ autopolish** (`tools/three-autopolish*.js`, round 30) | A local, free pass (0 tokens). It measures the picture (levels, saturation, palette, glow, safe area, motion, music pull) and fixes it with slider and grade changes as one undo step. "✦ Ask the director" sends what's left. | Not called. It's the free "make it look finished" pass. The critique is the AI's opinion and points to it in spirit: its slider fixes are plain slider moves too. |
| **🩺 scenedoctor** (`tools/three-doctor*.js`, round 34) | A local, free check (0 tokens) for errors, a blank or too-dark frame, the subject off screen, a camera inside an object, NaN sliders and slow frames, with one-click fixes. | **Extended:** `SceneDoctor.check()` runs before the AI pass, and its findings go into the critique as "Health". The AI doesn't repeat what the doctor already sees, and it can name what's left. |
| **🎨 lookmatch** (`tools/three-lookmatch*.js`, round 28) | Matches a reference picture's look (grade, palette) locally. "✦ Ask the director" sends a small picture and the numbers. | Not called. Its "cost shown first, then ask" shape is the one followed here. |
| **📷 three_screenshot** (`tools/three-director.js`) | A single picture, or a strip of frames over a bar of the song, for the director. | Not called. The critique wants the whole piece, not one bar. |
| **🎞 Contact sheet** (`ThreeLab.director.contactSheet`, the Lab's 🎞 Sheet button, `three_contact_sheet`) | One picture of numbered frames: at given times, at the cues, evenly over the song, or a moment apart with no song. | **Reused as is:** the critique's one picture is `contactSheet({ times })` at the song's key moments (see below), or `contactSheet({ count: 4 })` with no song. |
| **Visual feedback** (`visual-feedback*.js`, Codex-owned, read only) | A second opinion on a recorded or chosen **video clip**: frames are decoded, there are close-up passes, and the result is an editable chat draft. It can take several Astra replies. | Not touched. It's the deep, video-based review. The critique is the quick one-click pass on the live scene, with chips instead of a draft. |
| **LabHealth** (`tools/three-health.js`, round 80) | Each scene's runtime, shader, camera and asset problems, kept per layer. | **Used:** `LabHealth.state(sceneId)` adds a "Health" line to the critique. |
| **ProjectBrief** (round 128) and **BriefDraft** (round 129) | The project's mood, palette, steps and risks. The draft's "About N tokens in … · Claude · model" cost line. | **Used:** `ProjectBrief.get` gives the brief (its risks come back checked), and the cost line has the same shape as draft129's. |
| **LabTxn** (`tools/three-txn.js`) | Every `three_*` call goes through it, and an AI's changes become one undo step (the dock's ↶). | **Used:** a slider or keyframe Apply goes through `HubBridge.call` → LabTxn, so it is one undo step of its own. |

## What's new, and where the owner clicks

- **The dock's ✦ Critique button** (the director's strip in the Lab, next to ↶) opens a small card above the quick
  chips. Before anything runs, the card says what the AI will look at and the **estimated cost**, e.g.
  "About 2.6k tokens in (1 picture of 4 frames) and 450 out · Claude · <model>".
  **✦ Critique it** runs it. Nothing is sent and no picture is even taken before that click.
- **`/critique`** typed alone in any chat, or in a Lab director's chat without an `a→b` lead, opens the same card.
  `/critique claude→astra <task>` is still the Collab critique. **`/lab-critique [run | history | close]`** is the
  command itself (alias `/critique-scene`). **Ctrl/⌘+K:** "Lab: Critique this scene (the AI suggests 3
  improvements)".
- **The one AI pass:**
  - **The picture:** a contact sheet of 3–4 frames. With a song, the frames are at its key moments: the drop, a quiet
    part, the peak and the opening (`CritiqueCore.moments`, from the song's analysis). With no song, it's 4 frames a
    moment apart.
  - **The words:** the scene's outline (layers, slider values with their ranges, which properties are keyed), the
    brief (mood, look, palette, steps with ticks, risks), the health (LabHealth and the scene doctor's findings), and
    the earlier critiques.
  - **The run:** a lean helper run on the dock's AI (Claude or Astra), with no tools and no memory, at low effort.
    Secrets are redacted (`AccessRules.redact`).
- **3 chips.** Each chip has a short, concrete title with numbers where they help ("The drop lacks contrast: push
  glow 0.4 → 0.8"), a one-line why, and what Apply will do:
  - **Apply** on a plain slider change, or keyframes on a property with no keys yet: it lands here at once, as **one
    undo step**. The dock's ↶, the chip's **↶ Undo** and the toast's Undo all put the scene back exactly. The values
    are checked against the scene, and clamped to each slider's range.
  - **Apply** on anything else (code, new layers, colours, camera): it is sent to the director in the dock **as your
    message**. If the director is busy, it goes into the chat box instead.
  - **✕** hides that chip.
  - The brief's risks come back checked, one line each: ✓ fine, or ⚠ with a note.
- **The history**, the last 5 critiques per project, is kept with what was done to each chip (applied, sent or
  dismissed):
  - It is stored in kv `three-critiques` and syncs with "Projects & scenes" through the existing `three-*` rule in
    sync-kinds.js.
  - The next critique is told the earlier advice and asked not to repeat it. The AI gives 4 improvements, and one
    that repeats earlier advice is replaced by the 4th. Earlier advice only fills in, marked "said before", when there
    aren't 3 new ones.
  - A scene used before it joined a project keeps its history: both are read.
  - `/lab-critique history` lists the history.

### Files
- `tools/three-critique-core.js` (new, pure, loads in Node): `moments`, `outline`, `prompt`, `parse` (the fixes
  checked against the scene's layers and sliders), `fresh` (no repeats), the history helpers, `estimate` / `costLine`
  and `message`.
- `tools/three-critique.js` and `tools/three-critique.css` (new): `LabCritique` (the card, the run, Apply, Undo, ✕, the
  store, `/lab-critique`, Ctrl/⌘+K).
- `lazy-data.js`: the new lazy group **critique** (`tier: 'use'`, after `lab`), with the manifest regenerated
  (`node dev/lazy-manifest.js`). `index.html` has its `lazy-at.js#critique` tag, and `docs/lazy-groups.md` its line.
- `director-dock.js` and `director.css`: the ✦ Critique button, which loads the group on its first click.
- `astra.js` (Codex-owned, a minimal marked edit): `/critique` alone hands over to `/lab-critique` (see For Codex).
- `dev/fake-common.js`: the fake engines' critique answer. `dev/fake-liveness.js`: a critique's "quiet part" isn't a
  long-task scenario.
- `dev/checks/critique130.js` and the `critique130` group in `dev/run-checks.js`.

No prompt part, tool or guide line changed, so the budgets (promptdiet, tokens, directorlean, director-mcp) are
unchanged. The first screen is unchanged: 62 scripts, 1,577 KB (budget 1,586), 27 stylesheets. Only the manifest
lines and the dock's button were added.

## Tests

There is one app check, **`dev/checks/critique130.js`** (group **critique130**, `--fake-engines`). It runs everything
by clicks in the dock, in the check's own temp data, on a scene it makes itself (a torus with a `glow` slider):
1. **Nothing without the click.** ✦ Critique shows the card with the cost line (tokens · Claude). `/critique` alone
   opens the same card. In both cases no AI call is made and no picture is taken.
2. **✦ Critique it.** There is one lean AI pass with one picture (the contact sheet), and the AI got the picture. The
   outline carries `glow 0.4 (0–1)`. **Exactly 3 chips** appear, and the first is a slider fix: glow 0.4 → 0.8.
3. **A slider Apply is one Undo.** The slider moves to 0.8. The dock's ↶ puts the scene back exactly (LabTxn's
   signature), with glow at 0.4 again.
4. **A message Apply** sends the fix to the director as the owner's message.
5. **✕** hides that chip.
6. **The history.** The second critique's 3 titles are all new, and the AI was told the earlier ones. The stored
   history has both critiques, the first marked applied / sent / dismissed.
7. **Astra.** The cost line names Astra, Astra gets one picture, and 3 chips appear.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock … run-checks.js --exact`): `critique130` ✓
(59 s), `labchat92` ✓ (126 s), `unit:promptdiet-test` ✓, `unit:director-mcp-test` ✓. `node dev/boot-test.js` passed
(2,895 checks, first screen within budget), and so did `dev/slim116-test.js` and `dev/selfmap118-test.js`.

## For the patch notes

- **Ask the AI for a critique.** In the Lab, click **✦ Critique** at the top of the director's chat, or type
  `/critique`.
  - First you see roughly what it will cost. Nothing is sent until you click **✦ Critique it**.
  - The AI then looks at a few frames of your scene (the drop, a quiet part… or a few moments apart if there's no
    song), along with your layers, your project's plan and any errors.
- **Three suggestions, each one a button.** Each says what to change and why, e.g. "The drop lacks contrast: push glow
  0.4 → 0.8".
  - **Apply** makes a simple slider change straight away. One Undo takes it back.
  - For anything bigger, **Apply** sends the suggestion to the director for you.
  - **✕** hides a suggestion.
- **It remembers.** The last 5 critiques are kept with the project, so the next one won't repeat the same advice. It
  also checks the "things to watch out for" from your project's plan.
- Works with Claude and Astra.

## For Codex

- **`astra.js`** (one marked edit, `// (round 130, critique130)`): the Collab `/critique` command's `run` hands over to
  `/lab-critique` in two cases. All other uses go to the Collab critique as before.
  - It hands over when `/critique` has no task (or only `run`, `history` or `close`).
  - It also hands over in a Lab director's chat (dock `three` or `threeTools`) when there is no `a→b` / `a->b` lead.
- **`visual-feedback.js`** and `visual-feedback-core.js` were read only, not changed. The critique is a separate,
  lighter pass. It doesn't record or decode video, and it doesn't use the visual-feedback store.
- **`projects*`** are not edited. The critique uses only `Projects.ready()` and `Projects.ofItem('scene', sceneId)`
  to find the project that holds the scene, for the history's key and the brief.
- `sync-engine.js`, `cloud-files.js`, `project-workspace*`, `codex-*`, `workbench-*` and `engine-watch.js` are
  unchanged.
- **The new kv store `three-critiques`** (`{ v: 1, list: [{ id: 'project:<id>' | 'scene:<id>', list: [rec…] }] }`, a
  list of objects with ids) is already in the "Projects & scenes" kind through sync-kinds.js's `three-[^/]+` rule. No
  sync change was needed. It's declared with StoreAck, and a read that failed is never saved over.
- **Astra:** the critique runs on the dock's AI through `hub.askOnce`, the same lean helper path the brief uses, with
  `verbosity: 'low'` for Codex. The picture goes as Codex's `-i` image.
