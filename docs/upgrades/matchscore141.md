# How close am I? A live match score against a reference (round 141, matchscore141)

The owner asked: "I'm matching a picture or a clip. While I tweak, tell me how close I am, and give me one click that
gets me closer." The Lab now keeps a live score against a reference he picks. It updates while the sliders move, it
says in plain words which part is off, and **◎ Closer** nudges the colour and light sliders toward the reference in
about 2 s as one undo step.

## What existed (and what each does)

- **🎨 Look match** (lookmatch, `tools/three-lookmatch*.js`, round 28) reads a picture or a clip on this computer: its
  palette, light, contrast, saturation, warmth, grain, vignette, bars, and a clip's motion. It writes the gap into the
  scene's ◐ Grade and Film & lens layers. `LookCore.closeness()` gives one "≈ N % close" after a match. That number is
  read once, on 200 px frames, with the board's k-means palette and its levels. It's too heavy to run twice a second, and
  it has no parts. Its picker, `LookMatch.pick()` (a file, the moodboard, a recent render), is **reused** here.
- **refmatch131** (`tools/three-refmatch*.js`) has the director build one new layer like a picture, with the cost shown
  first. Its cost estimate and cost line (`RefMatchCore.estimate` / `costLine`, with `hub.directorCost`) are **reused**
  for the AI option.
- **`Kit.paletteFromImage`** (kit.js) gives a picture's k-means colours. It's **reused** for the reference's swatches and
  as the target colours for Closer.
- **The critique's contact sheet** (critique130, `d.contactSheet`) is a sheet of the scene's own frames for one AI look.
  It isn't a reference source and isn't live, so it is unchanged.
- **Frame read-back**: `ThreeLab.director.shotSmall(max)` is the preview's own small JPEG, on the channel the
  thumbnails and the director's pictures use. It's **reused** for every scene frame, at 64 px. ThreeFrames (labframes)
  reads clips exactly, with contact sheets, scenes and pacing, and capture-mcp's frame reader serves the AIs. Neither
  gives two small frames half a second apart, which is what a motion score needs, so a clip reference is read here in
  ~20 lines (4 moments, each read twice 0.5 s apart).
- **Project look** (looks129) recolours colour sliders through the sliders' own `setMany` and gives one Lab undo step
  (`LabDirect.push`). Closer **uses the same route**.

## What's new, and where the owner clicks

- **Pick a reference**:
  - In the Lab, **🖼 References**, a picture's or a clip's card › **⋯ › ◎ Match against this**.
  - Or right-click a **moodboard** picture, GIF, clip or web page › **◎ Match against this in the Lab**.
  - Or **Ctrl/⌘+K** › "Lab: How close am I? Match against a picture or clip…", which opens lookmatch's picker (a file,
    the moodboard or a render).
- **The chip**: a small **"◎ 72 %"** just above the preview's stats line, bottom left. It moves up when ⚡ Slow shows
  there. It appears only once a reference is picked, and only on that scene. No toolbar row was added.
- **The card** opens when he clicks the chip. It shows:
  - the overall match and a word for it (very close, close, getting there, far off);
  - the reference's thumbnail and palette;
  - four parts, each with a bar, a number and a hint in plain words:
    - **Colours**: the hue mix and the colour lean of the shadows, mids and highlights, plus saturation, e.g. "the
      picture leans orange, yours blue, the picture is warmer".
    - **Light**: the brightness histogram (its distance) and the contrast, e.g. "yours is darker".
    - **Energy**: the edge amount and the share of detail, e.g. "it is calmer, less detail".
    - **Motion**: the frame-to-frame change every half second. It's shown only when the reference is a clip.
- **◎ Closer**: a small local optimiser. It tries the scene's colour sliders, its light-like number sliders
  (brightness, exposure, intensity, glow, contrast, saturation…) and the ◐ Grade layer's exposure, contrast,
  temperature, tint, saturation, vibrance, lift, gain and mids. Colour moves go 70 % of the way to one of the
  reference's colours, or a bit lighter or darker. Number moves are ± 15 % of the range, halving when neither direction
  helps. After each try it measures the score, keeps the move only if the score rises, and puts it back if not. It stops
  after 24 tries or about 2 s. 🔒 sliders are left alone. The result is **one undo step**: the Lab's Ctrl/⌘+Z, the
  card's ↶ Undo or the toast's Undo. The card then says "Closer: 38 → 73 % · 2 sliders · 21 tries".
- **✦ Ask the AI for the rest**: the card first shows the **cost line** ("About 8k tokens in (most re-read from the
  cache) and 2k out · Claude"), with **✦ Send** and Cancel. Nothing is sent before ✦ Send. The message names the parts
  still under 80 %, with their hints and the reference's palette. **No picture is sent.**
- **⋯** on the card has "Another reference…" and "Stop matching".

