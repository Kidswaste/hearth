# capturelab (round 57): recording the Lab while it moves gets every frame again

The check `capture-lab` failed on "the moving Lab sends frames" on round 56 (12138e4) and round 55 (c09e048). This
stream found why. The app was wrong, and the check was also measuring at a bad moment. Recording the Lab while it
plays (the owner may record or stream it) could save a take that barely moves. Under load, one 3 s take saved as a
single frame.

## What broke, and when
- **The breaking commit: `e086ae0` (round 36, capturefix, "still takes keep their real length").** It changed the
  recording worker (`capture-worker.js`). Since then, on every tick of the take's clock, the worker makes a
  `VideoFrame` of its canvas. That canvas holds the captured window frame, which lives on the GPU. Making the
  VideoFrame forces a read-back of that frame, and the worker waits for it. The GPU process is busy drawing the Lab's
  own frames, so each wait took 0.5–1.4 s here (software GL). While the worker waited, two things stalled:
  - the clock: 4–12 frames in 2 s instead of 60;
  - the reader: captured frames were dropped.
  
  The take came out nearly still. Measured with the new check on the old worker: frames 2 and 21 of the take differ by
  0.0001 (a still picture), and the clock wrote 4 frames out of the ≈ 69 due.
- **Before e086ae0** (`e086ae0~1`, same machine, same load), the old worker kept its clock: 38–92 frames out of
  ≈ 60 due.
- **Why it looked like an "older break" with no clear start:** `dev/run-checks.js` only started failing checks on a
  non-empty `"errors"` list in round 43. Before that, capture-lab failed silently: the round 37 tree, run with its own
  runner, "passes" with `"errors": ["the moving Lab sends frames"]` in its log. Rounds 44 and 48 reported it passing
  "when run again": the count is close to the threshold, so a quiet moment could get it over.
- **labcanvas56 is not the cause.** The window recording reads what the compositor shows, not the Lab's canvases. The
  Lab's own recorder (`startRecording` in the sandbox) and the OBS frames (`obs-shot` → `frameSoon` → `composite` →
  `glFresh`) already read a fresh frame each time:
  - right after the layers' frame when one is coming;
  - drawn again at once when none is coming (a still, dozing scene).
  
  Nothing runs when nothing captures (the OBS pump runs only while it has viewers). Left as they are.

## The fix (`capture-worker.js`)
- **Captured frames are copied to memory asynchronously** (`VideoFrame.copyTo`, RGBA, only the target's crop). The
  GPU process answers when it can, and the worker's thread keeps ticking meanwhile. Frames that arrive while a copy
  is under way replace each other: the newest one is drawn, and every arrival is still counted.
- **The pixels stay in memory.**
  - A take at the target's own size keeps the copied pixels as they are. The crop snaps to the take's size when it is
    within 2 px of it (the size is rounded to even numbers).
  - A take that must be scaled goes through two memory canvases.
  - The encoder gets an in-memory `VideoFrame`. A VideoFrame made of a canvas becomes a GPU image, and making one
    waited 0.3–0.6 s too.
- **The clock starts at the first picture**, which is copied the same way. A take never starts black, and the first
  frame no longer stalls for seconds.
- **Fallbacks:** an engine without RGBA `copyTo` draws as before (the old path), and the window-thread pump is
  unchanged.
- **No cost when nothing records:** the worker exists only during a take. Nothing changed in the Lab, the OBS path or
  the window's thread.

## Measured (4 shared CPUs, software GL, load 25–38 from other streams)
| A 2–3 s take of the moving Lab (9:16) | Before (HEAD) | After |
|---|---|---|
| Clock frames written / due | 4–12 / ≈ 60 (7–20 %) | 22–100 / ≈ 60–90 (33–100 %) |
| Time to make one frame for the encoder | 250–1400 ms (GPU read-back) | 0–30 ms (spikes are the worker waiting for a CPU) |
| The take moves (difference between its first and last frames) | 0.0001 (still) | 0.016–0.024 |
| Frames from the page capture | 0–3 | 3–8 (bounded by the Lab: it draws 1–4 frames a second here while captured) |

## The check (`dev/checks/capture-lab.js`)
- **Counted over the whole take.** "The moving Lab sends frames" now reads the frame counts right before stop. Before,
  it read them 1.5 s in, and the worker reports only twice a second.
- **The threshold.** It stays at more than 3 frames. A take also passes when the capture got at least a third of the
  frames the Lab itself drew during the take, with at least 2. Under this machine's load, the Lab draws 1–4 frames a
  second while the window is captured.
- **New: "the take's clock keeps going while the Lab moves"**, at least a quarter of the frames due. This fails the
  old worker (4 of ≈ 69).
- **New: "the recording shows the Lab moving"**: `FrameRead.diff` of frames 2 and the last − 3 must be over 0.002.
  This fails the old worker (0.0001).

## Tests
- `capture-lab`, after the fix:
  - at load ≈ 30: 3 passes (the final version twice in a row);
  - under the shared run lock at load ≈ 3: pass, with 23 frames in from the page capture, 60 out, and 30 drawn by the
    Lab.
- The old worker with the new check fails all three motion steps.
- All passing (run under `flock /tmp/hearth-run.lock`):
  - capture: `capture-record`, `capture-extras`, `capture-shots`, `capture-more`, `capture-pack`, `capture-frames`,
    `journey-capture`;
  - OBS: `interop`;
  - renders and exports: `renders`, `renders-seq`, `labexport`, `sequence-render`, `renderfast`;
  - the Lab: `labcanvas56`, `labplay55`, `lazy`.
- `capture-record` failed "a steady 30 fps" on the base at load 38. It passed after the fix, at a lower load.
- Not run: `motion-render` (a ≈ 15-minute webcam-tracking render, not on the capture path) and `streamrender` (chat
  Markdown; it only matched the name filter).
- Unit: `unit:boot-test`, `unit:capture-test`, `unit:capture-mcp-test`: pass.

## Risks
- RGBA copies cost a little CPU per captured frame: a 2.4 MB copy for an 806 × 746 crop, only for frames that
  change. Before, the same pixels crossed from the GPU synchronously.
- Takes scaled to a social size or 1080p are scaled on CPU canvases instead of the GPU. The quality is the same, at
  'high' smoothing.
- The window-thread fallback pump (used only when the worker can't start) still reads frames the old way.

## For the patch notes
- Recording the Lab while your scene plays keeps every frame again. On a busy graphics card a take could come out
  nearly frozen, or even as a single frame.
- Recordings no longer wait on the graphics card for each frame. They keep a steady rate while the Lab draws.
- A recording starts on its first real picture, never on a black frame.
- Streaming the Lab to OBS and the Lab's own recorder were checked: they already read a fresh frame every time, and
  cost nothing when nothing captures.
- A check now makes sure a recording of the moving Lab really moves.
