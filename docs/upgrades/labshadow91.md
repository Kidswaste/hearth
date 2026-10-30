# labshadow91 (round 91): lights, shadows, a second scene and in-render materials compiled off-frame; a changed 4K picture in slices

Round 90 (`labcompile90.md`) moved the shader compiles of things a running scene adds out of on-screen frames. It
left five cases that still compiled in the frame that needed them, plus two open points:

1. A light removed, or shown again.
2. A shadow-casting light's first shadow pass (three's depth / distance materials).
3. A second scene drawn by the same renderer.
4. Materials made inside three's own render.
5. A picture changed on disk while it's shown: still a single upload, not sliced.
6. The 2.1 MP slice size was fixed.
7. The `generateMipmaps` read-order workaround relied on three r186 internals, with no test.

All seven are done. Nothing is added to any prompt (0 tokens). There's no new button or setting. Mac and Windows run
the same code. Every app change is in the Lab's preview page (`tools/three-sandbox.html`, lazy, outside the first
screen, so the budget is unchanged). The owner's scene and game code isn't touched. Hearth's own runtime never hides
or removes a light (its built-in scenes add theirs once), so there was nothing of Hearth's to switch to "intensity
0" instead. The owner's lights are handled from the outside, as described below.

## How it was measured
- **Same recorder, same rules as round 90.** `window.__labHitch` counts the shader compiles and links made **inside**
  the page's frame callbacks on frames that drew on screen (`visibleInFrameCompiles`), and the biggest single upload
  of pixels. Every frame over 2× budget is judged on CPU (round 88's load-aware rule): it counts as the app's if the
  preview's own CPU was over budget or a compile / big upload landed inside it. Otherwise it's "can't tell (load)",
  which doesn't fail the check. There is no wall-time budget.
- **`dev/checks/labcompile90.js` has ten new stretches** at 480×270, on a scene with a hemisphere light, a sun, a
  point light and a spot light hidden from the start:
  - `light:first`: the spot light hidden from the start is shown. Its programs were never made.
  - `light:off`, then `light:on`: the sun is hidden, then shown again.
  - `light:remove`, then `light:readd`: the point light is taken out of the scene, then put back.
  - `shadow:light`: the same scene with shadow maps on gets its first shadow-casting spot light.
  - `shadow:caster`: then a new kind of caster arrives (12 instanced boxes with a new material).
  - `scene2`: the renderer starts drawing a second scene with four new materials (a menu → level switch).
  - `inrender`: a mesh's `onBeforeRender` gives two meshes new materials.
  - `reload`: one of the texture stretch's 4096² pictures is changed on disk (`D.refs.reload`, round 42's path). The
    picture's texel is read back before and after.
- **Budgets for the new stretches:** 0 compiles inside on-screen frames, each new thing shown within 12 frames, and at
  most 1 hitch a stretch judged the app's. For `reload`: no single upload over 4.2 MP, none inside a frame, and the
  new picture read back from the graphics card.
- **Before → after** is the same check on both builds. "Before" is base 7a3f0fc (round 90 merged, recorder already
  in), run with `--app` on a copy of it and `LC90_REPORT=1`. "After" is this branch.
- **New unit test `dev/labshadow91-test.js`** (`unit:labshadow91-test`) runs the page's slice queue on the **real**
  three.js r186 `WebGLRenderer`, over a fake WebGL2 context that records every call. See "The guard".
- `dev/run-checks.js` has a new group, `labshadow91`.

