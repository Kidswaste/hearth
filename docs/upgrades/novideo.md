# No video player inside Hearth (round 17, "novideo")

You said: "remove the video director, it's too convoluted, makes the weight of everything heavier for no reason, and
I don't really need an inside player". It's gone. You now make videos in the **Lab sequence** (▤ Sequence on the Lab
timeline, `/sequence`). Finished files open in **your system's own player** (QuickTime, the Films & TV app, VLC…) or
show in **Finder / Explorer**. Recordings, renders, Adobe and chat media all still work.

Your files on disk stay as they were: video notes (`video-notes`), the Video Review library (`video-library`), video
projects (`video-projects`), the editor's cuts and sequences (`video-cuts`) and the Video Director's chats. Hearth
just doesn't read the first three any more. Your Lab sequences live in `video-cuts`, so they are all still there.

## Numbers
| What | Before | After | Change |
|---|---:|---:|---:|
| Scripts loaded before the first screen (index.html) | 109 | 85 | −24 |
| JS read before the first screen | 3,788 KB | 2,603 KB | **−1,185 KB (−31 %)** |
| Stylesheets before the first screen | 29 (510 KB) | 27 (456 KB) | −2 (−54 KB) |
| JS loaded after the first screen (lazy groups) | 2,943 KB | 3,145 KB | +202 KB (the Lab's sequence libraries moved in, see below) |
| App code in all (JS + CSS + HTML, without dev/docs/assets) | 8,373 KB | 7,339 KB | **−1,034 KB (−12 %)** |
| Files removed | | | 21 code files + 2 command clips (≈ 15,200 lines) |
| Chat commands / aliases | 988 / 340 | 805 / 255 | −183 / −85 |
| Ctrl/⌘+K actions / keys-sheet lines | 1,272 / 509 | 1,079 / 425 | −193 / −84 |
| Agent tools | video_* (13) + ae_* (2) | 0 | the `videoTools` MCP server is gone |
| Startup: ready (first screen) | 479 / 471 ms | 363 / 385 ms | **≈ −20 %** |
| Startup: interactive | 483 / 482 ms | 363 / 385 ms | **≈ −22 %** |
| Startup: main-thread busy | 825 / 915 ms | 783 / 771 ms | ≈ −11 % |
| JS heap after GC / DOM nodes / listeners (once loaded) | 7.4 MB / 1,722 / 289 | 6.6 MB / 1,652 / 279 | −0.8 MB |

(`node dev/perf-report.js --startup-only --no-stream`, two interleaved rounds of 5 reloads each, medians. The same machine also ran other agents' checks, so compare the
ratios.)

## What was removed
1. **The Video Review tab** (the ▶ rail tab and `tools/review.js`): the library, the frame-accurate player, notes and
   drawn notes, A/B compare, safe zones and crops, scopes, version stacks, contact sheets and its export menus.
2. **The cut editor inside it** (`tools/video-cut.js`, `video-comp.js`, `video-inspector.js`, `video-titles.js` →
   moved, `video-sound.js`, `video-edit-tools.js`, `video-pack*.js`, `video-cmds.js`, `cut-cmds.js`, `cut-edit-cmds.js`,
   `cut-ffmpeg.js`, `video.css`). All its tracks, transitions, keyframes, inspector, pro tools and exports are gone.
3. **The Video Director chat**: the dock agent (`dock: 'ae'`), `/director-setup video`, its dock chips and its scenes.
   An old Video Director in your config stays in `config.json` but no longer shows anywhere.
4. **The video agent tools**: `mcp/video-mcp.js`, the `videoTools` toolset (engines.js, `/director-cost`,
   `/director-tools`), the long-render routes in gamebridge.js and the video-director part of the system prompt.
5. **Video projects** (`/intro`, `/video-projects`, `/cut-downs`, `/post-text`, `/film`; `intro*.js`). Their edit,
   review and render steps were built on the cut editor. **Studio → Board → video** and the **Make a video** flow do
   the same job now, on the Lab sequence.
6. **Video flows** (`nodes-video.js`, `/video-flow …`, `/video-nodes`): the node graph of the Video Review pipeline.
7. **The After Effects toolkit drawer** that lived inside Video Review (expressions, scripts, aerender queue,
   calculators, comp presets, project finder, AE shortcuts; `tools/ae.js`, `tools/ae-data.js`). The AE bridge itself
   stays (see 18).
8. **The editor's thumbnail / waveform cache** in the main process (`videocachemain.js`, `hub.video.media`): only the
   editor used it.
9. **About 180 chat commands** of the player and the editor (`/video`, `/videos`, `/review`, `/cut`, `/editor`,
   `/transition`, `/add-title`, `/export-all`, `/safe-check`, `/review-astra`, `/board-from-review`, `/footage-editor`,
   `/send-clip`, `/lab-to-editor`, `/lab-music`…), their Ctrl/⌘+K lines and keys-sheet lines, the Alt-tucked buttons,
   their Commands-page examples and clips, their flows, tours, Discover tips and the app map topics (`video`, `editor`,
   `intro`).
10. **Dead CSS**: about 570 lines of Video Review / editor styling in polish.css, polish8.css, features.css, nodes.css
    and simplify.css.

## Where things went
11. **The Lab sequence keeps its libraries**: `tools/cut-data.js` (the edit model), `tools/cut-presets.js` (transitions,
    titles, looks…) and the title renderer (`tools/video-titles.js` → **`tools/cut-titles.js`**) now load with the Lab
    instead of before the first screen.
12. **`tools/cut-store.js`** (new, small): where the Lab keeps its sequences and footage cuts (kv `video-cuts`, the same
    store as before). Saves are debounced and flushed when the window closes.
13. **`tools/export-data.js`**: the export presets and ffmpeg arguments the render queue uses (was
    `tools/video-data.js`, trimmed to that).
14. **`/song-trim` and `/cut-loop`** (trim the Lab's song, save its loop as a file) moved to the Lab's commands
    (`tools/three-cmds.js`). `/cut-loop` now runs in the render queue.
15. **Lab footage → sequence**: the frames menu's "Editor" submenu is now **Sequence › As a new Lab sequence…** (opens
    it in the Lab), `/footage sequence`, `/footage-sequence`, `three_do footage { action: "sequence" }`;
    `/footage-back` takes a sequence's cut back. "Render the cut as a video" renders it with ffmpeg in the render queue.
16. **Capture**: a recording's menu (the player, the chat cards) says **Open in the system player**, **Show in Finder /
    Explorer** and **Add to the Lab sequence** (a footage clip at the end). "Open in Video Review", "Open in the editor
    timeline" and "Add to the edit" are gone.
17. **Renders**: a finished render's note has Open, Show in Finder / Explorer and Copy path. Right-click a render →
    **Adobe ›** (Premiere import, Media Encoder, After Effects). "Open it when it's done" opens the system player.
    `/renders open` replaces `/renders review` (the old word still opens the file). `Renders.whenDone(id)` is new for
    code that waits on a job.
18. **Adobe → Premiere**: `/premiere` (timeline / xml) and Adobe › Premiere Pro › **Send the Lab sequence (FCP XML)**
    export the **Lab sequence**. Its scene clips are rendered to videos first, so Premiere gets real footage.
    After Effects scripts from a chat ("Run in After Effects" on a code block) go through the Adobe bridge.
19. **Apps downloads**: a clip goes **on the board** by default, or opens in the system player ("▶ Open"). Runway clips
    land on the board. Suno's `/suno use open` opens a song in the player.
20. **Studio → Board → video**: its last step opens the render in your player.
21. **Makes**: a make's "Video" room is now a second Three Director chat that holds the Lab sequence (same name and
    mark, `<Name> · Video`).
