# Round 16 · videoperf: Video Review, the editor, recording and renders, lighter and smoother

The work: ffmpeg now makes the pictures and sounds for the timelines in its own process, at low priority, and saves
them on disk. Clip tracks draw only what's on screen. Scrubbing sends the decoder one seek at a time. Heavy clips get
light proxies by themselves. Decoders let go of their files while Video Review is hidden. Recording draws its frames
in a worker. Renders run below normal priority. No feature was removed.

## Numbers (before → after)
Both runs used the same machine and the same check, `dev/checks/videoperf.js`, one straight after the other. The
machine was Xvfb + SwiftShader with 4 shared CPUs and a load average of about 15, because other agents were running
at the same time. Compare the numbers with each other. Don't read them as absolute timings.

| What | Before | After |
|---|---|---|
| Open a video until its filmstrip (24 frames) and waveform + beats are ready: neon_tunnel_v2 / drop_visual / square_loop | 13.2 s / 9.7 s / 5.3 s | 3.3 s / 2.8 s / 1.2 s |
| Main-thread blocking while those are made (Long Animation Frames, total of the 3 opens) | 7 413 ms (65 long frames) | 111 ms (8 long frames) |
| Open the first video again | 10.0 s, 710 ms blocking | 0.1 s, 0 ms blocking |
| Filmstrip frames decoded and JPEG-encoded on the window's thread | 24 per open (+ 8 per hover strip, 1 per card) | 0 (ffmpeg sprite, on disk) |
| Building a 10-clip edit (6 sources): blocking while its thumbnails and waves are made | 102 ms | 5 ms |
| Drawing the zoomed-in (×40) clip track | 2.22 ms a draw | 1.60 ms a draw |
| Scrubbing the timeline (60 pointer moves): seeks issued → decoded | 61 → 12 | 36 → 16 (lands on the same frame) |
| Videos holding a file while Video Review is hidden (after 45 s) | 3 | 0 (back at 1.500 s, the same frame) |
| ffmpeg render niceness (CPU priority, Linux) | −8 (same as the app) | 10 (below normal) |
| App during a 1080p x264 render: blocking | 643 ms in 3 s | 0 ms in 3 s |
| Recording: blocking on the window's thread while filming (2.5 s, the UI seeking) | 9 828 ms (7 long frames, worst gap 6.0 s) | 0 ms (worst gap 1.2 s) |
| JS heap with the 10-clip edit open | 10.0 MB | 10.1 MB (cached pictures are files, not data URLs) |

Notes. Playback dropped frames in this environment (48–56 of ~85) come from software GPU rendering, the same before
and after. The player in Video Review itself reports 0 dropped frames over a session (`/video-cache`). In some runs the
scrub showed long frames with no script attributed to them (style, layout and software raster of the video frame).
It was the same before and after, and none of it came from JavaScript. `dev/checks/smooth-video.js` gives the same
picture: the playing phase went from LoAF 10 / 3 459 ms blocking to 20 / 0 ms, because the filmstrip and sound no
longer decode on the main thread while you play.

## Upgrades

### The media cache (ffmpeg makes it once, off the window's thread)
1. **Filmstrip from ffmpeg.** Video Review's timeline strip is now one picture (24 frames) that ffmpeg makes in its own
   process at low priority. It's saved on disk, so opening the video again (even after a restart) is instant.
2. **Library card thumbnails from ffmpeg.** Each card shows a small picture file. There's no decoding on the window's
   thread and no data URL kept in memory.
3. **Hover-scrub strips as one picture.** The 8 frames of a card's hover scrub are one sprite. Moving the pointer
   shows one cell of it (`object-view-box`), so a hover sweep never swaps or decodes an image.
4. **Waveform and beats are saved.** The analysis of a file is stored on disk next to its pictures. A second open
   reads a few KB instead of decoding the whole file.
5. **Waveforms for big files.** ffmpeg pulls out just the sound (mono, 22 kHz, a few MB). Files over 300 MB now get a
   waveform and beats too; before, they had none. Without ffmpeg it works the old way.
6. **Long clips decode faster.** For long clips, ffmpeg only decodes keyframes to make the strips (many times faster).
7. **The cache can't grow forever.** It holds 1.5 GB at most and the oldest files go first. It lives in `data/ae/cache`,
   which cloud sync never sends.
