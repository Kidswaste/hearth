# inspodrop65: drag inspo into a chat as real pictures and clips

The owner asked: "let me drag & drop from the inspo drawer to the chats but instead of it being a .txt its an
image/video that can be inspected". Until now, a tile dragged from the board drawer into a chat attached a
`vibe · ….txt` (the reference described in words). Now the chat gets the media itself.

## Shipped
1. **Drag a picture tile into a chat → the picture itself.** The board's own file (or its cached copy) is copied into
   Hearth's attachments and shows as the normal picture chip with its thumbnail. It reaches Claude and Astra exactly
   like any attached picture (Claude: told to open it with Read in the attachments folder; Astra: `-i` / localImage),
   scaled to 1568 px at most when sent (attachlean).
2. **A picture that lives on the web** (a tile whose file is a web address) is downloaded once into the attachments;
   dropping it again reuses that copy.
3. **Websites and gifs** drop as their picture (the site's snapshot, the gif file).
4. **Drag a clip tile into a chat → its key frames + the file.** 4 frames for a clip up to 4 s, 6 up to 15 s, 8 beyond,
   evenly spaced from the first frame with the exact middle among them, 768 px long side. ffmpeg when present, else
   the window's `<video>` + canvas. One short line goes with them: "cuts.mp4: video, 6 s, 480×270; 6 frames attached
   as pictures, at 0:00.0, 0:01.0, …. File: <path>".
5. **A video chip in the chat box**: one chip with the frames strip (click the strip: play the clip; × removes the
   clip and all its frames).
6. **Several tiles at once** (a selection, a chat card) → each its own attachment; notes / colours in the selection
   come as their vibe text.
7. **The whole board**: drag the drawer's top strip (or click it › Attach its pictures & clips) → every picture and
   clip on the board.
8. **Token cap**: 10 media per drop (a plain note says how many were left out) and 24 pictures in all; clips share
   what the stills leave (2–8 frames each).
9. **The vibe text is still there**: hold **Shift** while dropping, or right-click a tile › **Attach as vibe text**
   (palette, light, motion… as before). Alt+drop is still Board eyes (small pictures with item ids). Notes and colour
   tiles always attach their vibe.
10. **Right-click a tile › Attach to chat → <AI>** (picture or "key frames + file"); the tile's → button attaches the
    media too. Tooltips say what a drag does.

## How it works
- `board-drop-core.js` (pure): media kinds, the per-drop plan / picture budget, `frameTimes` (key frames), frame sizes,
  the clip's line. Unit test: `node dev/inspodrop-test.js`.
- `board-drop.js` (`BoardDrop.attach(agentId, { boardId, itemIds })`): copies into `data/attachments` (cache in kv
  `inspo-drop`, via DataSafe), FrameRead for frames, a `Native.hooks.chips` hook draws the video chip. Both files are
  in the lazy `board` group.
- `board-drawer.js`: the drop handler picks media unless Shift; tile / strip menus and tooltips.
- Nothing is added to prompts unless the owner drops something; nothing is sent until they send.

## Tests
`dev/checks/inspodrop65.js` (fixture board: a picture, two clips, a "remote" picture served by smoke's new
`--serve-dir` local http server, a note; synthetic drags into the composer; the fake Claude's and fake Codex's
`attachinfo` list the pictures they got; frame colours checked against the clip's shots; no-ffmpeg path; several /
whole board / 12-picture cap / Shift / right-click). `sh dev/run-checks.sh inspodrop65` runs it with the board checks,
eyes-ui, journey-board, chat-media, attachlean, lazy, unit:boot-test, unit:datasafe-scan, unit:winmac-test (all pass).
board-chat, eyes-ui and journey-board now Shift-drop where they expect the vibe text.

Outside the board files: `dev/smoke.js` (`--serve-dir`), `dev/run-checks.js` (group, unit test, flag),
`dev/fake-codex.js` (`attachinfo` lists `-i` pictures), `lazy-data.js` / `lazy-meta.js` (group files, manifest),
`board-cmds.js` (the drawer command's description). No Codex files touched.

## For the patch notes
- **Drag a picture or clip from the board drawer into a chat and the AI sees it.** Open the drawer (the ▦ button in
  the rail), drag any picture tile onto the chat box: it attaches as the picture itself, with its thumbnail, instead
  of a text file. Pictures from the web are downloaded once for you.
- **Clips too**: drag a video tile and the chat gets a handful of key frames (shown as a little film strip on the chip;
  click it to play the clip) plus a line with the video's length and file, so Claude or Astra can tell you what
  happens in it.
- **Drag the strip at the top of the drawer** to send the whole board's pictures and clips (up to 10 at a time).
- **Want the old "vibe" text?** Hold Shift while you drop, or right-click a tile › Attach as vibe text.
  Right-click a tile › Attach to chat does the same as dragging.