22. **The "Make a video" flow**: Astra drafts the beats → a new Lab sequence in your format → "Build it" asks the Three
    Director to make one scene per beat on that sequence.
23. **Board clips**: right-click › **Open in the system player** / **Show in Finder**.
24. **Chat**: "Recent renders" in ＋ attach reads the render queue's history. Inline videos in replies still play
    (chat-media.js).
25. **/director** with nothing after it opens the Three Director next to the Lab. `/play` and `/pause` from a chat
    drive the Lab's song (on the board: its clips).
26. **Keys**: the keys sheet no longer lists Video Review or editor keys. qa-keys checks the board, the Lab, capture and
    the app-wide keys.

## Tests
- `node dev/lazy-manifest.js --check`: names 805, aliases 255, actions 1,079, keys 425, apps 49, tools 4, no duplicates.
- Deleted the checks that only tested removed code: `cut`, `editor`, `editor-more`, `editor-pack`, `editor-mcp`,
  `journey-editor`, `journey-video`, `intro`, `intro-more`, `nodes-video`, `smooth-video`, `video-live-webm`,
  `videoperf`, `seq2-export`, plus the unit tests `editor-test`, `editor-mcp-test` and `intro-test`. The
  `editor` and `video` groups are gone from dev/run-checks.js.
- Updated the shared ones (Video Review parts removed or re-pointed to the Lab sequence, CutStore, the render queue):
  lazy, qa-commands, qa-keys, qa-mac, renders, capture-lab, capture-extras, capture-record, adobe-ui,
  sequence-render, chatcore, journey-capture, labframes, labframes-more, sequence, seq2-scenes, assist, progress,
  makes, scenes, clutter, declutter, declutter-count, polish8 (+ tour, tour2, smooth), speed, qa-stream, qa-sweep,
  qa-ui, perf, apps-discover, journey-upgrade, flows-video; unit tests cut-test, director-mcp-test, makes-test,
  flows-test, renders-test and apps-unit-test.
- Ran: lazy ✓, qa-commands ✓ (no duplicate commands), qa-mac ✓, renders ✓ (+ renders-seq, renders-test), the capture
  group ✓ (capture-pack's "stalled encoder" timing step failed once on a busy machine, then passed), studio-recipes ✓,
  apps-windows ✓, adobe-ui ✓, sequence-render ✓, chatcore ✓, chat-media ✓, and smoke runs with no page errors.
  qa-keys: 118 keys pressed, 111 worked. "Ctrl+1 dead" fails the same way on the old build. "Lab · Shift+3 still
  running after 15 s" is the harness's lost input ack the check already describes: Shift+3 by hand takes 8 ms, as
  before. Unit: cut-test, director-mcp-test, makes-test, flows-test, sequence-test, adobe-test, apps-unit-test,
  boot-test, cmdpage-test all pass.

## Risks
- Video projects (`/intro`) were removed along with the editor they were built on. A chat's old project card shows as
  one line. Studio and the Make-a-video flow cover that job now.
- Editor sequences you made in Video Review and never opened in the Lab are still in `video-cuts`, but the Lab's
  sequence list only shows Lab sequences.
- Hearth no longer reads the old Video Review notes and library files (they stay on disk). Sync still copies them.
