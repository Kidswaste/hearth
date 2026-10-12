# Camera in (round 25, motion): your webcam, body, hands and face as a live Lab input

The Lab could already hear music. Now it can also see you. A webcam, a capture card or a video file becomes a picture
you can put in a layer (as a background, a cut-out, a glowing silhouette, motion trails) and a set of numbers any
slider, particle layer or shader can follow, the same way sliders follow a kick or the hats. You get movement
(overall, by region, which way), hands (where, open or closed, pinch), body (head, wrists, centre, turn, arms up), face
(mouth open, smile, blink) and your outline. Tracking runs on this computer and off the main thread. The camera is
off until you turn it on and nothing is recorded or sent. Nothing new sits on screen: it lives in **right-click the
preview › 📷 Camera ›**, **`/webcam`** (also `/camera-in`, `/tracking`), Ctrl/⌘+K ("Lab: 📷 …") and the curve
editor's sound picker. (This is a different thing from the round-9 motion-design kit, `/motion-kit`.)

Files: `tools/three-motion-in-core.js` (the tracking math, run in the preview's Worker, the hub and Node),
`tools/three-motion-in.js` (LabMotionIn: sources, the pill, pausing, the files, looks, menus, `/webcam`, the director
op), the "camera input" block in `tools/three-sandbox.html` (frames, the Worker, `webcam.*` for sketches), and
`motionmain.js` (MediaPipe's files in the data folder, the Mac camera permission). The hub files are in the lazy `lab`
group.

## How it works and stays light
- The hub captures the camera only after you turn it on. On each new video frame (`requestVideoFrameCallback`, at
  most 30 a second) it makes two ImageBitmaps, one to show (up to the chosen resolution) and one 256 px wide to
  track, and **moves** them into the preview (a transfer, so nothing is copied). The preview shows the newest one and
  passes the small one to its tracking Worker only when the Worker is free, so frames are dropped and never queued.
- The **light tracker** (always on, about 0.3 ms a frame at 96 × 72) uses frame difference on a small grey picture.
  It learns the camera's own noise, so grain doesn't count as movement. From it you get movement (overall, five
  regions, a 3 × 3 grid), where it moves (a weighted centroid), which way (one global Lucas–Kanade flow vector, the
  "optical-flow-lite"), a colour blob and a fading motion mask.
- **MediaPipe Tasks** (`@mediapipe/tasks-vision@0.10.14` and Google's float16 models): hand, pose and face
  landmarkers plus the selfie segmenter, about 27 MB in total. They are downloaded once into
  `<data>/motion/tasks-vision-0.10.14` only after you say yes, with the size shown first. They are loaded into the
  Worker from those files (the CommonJS bundle through `importScripts`, the wasm from a blob URL). Each task starts the
  first time a slider, a layer or a sketch reads one of its features. If the tasks together take more than about
  45 ms a frame (a slow computer, all four wanted), they run in turn, one per frame, and the others keep their last
  values.
- Features are only computed when something reads them. A slider following `pinch` asks for hands, a cut-out layer
  asks for the mask, and with nothing reading them only the light tracker runs.
- Measured headless (SwiftShader, 1–2 shared CPUs): light tracker 0.3 ms a frame. The real MediaPipe files loaded in
  the app's Worker: hands in about 5 s, all four tasks in about 13 s, and they ran on the fake camera's frames without
  errors. A frame with all four tasks took 0.5–2 s on this throttled CPU, which is where the in-turn mode kicks in.
  Not measured on a real Mac or PC.
- The Lab running long animation frames (over 50 ms) from the new code during the check: none.

## Upgrades

### Sources
1. **The camera as a live Lab input**: `/webcam on`, or right-click the preview › 📷 Camera › Turn the camera on. It's off every time Hearth starts.
2. **Device picker**: webcams and capture cards by name, with capture cards marked 🎛 (📷 Camera › Source, `/webcam devices`, `/webcam use <name or number>`).
3. The chosen camera is remembered. If it's gone, the default camera is used.
4. A webcam is mirrored by default and a capture card (Elgato, Cam Link, HDMI, Blackmagic, Magewell, AVerMedia…) isn't.
5. **A video file as the camera** (looped, tracked the same way): Source › Video file…, `/webcam file <path>`.
6. Resolution 480p / 720p / 1080p (📷 Camera › Resolution, `/webcam res 1080`).
7. Mirror on / off (`/webcam mirror off`).
8. On a Mac the system's camera prompt is shown, and if the camera is blocked you're told where to allow it.

### Privacy
9. **A red ● Camera pill** pulses on the preview while the camera is on. Click it (or right-click it) for its menu.
10. **It pauses while the Lab isn't on screen.** The camera's track stops, so its light goes off, and it comes back by itself when you return.
11. Pause / resume by hand (the pill's menu, `/webcam pause`).
12. **Nothing is recorded or sent.** Frames are moved into the preview and dropped after use.
13. **The director's pictures and saved thumbnails are pixelated** while the camera shows. Your own screenshots and recordings stay sharp.
14. `/webcam share on|off`: lets the director see the camera (off by default).
15. **A director asks you first** before it can turn the camera on.
16. Nothing is downloaded by itself: the tracking download asks first and shows its size.
17. If a scene reads the camera while it's off, you see one note with a "Turn the camera on" button. It never turns on by itself.

### Tracking (on this computer, off the main thread)
18. A tracking Worker in the preview, so the UI and the picture never wait for it.
19. **Movement** (`camMotion`), sensitive to small moves far away.
20. Movement by region: left, right, top, bottom, middle (`camLeft` … `camCenter`).
21. A 3 × 3 movement grid (`camZ0`…`camZ8`) for sketches.
22. **Where it moves** (`camX`, `camY`).
23. **Which way it moves** (optical-flow-lite: `camFlowX`, `camFlowY`, with 0.5 meaning still).
24. **Follow a colour**: a hue or #hex gives a blob's size and place (`/webcam color #ff2a2a`, Tracking › Follow a colour…).
25. Camera brightness (`camBright`).
26. The camera's grain is learnt, so a still dark room reads as still.
27. A fading motion mask for trails and silhouettes without models.
28. Without models, hand and body stand in as "where it moves", so the hand looks still follow you.
29. **MediaPipe, downloaded once** (≈ 27 MB, pinned versions) into the data folder, with a % in the notification (Tracking › Download…, `/webcam download`).
30. Each tracker loads the first time something reads it (hands, body, face, mask).
31. **Hands**: position (`handX`, `handY`). With two hands, hand 1 is the one furthest right on screen.
32. **Hand open / closed** (`handOpen`).
33. **Pinch** (`pinch`).
34. Hands seen (`hands`), the second hand (`hand2X/Y`), hands apart (`handSpread`), hand speed (`handSpeed`).
35. **Body**: head position (`headX/Y`), **head turn** (`headTurn`), head tilt (`headTilt`).
36. Wrists on the screen's left and right (`wristLX/LY/RX/RY`), body centre (`bodyX/Y`), body size (how close you are, `bodySize`), arms up (`armsUp`), someone there (`person`).
37. **Face**: mouth open (`mouthOpen`), smile (`smile`), blink (`blink`), eyebrows up (`browUp`), face position (`faceX/Y`).
38. Head turn from the face alone when no body is tracked.
39. **The person's mask** (selfie segmenter): `maskArea` and the mask itself for layers and shaders.
40. A slow computer runs the trackers in turn, one per frame, so nothing waits.
41. Values hold through a slow frame or a pause and rest when the camera is off (0, or 0.5 for places and turns).
42. Tracking: Auto (MediaPipe once downloaded) or Movement only (`/webcam tracker light`).
43. `/webcam remove-models` gives the space back.

### Features as Lab inputs
44. **Any slider can follow any camera feature** through the ♪ react-to mapping (curve, attack / release, threshold, invert, the live meter). The curve editor's sound picker has 📷 groups: Camera movement, Hands, Body, Face, Mask.
45. **`/webcam follow <slider> <feature> [amount]`**, smooth by default.
46. `/react-to` takes camera features too (`/react-to glow pinch 80%`).
47. In sketches: **`webcam.feat.handX`** etc., also `audio.feat.handX` and `audio.env('pinch', 20, 200)`.
48. `onHit('pinch', fn)`, `onHit('blink', fn)`: run code on a pinch or a blink.
49. **`webcam.layer(P, { mode: 'video' })`**: the camera as a layer (a background under the scene).
50. Mode `cutout`: just you, cut out (no green screen).
51. Mode `silhouette`: your shape as a glowing light.
52. Mode `trails`: what moves leaves a fading trail.
53. Mode `mask`: white on black, for other layers and particle emitters.
54. Mode `debug`: what the tracker sees (the mask, the grid, where it moves, hands, head).
55. Camera layer sliders, all live (keyframes, Shuffle, Save): opacity, zoom, x / y, fit, brightness, contrast, saturation, hue, blur, colour, glow, soft edge, fade.
56. **`webcam.texture()`**: a THREE texture that follows the camera (shader uniforms, materials).
57. `webcam.maskTexture()`: the person's (or movement's) mask as a texture.
58. `webcam.points`: the hands' palm points.
59. **Particles from you**: an emitter that follows a hand, or particles born on your silhouette (the particle layer's "layer" emitter on a silhouette layer).

### Looks (📷 Camera › Looks, `/webcam looks`, `/webcam look <id>`)
60. **Particles follow my hands** (`hands-particles`): a ✦ particle cloud whose emitter follows your hand.
61. **Sparks off my silhouette** (`body-sparks`): a glowing silhouette with sparks rising off it.
62. **Silhouette glow** (`silhouette-glow`): your shape as light (additive).
63. **Motion trails** (`motion-trails`): what moves paints fading trails.
64. **Head turns the camera** (`head-camera`): your head turn drives the scene's orbit / turn / spin slider.
65. **Mouth opens the bloom** (`mouth-bloom`): your open mouth drives the bloom / glow slider, and a glow layer is added if the scene has none.
66. **Camera as the background** (`camera-bg`).
67. **Me, cut out** (`cutout`).
68. **Move to grow** (`move-grow`): movement drives size.
69. **Pinch to zoom** (`pinch-zoom`).
70. **Hands apart, bigger** (`hands-apart`).
71. **Smile shifts the colour** (`smile-color`).
72. **Blink flash** (`blink-flash`).
73. **Wave to speed up** (`wave-speed`).
74. **What the tracker sees** (`debug`).

### Chat, menus, directors
75. **`/webcam`** (aliases `/camera-in`, `/tracking`) with completion for every verb, look and feature. On its own it tells you the state or what it sees.
76. `/webcam now`: what it sees right now (bars, fps, the tracker, ms a frame).
77. `/webcam names`: every feature, for sliders and sketches.
78. `/webcam looks`: one picker for the looks.
79. **Right-click the preview › 📷 Camera ›**: on / off, pause, Looks, Source, Mirror, Resolution, Tracking (Auto / Movement only / Download / Follow a colour), Share with the director, What it sees now.
80. Ctrl/⌘+K: Lab: 📷 Camera on / off.
81. Ctrl/⌘+K: Lab: 📷 Camera looks.
82. Ctrl/⌘+K: Lab: 📷 Camera source (webcam, capture card, video file).
83. **`three_do motion { op: camera | track | follow | look | looks }`** for Claude and Astra. The same tool as the motion kit, so the lean tool list grew by 2 tokens (1,689 / 1,700).
84. **`three_do help webcam`** gives the whole camera API on demand (also `hands`, `pose`, `face`, `mediapipe`, `tracking`, `mocap`, `silhouette`…). `help motion` points to it, and the app map knows it.

Count: 84 upgrades.

## Tests
- `node dev/motion-in-test.js` (unit group, 34 checks). The light tracker on generated frames: still noise isn't movement, a moving square gives the right regions, place and flow, mirrored and not, plus the colour blob. MediaPipe-shaped results go through the converters: two hands, fist / open, pinch, pose turn / wrists / arms up mirrored and not, face blendshapes, a segmenter mask. Also the help topic, and `motionmain.js` against a local HTTP "CDN" (status, a partial download, reading the bytes back, no half files left, remove).
- `dev/checks/motion-in.js` (lab group, 38 steps, in the app) uses a fake camera: `getUserMedia` is stubbed with a canvas stream of a white square, and `enumerateDevices` lists a webcam and a capture card.
  - It's off by default. `/webcam on` gives frames and the pill.
  - Movement on the left and on the right, where it moves follows the square (correlation 0.98), still reads as still, and mirrored is flipped.
  - `/webcam follow size camMotion` grows the slider in the preview (1 → 3.3).
  - "Particles follow my hands" puts the particles' centre at x −2.1, then +2.05, as the square moves.
  - A camera layer shows the picture. The director's pictures are pixelated, and not once shared.
  - MediaPipe's path, using a stub bundle through the real Worker code: hands / pinch move a slider, then face (mouth) and the mask load when read.
  - The download offer appears and is never started by itself.
  - The `three_do motion` ops work (`list` still reaches the motion kit). The camera pauses with its track stopped when the Lab is off screen and comes back.
  - A recorded webm works as a video file. `/webcam off` stops it. No slow frames from the new code.
- `dev/checks/motion-in-real.js` (optional) uses the **real** MediaPipe files when they're in `/tmp/hearth-mediapipe`. All four tasks load in the preview's Worker and run on frames without errors (passed here; it skips without the files).
- `sh dev/run-checks.sh labgpu smooth-lab qa-commands` passes, and `node dev/director-mcp-test.js` passes (lean list 1,689 ≤ 1,700). `node --check` was run on every touched file, the sandbox's module scripts were syntax-checked as modules, and `node dev/lazy-manifest.js` was regenerated (its compare passes).

## Not done / risks
- Not tried with a real webcam, a real capture card or on a real Mac / PC GPU. Detection quality was only checked through the stub and the converters' maths. The real MediaPipe was checked loading and running, not finding a real hand (a drawn square has none).
- The Stage window (second screen) doesn't get the camera yet: frames go to the Lab preview only (the hub skips them while the Stage window shows).
- Exports and offline renders have no camera (no live frames there). A camera layer exports as transparent.
- Light mode's "hand" is where the movement is: two moving things average out.
- The pixelation covers the director's whole picture while a camera layer or texture shows, not just the camera's part.
- The MediaPipe download needs jsDelivr or unpkg (the library) and storage.googleapis.com (the models). `HEARTH_MOTION_FILES=<folder>` copies them from a folder instead.