## Before → after (labcompile90's new stretches; base 7a3f0fc vs this branch; SwiftShader, 4 shared CPUs)
| Stretch | Compiles inside frames on screen | All compiles / links | Hitches over 2× (the app's) | p99 ms | Biggest single upload |
|---|---:|---:|---:|---:|---:|
| A light hidden from the start, shown | **9 → 0** | 9 → 9 | 2 (2) → 2 (0) | 217 → 150 | — |
| The sun hidden | **9 → 0** | 9 → 9 | 2 (1–2) → 2 (0) | 133–233 → 150 | — |
| The sun shown again | 0 → 0 ¹ | 0 → 0 | 0 → 1 (0) | 67 → 117 | — |
| A point light taken out | **6–9 → 0** | 6–9 → 9 | 2 (1) → 2 (0) | 117–133 → 133 | — |
| The point light put back | 0 → 0 ¹ | 0 → 0 | 0 → 0 | 67 → 50 | — |
| First shadow-casting light | **3 → 0** | 12 → 15 ² | 2 (1) → 2 (0) | 233 → 200 | — |
| A new kind of shadow caster | **3 → 0** | 6 → 9 ² | 3 (1) → 3 (0) | 167 → 200 | — |
| A second scene for the renderer | **12 → 0** | 12 → 12 | 2 (1) → 1 (0) | 183 → 150 | — |
| Materials made in three's render | **6 → 0** | 6 → 3–6 | 2 (1) → 3 (0) | 133 → 100 | — |
| A 4K picture changed on disk | 0 → 0 | — | 3 (1) → 2 (0) | 167 → 117–267 | **16.8 MP, inside a frame → 1.4–1.7 MP, none inside a frame** (~16 slices) |

¹ Three keeps a material's earlier programs, so a light shown again or put back, in a combination the scene already
had, needs no new program in either build. After this round, it waits one frame anyway while the check confirms that.

² The extra programs are the shadow pass's draw in the gap after a frame (see fix 2). It draws once with a single
basic material into a 1×1 target. That one program is made once per renderer.

The base's late frames judged the app's were all compile frames. This branch's late frames are all "can't tell
(load)": the preview's own CPU in them was 1–10 ms, and the rest went to the software GPU, which on these 4 busy CPUs
compiles in the GPU process right after the frame. Single p99s swing 1.5–2× between runs on this machine
(labfps89 ¹). The counts are what compare.

Round 90's stretches on this branch: `runtime:*`, `glass:shown` 0 compiles inside on-screen frames, as in round 90.
`texture`: biggest single upload 2.1 MP, none inside a frame, 31–33 slices for two pictures (the slice size settled
at 1.0–1.5 MP on this machine, see fix 6). All slices together took 0.8–1.1 s of the page's time (1.6–1.8 s on the
base). The longest single call, with the mipmaps, was 0.4–0.6 s (0.9–1.0 s on the base).

## The fixes
### 1. A light hidden, taken out, or shown again
- **Noticed as it happens.** `Light.visible` is now read through an accessor on `Light.prototype` (lights are few; a
  plain field is kept). `Object3D.remove` of a light, or of a group that may hold one, bumps the same change counter
  as `add`. While nothing changes, a render still compares one number.
- **On the next render,** the lights three counts in the scene's programs are compared with the last look. Three
  counts the ones it reaches through shown groups, and an ambient light changes no program.
  - A light **shown or put back** stays off until the programs with it are made (as round 90 did for a new light).
  - A light **hidden or taken out** is drawn **at intensity 0** until the programs without it are made. It's made
    visible for that render and, if three wouldn't reach it (taken out, or under a hidden group), put back in the
    scene's list of children for that render only. An intensity-0 light adds nothing, so the picture is already the
    one without it. Its own settings are back right after the render.
- **The programs for the new light count are made in the gap after the frame,** as in round 90 (`compileAsync` with
  background compiling, `compile` and a link-status read without). Then it shows. Nothing waits more than 2.5 s.
- A light taken out that had no shadow map, and got one while it was held, has that map let go when the hold ends.
  Its owner may already have disposed of it.

### 2. Three's shadow-pass materials
- Three makes its depth and distance materials (a variant per kind of caster: instanced, skinned, alpha-tested) inside
  its shadow pass, so `renderer.compile` never makes them.
- **Now, in the gap after a frame, the scene is drawn once into a 1×1 target with an override material**
  (`lcShadows`). The shadow pass runs exactly as it will in the next frame, and its programs are made and linked
  there. The main pass draws everything with one cheap basic material. Three skips its glass pass under an override.
  The shadow maps it draws are the scene as it is now, which is what the next frame would draw.
- **When:** whenever a new thing that casts shadows, or a new shadow-casting light, arrives in a scene with shadow
  maps on, and at a layer's start on a card with background compiling (with round 89's compile before the first
  frame).
- **Not when** the sketch drives its own maps (`shadowMap.autoUpdate = false`), nor in XR. Round 50's shadow gate is
  told to draw the maps for this one draw, and its own state is back right after.

### 3. A second scene drawn by the same renderer
- A renderer's first scene is compiled before its first frame (round 89). A **later** scene it hasn't drawn before,
  with materials it has no program for, now has its first draws **skipped** while its programs are made in the gap
  after the frame (its glass and shadow variants too). A frame that draws nothing to the canvas changes nothing on
  screen, so the last picture stays. Then it draws.
- Limits:
  - only inside a frame callback (a sketch that draws once, on a click, draws as before);
  - one scene at a time per renderer;
  - at most 2.5 s;
  - a renderer that keeps meeting new scenes (a fresh `Scene` every frame) isn't watched for 10 s.
- A scene drawn into a texture each frame (a minimap, a portal) shows its first content one frame late (more with
  background compiling) instead of sticking.

### 4. Materials made inside three's render
- Round 90 ignored version bumps during three's render, so that its own toggles (glass flipping a material's side)
  wouldn't count. A material **made** there is different: its first version is set while it has none. That is now
  counted, and once the outermost render ends it counts as a change.
