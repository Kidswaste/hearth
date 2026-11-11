# labplayer3 (Nov 11): the separate player is the normal way a scene runs

Quentin's call (his list's item 2): "Run the scene outside Hearth's window entirely … its own process and its own
graphics process … making it the normal way scenes run, not an opt-in", so a heavy scene can no longer make Hearth
itself lag. labplayer2 (Nov 10, `docs/upgrades/labplayer2.md`) found why the player drew black and fixed it; this round
makes it the default, with the old in-window way as the automatic fallback and as a setting.
Branch `claude/hungry-montalcini-6a79bf` (main merged in first: smooth176, engine177).

## What "the default" means

- **Where**: the Lab's live preview in Hearth's main window, on **Windows**. `window.hub.labPlayer.byDefault`
  (preload.js) is true there; the Mac keeps the in-window way until the player has been run on one (it never has).
  A second Lab window, the scenes chats run off screen (backstage), renders / exports and thumbnails are not moved:
  they still draw in Hearth's own graphics process.
- **The setting**: the Lab dock's PLAYER › SEPARATE / IN-APP, kept in `three.runIn` (`player` / `window`). The old
  `three.player` key is not read: the Nov 9 retirement had written `app` into it, which would have kept the owner
  in-window.
- **Test copies** (dev/smoke.js) keep scenes in their own window (`HEARTH_LP_DEFAULT=0`: every other Lab check reads the
  preview's frame); `HEARTH_LP_DEFAULT=1` runs a copy as the owner's app does.
- **No in-window page is warmed** at start when the scene will run in the player (`tools/three-boot.js` `warm`).

## The fallback (tools/three.js `playerFail`, `box.onPlayerClosed`)

The scene goes back into Hearth's own frame, by itself, when the player
- couldn't start (its app didn't come up in 15 s, or the call failed),
- didn't answer (its page never said ready within 15 s),
- didn't draw (a run was sent and no first draw came back in 25 s; a healthy page reports one within 1.8 s whatever
  the scene, even an empty one),
- stopped (its page's process or its app ended).

The owner is told in words, for example: "The scene's separate player stopped unexpectedly, so the scene now runs
inside Hearth's own window. Everything works as before; a heavy scene can slow Hearth down again. Hearth tries the
player again at its next start.", with a **Try the player again** button. The setting stays SEPARATE (the dock shows
IN-APP lit, which is where the scene is); a first draw in the player clears the count; three failures in a row switch
the setting to IN-APP and say so.

**Not caught**: a player whose window is on screen but shows nothing while its page keeps answering (labplayer2's
bug). From the inside that state looks healthy: the page runs, a capture of the window has the picture. Its cause is
fixed at the source; if it ever came back the owner would have to pick IN-APP by hand.

## What was built so a live scene keeps working

| | how it reaches the player | checked |
|---|---|---|
| run, live code edits, sliders, layer add / remove, look, quality, clock, song | the Lab's messages, through Hearth's main process (as the Stage window) | yes |
| what the AIs read back: the scene's picture (`three_shot`), errors, stats | the page's replies, the same way back | yes |
| ⏺ a recorded clip | the page records and sends the bytes back (317 KB for 1.5 s in the check) | yes |
| 🖥 Stage window | takes the scene (the player's app ends); closing it gives the scene back to the player | yes |
| ▶ Play, a baked preview | the player's window hides (`box.playerHide`) | no |
| 📷 Camera in | new: the two pictures per frame go as JPEGs (nothing can be transferred to another app), the page decodes them (`tools/three-motion-in.js` `relay`, the page's `fromJpeg`) | yes, with a made-up camera |
| 🎧 Live sound (system / mic) | analysed in Hearth's window and sent as numbers, as before | no |
| 🔊 Hearth's playback volume (round 176) | new: the player loads the same `volume-preload.js`, gets the level at start and each change (`labplayermain.js`, `labplayer/main.js`) | yes |
| a menu / popover / palette over the picture | new: the player steps aside only for what really overlaps the frame (a dialog always), and a still of the scene stays in the frame meanwhile; looked at on each click / key, not every 250 ms | yes |
| exact frame sizes | the page is zoomed (labplayer2) | yes |
| both formats | old WebGL layers and v2 / WebGPU | yes (edits and layer changes were run on the old format only; they use the same messages) |

## What does not work yet in the player (plainly)

- **Things Hearth draws over the picture** are under the player's window: the size pill, guides and safe zones, the
  scene editor's (✥) outlines and handles, direct manipulation. To use them: PLAYER › IN-APP.
- **A right-click or a file dropped on the picture** lands in the player's window, not in the Lab: no preview menu,
  no drop.
- **Keys typed at a scene**: the player never takes the keyboard (so Hearth's own keys keep working); a scene that
  listens to the keyboard gets nothing in the preview. ▶ Play is its own window and is not affected.
- **A picture of Hearth's whole window** (the capture tools, a bug report's screenshot) shows the frame without the
  scene. The AIs' own scene picture is unaffected.
- **Switching scenes / reloading** shows black for a moment instead of the in-window cross-fade.
- **Dragging Hearth's window**: the player follows a moment later. It is kept above Hearth's window, not owned by it.
- **Renders, the second Lab window, chats' off-screen scenes** still run in Hearth's graphics process: a heavy one of
  those can still slow Hearth.
- Not run at all: ▶ Play and ▣ Present with the player on, 🎧 Live sound, before / after compare, the Mac. Not
  measured: what the second app costs in memory.

## Proof that Hearth stays responsive

`dev/checks/labplayer.js`, the heavy scene (5 full-picture shader layers at 3840 × 2160, Max fps), Hearth's own window:

| run | idle | scene in the player | the same scene in Hearth's frame |
|---|---|---|---|
| Nov 10, on screen (a game also on the GPU) | 225 fps | 195 fps (worst frame 133 ms) | 44 fps (192 ms) |
| Nov 11, silent, the player as the default | 211 fps | 210 fps (71 ms) | 26 fps (200 ms) |

The step asserts ≥ 70 % of idle with the scene in the player; the in-window number is reported next to it.

## Checks

    HEARTH_LP_DEFAULT=1 SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --check-timeout 450000 --script dev/checks/labplayer.js

36 steps, all passing, silent (nothing on screen, no sound): the default, both formats, the table above, the fallback
(the player's page is crashed on purpose: the scene is back in the frame, the words are on screen, Try again works),
the heavy scene. Also: `dev/checks/motion-in.js` in-window (camera code touched): all steps but "/webcam file", which
writes to `/tmp/…` and so cannot pass on Windows; `node dev/boot-test.js`, `node dev/slim116-test.js`.

**Waiting on an on-screen run (needs the owner's OK, `--show`)**: everything in this round. Silent runs keep the
windows far off the screen, where labplayer2's black-window bug does not happen, so they cannot show that the picture
is really on the desktop. The Nov 10 on-screen runs proved that for the fix itself; since then `labplayer/main.js`
changed (zoom re-applied on every place, volume, the muted test player) and all of labplayer3 was added. What the
on-screen run would confirm: the scene visible over the frame after these changes, the still under a menu looking
right (no black flash, the right size at an exact frame size), and how the window follows a drag.

## Files

`tools/three.js`, `tools/three-boot.js`, `tools/three-motion-in.js`, `tools/three-sandbox.html`, `labplayer/main.js`,
`labplayermain.js`, `preload.js`, `dev/smoke.js`, `dev/checks/labplayer.js`, `HANDOFF.md`, `docs/patch-notes/round-178.md`
+ `index.txt`, this note.