8. **`/video-cache`** (alias `/video-perf`) shows how big the cache is, how many pictures were made or read back,
   how many were decoded here, how often decoders were let go while hidden, and the player's shown / dropped frames.
   `/video-cache clear` empties the cache (everything is made again when needed).
9. **Capped memory.** Card thumbnails (900), hover strips (60), sound analyses (30 + 40), sprites (80) and the
   editor's thumbnails (40 sources, always keeping the open edit's own) each have a limit instead of growing all
   session.

### Video Review
10. **Scrubbing that keeps up.** A new seek waits until the decoder finishes the last one, then jumps straight to the
    newest position. The decoder no longer works through a pile of positions you already passed, and the hover
    picture shows where the pointer is in the meantime.
11. **Hover scrub on the compositor.** The hovered card's scrub bar and the timeline's hover frame are their own
    layers, so a pointer sweep doesn't repaint the library or the transport.
12. **Lets go of its decoders while hidden.** After 45 s out of sight with nothing playing, the player, the B side
    and the editor's two decoders release their files (decoded frames and GPU memory, which is a lot with 4K).
    Showing Video Review again, or any command that reads the player, reloads the same frame.
13. **No more play() errors.** Starting playback while switching files or stopping a compare no longer logs
    "play() request was interrupted" errors.

### The editor (✂)
14. **Clip thumbnails from the cache.** One ffmpeg sprite per source, shared with Video Review.
15. **Clip waveforms and beats from the cache.** The same analysis Video Review uses, with no 300 MB read in the
    window.
16. **Virtualized thumbnail tiles.** Only the tiles on screen are drawn. A long clip zoomed in to frames used to draw
    every tile along its whole length.
17. **Virtualized waveforms.** Only the waveform pixels on screen are drawn.
18. **Scrubbing that keeps up on the track.** At most one seek per frame and none while the decoder is still busy.
    The playhead and time follow the pointer, and the last position always lands.
19. **Automatic proxies.** A heavy clip in the edit (over 1080p, over 40 Mb/s, HEVC, ProRes or DNx) gets a light
    copy by itself, made in the background one at a time at low priority. The preview switches to the copy when it's
    ready, and renders always use the originals. You see a short note when it starts and when it's done.
20. **Proxies in the simple preview too.** The plain two-decoder preview now plays proxies, not just the
    compositor preview.
21. **`/edit-proxy auto on|off`** turns automatic proxies on or off (on by default). The other `/edit-proxy` verbs
    are unchanged.

### Recording (capture)
22. **Recording frames drawn in a worker.** `capture-worker.js` reads the page capture, crops and scales each frame
    into the recording canvas (handed over with `transferControlToOffscreen`) and repaints it on a steady clock. The
    window's thread does no per-frame work while you film, so the UI being recorded stays smooth. If the worker can't
    start, the old in-window path runs.
23. **`Capture.status()` says which path is running** (`pump: 'worker' | 'window'`).
24. **The MP4 encode after a take runs at low priority**, so Hearth stays responsive while it finishes.

### Renders
25. **Renders run below normal priority.** Exports, renders, proxies and the cache's ffmpeg jobs run at nice 10 on
    Mac / Linux and BELOW_NORMAL on Windows. They still use every idle core, but the app comes first.
26. **After Effects renders too:** aerender runs below normal priority as well.
27. **Full speed when you need it:** `/renders rush on|off`, or the render menu's "More… → Full speed". It gives the
    next renders normal priority.

Count: **27 upgrades.**

## Under the hood (not counted)
- `videocachemain.js` (new, main side) holds the `video:media` IPC (thumbs, audio, get, set, stats, clear, prune) and
  `lowPriority()`. It's registered from `aemain.registerIpc` (no `main.js` edit). `preload.js` exposes it as
  `hub.video.media` (one line).
- `Review.media` (`sprite`, `analysis`, `draw`, `urlOf`, `stats`, `clear`) is shared with the editor.
- `VideoCut.releaseDecoders()`, `Review.sleepMedia()` / `wakeMedia()` / `asleep`, and
  `VideoPack.autoProxy()` / `setAutoProxies()`.
- New check: `dev/checks/videoperf.js` measures everything in the table above. It runs on older builds too: the new
  parts report "n/a".

## For the boot stream (index.html)
Nothing to add. `capture-worker.js` is a Worker script loaded by `capture.js` (`new Worker('capture-worker.js')`) and
is not a page script.