- A mesh whose `onBeforeRender` gives it a new material draws that material from the next frame, so the next render
  finds it like any other swap: it keeps its old material until the new one's program is made in the gap. Three's own
  materials made in its render (a shadow variant, the background's) trigger one extra look that finds nothing.

### 5. A picture changed on disk while it's shown
- Round 42's reload used to set the new picture on the texture, so the whole picture went up inside the next frame.
  It now goes through the uploads' queue:
  - a picture of 1 MP or more goes up right after a frame;
  - a 4K one goes up **in slices**, into new memory beside the old one, while the old picture keeps showing.
- At the last slice, the texture lets go of three's record of its old memory (`dispose`, so it's deleted on the
  graphics card) and takes the new memory over. Nothing is uploaded again. The old decoded picture is closed, as
  before.
- That `dispose` is the step round 90 was missing. With the same settings, three's cache key doesn't change, so
  without it three would have kept the old memory and uploaded the whole new picture into it.
- A texture three flips itself at upload (not one of the Lab's decoded pictures), or a picture shown before that isn't
  a reload, still goes up in one piece, as before.

### 6. The slice size follows the measured time
- Each slice's time on the page's thread is measured (the last one, which carries the mipmaps, isn't counted). The ms
  per MP is smoothed, and the next slice is sized to take about 6 ms, between 1 and 4 MP. The first slice is 2.1 MP.
- **On this software GPU** (4–7 ms per MP) the slices settle at 1.0–1.5 MP: ~16 a picture instead of 8, each lighter.
- **On a fast card** the slices grow to 4 MP, so a 4K picture fills in 4–5 gaps and shows sooner.
- `window.__labUploads().slices` shows `mp` and `msMP`.

### 7. The guard for three's `generateMipmaps` read order
`dev/labshadow91-test.js` loads three.js from `HEARTH_THREE_DIR` and makes a real `WebGLRenderer` on a fake WebGL2
context. It checks:
- **three's own behaviour, alone:** `initTexture` reads `Texture.generateMipmaps` exactly 3 times while it makes a
  picture's memory: for the cache key, the mip level count, then the mipmap pass. With every read true, that is 13
  levels and one mipmap pass. The test names three's functions in the failure line, so a three update that changes the
  count or the order fails here first.
- that the page still answers the third read false (the line the test guards);
- **the page's slice queue on that real three:**
  - memory first, all 13 levels, nothing else in that gap;
  - whole-row slices at their rows;
  - one slice per gap;
  - the mipmaps once, with the last slice;
  - the scene's texture on that memory, with nothing uploaded again;
  - the slice size going from 2.1 MP to 1 MP at 20 ms per MP, and growing up to 4 MP at 0.5 ms per MP;
- **a picture changed while shown:**
  - new memory beside the old;
  - the old picture drawn until the last slice;
  - then the old memory deleted on the graphics card;
  - nothing uploaded again;
  - the old picture handed back to be closed;
- that a texture three flips itself, or one already shown that isn't a reload, still goes up in one piece.

## What's left
- **The real card's numbers.** See `docs/windows-test-plan.md` § 8. They are `khr` (the background-compile path),
  frames waited, and the slice size the 4080 settles on.
- **Still compiled in the frame that needs them:**
  - a light's `castShadow` switched on at runtime (a plain field, not watched);
  - a group holding a light hidden or shown (the group's visibility isn't watched; the light's own is);
  - materials made and drawn in the same render (three's nested renders: a mirror's `onBeforeRender` rendering the
    scene again);
  - a scene's background drawn inside the glass pass (round 90).
- The shadow pass in the gap costs one extra shadow-map draw when something new arrives in a scene with shadows. That
  is GPU time in the gap, the same as one frame's shadow pass.
- A one-off scene drawn into a texture shows its first content a frame late (fix 3).

## Runs on this branch (`flock /tmp/hearth-run.lock node dev/run-checks.js --exact …`, ≤ 5 a run)
__RUNS__

## Windows test plan section
`docs/windows-test-plan.md` § 8 has two more items: the new stretches and the numbers to report, and three by-eye
tries (sun off and on, a shadow spotlight, a 4K photo saved again).

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Lights switching on and off no longer stutter.** When a scene turns a light off, removes it, or turns one on, the
  Lab gets ready for the change between two frames and then shows it, instead of freezing for a moment.
- **Shadows are ready before they appear.** The first time a light starts casting shadows, or a new kind of object
  starts casting them, the Lab prepares the shadows in the background first.
- **Switching to another scene inside the same sketch is smooth.** Going from a menu to a level, for example, now keeps
  the last picture on screen for a moment while the new scene gets ready, instead of sticking.
- **Saving a big picture again is smooth.** When you save a 4K picture that a scene uses again (from Photoshop, for
  example), the new version is now sent to the graphics card a strip at a time, while the old one keeps showing. Then
  it swaps in, with no jolt.
- **Big pictures arrive at the speed your graphics card can handle.** On a fast card they come in a few bigger pieces
  and show sooner. On a slow one they come in more, smaller pieces so nothing stutters.
