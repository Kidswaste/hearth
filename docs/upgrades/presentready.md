# Present, got ready (round 52, presentready): ▣ Present as a "compile" button

The owner asked: "could the Present button be a sort of compile button that loads everything in advance, compresses it
and make the scene run at 100% quality with no lag at all?"

It's still one button: **▣ Present** (or **P**). Nothing new on screen except a calm card while it gets ready, and one
right-click row on Present: **Bake for a perfect show**. Nothing is added to any prompt (0 tokens).

New files: `tools/three-ready-core.js` (pure: cache key, stale / size rules, the measure, the bake's rate and size),
`tools/three-ready.js` (the card, getting ready, the live show, the bake, the baked show), `tools/three-ready.css`
(lazy group `presentready`, loaded by the first Present), `dev/presentready-test.js` (UNIT), `dev/checks/presentready.js`.

## How it works
1. **Full screen first.** The press is what lets a page go full screen, so Present goes full screen at once and shows
   the card on the big screen itself: the scene gets ready behind it at the size the show will draw.
2. **Getting ready…** (the card: "Getting ready… preparing effects · 64 %", **Start now**, **Bake for a perfect show**,
   Esc to cancel):
   - the song's analysis in;
   - every picture, video (its first frame decoded) and model in (three.js's loading manager, the page's pictures and
     videos, layers still loading);
   - every shader the layers draw compiled, through `compileAsync` (KHR_parallel_shader_compile), for every scene each
     renderer drew lately (precomps, FX, materials, visualizers, shapes, type are layers like any other), and every
     texture those scenes use uploaded (`initTexture`);
   - frames drawn at 8 moments across the song (12 for songs over a minute), so what the timeline shows later (a
     layer fading in, a cue's look) compiles now, then compiled again for anything new;
   - a short measured run at the two heaviest moments: frame gaps against the screen's own rate (read from the
     window's frames: 60 / 120 / 144 / 240 Hz). Holds = 95 % of frames within 1.25 frame times and at most 3 % over 1.5.
   The playhead goes back where it was (and plays again if it was playing).
3. **The show, live, at 100 %.** While presenting the preview holds full quality: no labadapt step, each layer at the
   scene's own resolution (Light mode and slow drags don't lower it), no fps cap (the screen's own rate), no doze
   (idlecpu). Background work waits (powerwise's new **quiet**): updates, cost / usage checks, idle websites in the
   window; backups and config watching in the main process; sync passes; tips (Hints say "presenting"); Freshen's
   offer. 🔁 Keep going, hooks, renders and the Lab's own timers go on. Esc puts it all back
   (the background timers come back one at a time).
4. **The bake, when live can't be perfect.** If the measure says this computer can't hold the screen's rate at full
   quality (or you pick **Bake for a perfect show**), the card says so and bakes: the scene rendered with the export's
   streamed encoder (renderfast) at the presentation's size (the scene's own frame shape fitted in the screen, up to
   4K) and the screen's rate, at most 120 fps, and **60 fps for pieces over 30 s** (the card says which). H.264 at the
   best quality; the Mac's / Windows' hardware encoder when ffmpeg has it (VideoToolbox / Media Foundation, high bit
   rate), x264 otherwise or if the hardware one fails. Progress and time left on the card; Esc cancels; **Present live
   instead** stops it. Then the video plays full screen with the song in it: frame-perfect, never late.
   **Baked = not live**: the mic, camera and slider moves don't react during the show (the card says so).
   A scene with no song bakes a perfect loop and plays it round.
5. **Keys in a baked show:** Space / F play-pause the video, ← → 5 s (Shift: one frame), Home the top, 1–9 the song's
   cues; Esc leaves (the Lab's playhead lands where the video was). The mouse hides after 2 s. The live preview rests
   (parked) behind the video.
6. **Bakes are kept.** The key is a hash of the scene compiled the export's way (every layer's code with the live
   slider values, keyframes, placements, looks, filters), the song file (path, size, date), the size, the rate and the
   kind. Present an unchanged scene again: the bake plays at once. Change anything: a new bake; the scene's older
   one goes to the Trash. At most 12 bakes / 4 GB (least recently used go first). They live in the Hearth folder's
   "Present bakes". An unreadable index is never written over and nothing is deleted then.

## Measured (dev/checks/presentready.js, SwiftShader under Xvfb, a shared machine: counts are exact, times are relative)
A heavy scene (a shader layer, a 2048² picture, a 🧊 model, bloom, and a layer that only shows from 3.5 s on the
song), an 8 s song, a 640 × 360 frame. The scene is run again (as if just opened), the song plays from the top, P.

| First 5 s of the show | Before (the old Present) | After (got ready) |
|---|---|---|
| Shaders compiled | **14** (+ 7 programs linked) | **0** (0 linked) |
| Textures uploaded for the first time | **9** | **0** |
| Frames drawn (SwiftShader) | 4 (the show stalled on compiles) | 25 (≈ 5 fps, p50 183 ms, p95 283 ms) |
| Quality | — | locked: level 0, every layer at its own resolution (share 1), no fps cap, no doze ("presenting") |

(Repeated runs: before 14–20 compiles / 7–10 links / 9–11 uploads; after always 0 / 0 / 0. A video's next frames,
"reuploads", are counted apart: they're the video playing.)
- Getting ready took 22–27 s on SwiftShader for this scene (≈ 9–10 s of it compiling 36 shaders / 18 programs and
  uploading 11 textures; 8 timeline moments warmed); a real GPU is ~50× faster.
- Background while presenting: websites, updater, backupauto's line, costcoach, usagelimits all waiting; none
  running; all armed again after Esc. Esc: the doze allowed again, labadapt stepping again (not held), Power quiet off.
- Bake (forced "can't hold", test rate 10 fps, half size: 740 × 416, 80 frames, with the song): 81 s on SwiftShader.
  Its frames vs the export's still of the same moment: mean difference **4.35 / 255** at 1 s and **4.15** at 2.5 s
  (H.264), vs **20.65** against another moment. Space / → / the 2 s mouse hide work on the video.
- Present again, unchanged: a cache hit, the show up in **0.75 s** (no getting ready, no bake). A slider moved: a
  new key, a new bake, the old file in the Trash, one bake left in the index for the scene.

## Upgrades
### Getting ready
1. **▣ Present / P gets the scene ready first**: a calm card on the big screen with what it's doing and a %.
2. Every picture, video (first frame) and model is loaded before the show.
3. Every shader the scene draws is compiled in the background first (parallel shader compile), every texture uploaded.
4. Frames drawn across the song first: what shows later in the timeline is ready too.
5. A short measured run at the heaviest moments: does this computer hold the screen's rate at full quality?
6. **Start now** on the card skips the rest; Esc cancels and leaves.
### The live show
7. 100 % quality held while presenting: no lighter steps, the scene's own resolution, the screen's own frame rate.
8. The preview never dozes while presenting.
9. Background work waits while presenting (updates, backups, sync, usage and cost checks, tips, Freshen's offer); Keep going, hooks and renders go on.
10. Esc puts everything back; background work returns one item at a time.
### The bake
11. **Bake for a perfect show** (the card, Present's right-click, `/present bake`): the show rendered to a video first, then played full screen with the song: no lag at all.
12. It bakes by itself when this computer can't hold the show live (and says why); **Present live instead** on the card.
13. The presentation's size and the screen's rate, 60 fps for pieces over 30 s (said on the card).
14. The Mac's / Windows' hardware H.264 encoder when ffmpeg has it, x264 otherwise.
15. Progress and time left while it bakes; Esc cancels.
16. Space / arrows / Home / 1–9 cues work on the baked video; the mouse hides after 2 s.
17. A scene with no song bakes a seamless loop.
18. Bakes are kept: an unchanged scene presents at once the next time.
19. A change (slider, keyframe, code, song, size) makes a new bake; the old one goes to the Trash; at most 12 / 4 GB.
20. `/present [bake | live]`.

20 upgrades.

## Tests
- `node dev/presentready-test.js` (UNIT): the key (stable across key order / clip ids / float noise; a slider, a
  keyframe, the code, the song's path / size / date, the size, the rate, the kind each change it), the cache (hit,
  stale, count and size limits, least recently used, junk index), the verdict, the screen's rate, the bake's rate and
  size, the moments, the progress, powerwise's hush.
- `dev/checks/presentready.js` (`sh dev/run-checks.sh presentready`): see Measured.

## Edits outside the new files
- `tools/three.js`: togglePresent goes full screen then loads the group (`getReady`), `api.present`, ready-* messages
  routed, Present's right-click row, syncPark parks behind a baked show, the stall check leaves a parked preview alone.
- `tools/three-sandbox.html`: RDY (GL compile / link / upload counters on the prototypes, the loading-manager count),
  `ready-*` messages, the lock in prQ / applyCap / adFull / adaptQuality / dozeWhy, the frame-gap recorder in tickFrames.
- `tools/three-cmds.js`: `/present [bake | live]`. `tools/three-export.js` / `-core.js`: `hw` (hardware H.264).
- `powerwise.js` (the scheduler's `hush`, `Power.hush`, `Power.quietNow`; kept tiny for the first-screen budget),
  `powerwisemain.js` (`power:quiet`, `quietNow`), `preload.js` (one IPC), `main.js` (sync waits a show out),
  `syncmain.js` (the 'quiet' hold has no 30 s limit), `hints.js` (busy: 'presenting'), `freshen.js` (no offer during
  a show), `lazy-data.js` (the group), `index.html` (the group's lazy-at tag), `dev/run-checks.js` (unit, lab line,
  own group).

## Risks
- Present now goes full screen and then shows a card for a moment (≈ 1–4 s on a real GPU, longer on a heavy scene);
  **Start now** skips it.
- Getting ready seeks the song across the timeline while the card covers the preview (the song is paused meanwhile and
  resumes where it was).
- The bake covers the scene as the export renders it (same frames as ⇪ Export); live inputs (mic, camera, MIDI,
  sliders) are frozen in a bake by nature. A picture file changed on disk under the same name doesn't change the key.
- Esc during a bake cancels the Lab's export queue's running render (bakes run through it, one at a time).
- Hardware encoders weren't tried here (Linux test machine, x264). A failure falls back to x264 once.
- The Stage window (second monitor) still presents live; getting ready is for ▣ Present.

## For the patch notes
- **▣ Present now gets your scene ready first.** A calm card on the big screen loads every picture, video and model,
  compiles every effect and warms the scene up across the whole song, then the show starts with nothing left to load.
- While presenting, the Lab holds **100 % quality** at your screen's own frame rate, and Hearth pauses its background
  chores (updates, backups, sync, tips) until you press Esc.
- If your computer can't keep up live, Present **bakes the show**: it renders it to a video at your screen's size and
  plays it with the song — perfectly smooth, no lag. It says why and how long it'll take.
- A baked show is **not live**: the mic, camera and slider moves won't react. Want live anyway? "Present live instead".
- Want a perfect show on purpose? Right-click ▣ Present › **Bake for a perfect show**.
- Bakes are remembered: present the same scene again and it starts at once. Change anything and it bakes again (the
  old video goes to the Trash).
- In a baked show: Space plays / pauses, arrows skip, 1–9 jump to your cues, the mouse hides after 2 s.
- Caveat: long pieces bake at 60 fps; the first Present of a scene takes a few seconds to get ready ("Start now" skips it).