**It doesn't cost frame rate.** Each update takes the preview's 64 px JPEG, which the preview page makes itself. The
work on the Lab's thread (draw it small, read it, the numbers) is timed on every update and kept in
`LabMatch.state().cost`: about **0.5 ms median** in the check, on software GL. The pure part alone measures 0.14 ms in
Node. Updates run every 500 ms, and stop while the preview is hidden, the window is in the background, the scene isn't
the one matched, or the Lab is recording.

**Nothing leaves the computer.** The pictures and clips are read here. Only the ✦ Send click sends anything, and it
sends words.

## Files

- `tools/three-matchscore-core.js` (new, pure, loads in Node): `sig`, `merge`, `motionOf`, `parts`, `hints`,
  `offParts`, `askText`, the colour moves and `tunable` (the sliders Closer may move).
- `tools/three-matchscore.js` (new, `LabMatch`): reads the reference, samples the scene, the chip and the card,
  Closer with its undo, the AI flow, and Ctrl/⌘+K.
- `tools/three-matchscore.css` (new).
- `lazy-data.js`: the new **matchscore** group (use tier, after `lab`), with the manifest regenerated. Also
  `index.html`'s `lazy-at.js#matchscore` tag and `docs/lazy-groups.md`. The group loads only when a reference is picked.
- `tools/three.js` (one marked line): the ⋯ on a picture's or clip's reference card.
- `board-menus.js` (one marked line): the moodboard item's row.
- `dev/checks/matchscore141.js` and the `matchscore141` group in `dev/run-checks.js`.

First screen: 62 scripts, 1538 KB of the 1547 KB budget (boot-test 3190 ✓). Nothing was added to any prompt or tool
description.

## Tests

One app check, **dev/checks/matchscore141.js** (group `matchscore141`, `--fake-engines`). It runs on the check's own
temp data, a picture it draws itself (orange with a dark band) and a clip it records itself (MediaRecorder):
1. **chip**: 🖼 References › ⋯ › ◎ Match against this shows "◎ N %" and nothing else. It updates about twice a second.
2. **up / down**: Background slider to the picture's orange: 37 → 62 %. To blue: back down to 37 %. Colours follows
   the same way (15 → 79 → 21).
3. **parts**: the card shows Colours, Light and Energy (no Motion for a still), each with a number and words.
4. **cost**: the median update stays under 1 ms on the Lab's thread (0.5 ms). It's load-aware: on a busy box (load
   ≥ 0.75 per CPU), up to 4 ms counts as "can't tell".
5. **Closer**: 38 → 72 % in about 2 s (Background blue → #de571f, Tint grey → #904023). That is exactly one Lab undo
   step, and one Ctrl/⌘+Z puts both sliders back.
6. **AI**: the cost line comes first, and nothing is sent for 1.5 s. ✦ Send sends one message with no picture and the
   parts still off.
7. **clip**: a clip reference has its motion read (0.23), and the card gets a fourth part, Motion.

Run: `matchscore141` ✓ (1 min), `refmatch131` ✓, `looks129` ✓, `labchat92` ✓, `speed133` ✓ (alone; in the batch it missed its
relative fps step once, on a software GPU at 2 fps, which doesn't load this group), `unit:lazymanifest-test` ✓,
`unit:slim116-test` ✓, `unit:selfmap118-test` ✓, `node dev/boot-test.js` ✓ (3190).

## Risks / not done

- The score is a guide, not a judge. It compares colour, light, edges and motion as amounts. It doesn't compare
  composition or shapes: two pictures with the same colours in different places score as close.
- The chosen reference lasts for the session, not across a restart.
- Closer only moves what sliders exist. A scene whose colours are hard-coded gets "Already as close as these sliders go",
  and ✦ Ask the AI is then the way on. With no ◐ Grade layer it doesn't add one: 🎨 Look match does that.
- An animated scene's frames differ a little from one update to the next. Closer keeps a move only when it gains more
  than 0.3 points, so noise rarely counts as a gain.

## For the patch notes

- **How close am I?** Pick a reference picture or clip and the Lab keeps a small **◎ 72 %** by the preview's frame-rate
  line. It updates while you move sliders.
- Click it to see why: **Colours**, **Light**, **Energy** and, for a clip, **Motion**, each with a few plain words
  like "yours is darker" or "the picture leans orange".
- **◎ Closer** tries your colour and light sliders (and your ◐ Grade) for about two seconds and keeps only what brings
  you closer. One Undo puts it all back.
- **✦ Ask the AI for the rest** shows the cost first. Only when you click Send do the parts that are still off go to
  the director, as words. Your pictures stay on your computer.
- Where: in the Lab's 🖼 References, a picture's **⋯ › ◎ Match against this**. Or right-click a moodboard picture ›
  **◎ Match against this in the Lab**, or use Ctrl/⌘+K.

## For Codex

No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged, so nothing carries a
`// (round 141, matchscore141)` mark there. The AI option uses only public calls: `Native.ensureChat`,
`Native.send(agentId, text, { chatId })` and `hub.directorCost`. An Astra director gets the same message. No store
was added, so nothing new syncs.
