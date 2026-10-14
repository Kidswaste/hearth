# capturefix (round 36): two open bugs fixed at the root

The two bugs bugbash2 found but left open: still screen recordings ending early, and missions typed offline going out
as plain messages. I also looked for other things the offline queue or the chat's own queue drop, and fixed those too.

## 1. A recording of a still area ended at its last change
**What you saw:** a 7.4 s take of a part of Hearth where nothing moved was saved as about 1.2 s. capture-pack failed
4 of 5 runs.

**Why:** both frame pumps (the worker and the window fallback) drew into a `<canvas>` and let the window's
`canvas.captureStream()` hand frames to the recorder. The worker's canvas was transferred with
`transferControlToOffscreen`; the window's canvas was never added to the page. A canvas capture stream only picks up
a frame when the **window itself paints**, and so does a `VideoFrame` made from a `<canvas>` that isn't on the page.
When nothing on screen animates, the window doesn't paint. The "repaint every 1/fps" calls (`drawImage(canvas)` +
`requestFrame()`) ran on time, but their frames never reached the encoder. Whether the bug showed depended on whether
something else happened to animate during the take, which made it intermittent. Probes on this machine before the
fix: a 7.3 s still take saved as 2.26 s (worker) and 0.53 s (window), even though the ticker counted ~215 repaints.

**Fix** (capture-worker.js, capture.js):
- The recorder's track is now a `MediaStreamTrackGenerator`. The worker gets its writable end, draws into its own
  `OffscreenCanvas` and writes a `VideoFrame` every 1/fps, stamped with the take's own time (pauses left out). The
  frames reach the encoder whether the window paints or not.
- The window fallback works the same way, with an `OffscreenCanvas` in the window. A plain `<canvas>` +
  `captureStream` is kept only for engines that have no track generator.
- When the picture hasn't changed, the next frame is a new `VideoFrame` built on the last one: the pixels are shared,
  not copied, so a still screen costs almost nothing. The canvases are CPU-backed (`willReadFrequently`). A
  GPU-backed canvas in the worker stalled the generator after 2 frames here.
- At most 15 frames can wait for the recorder. On a choked machine, frames beyond that are skipped instead of piling
  up: the take keeps its length at a lower frame rate.
- The encoder watchdog no longer counts a pause as missing frames. A paused take was being slowed to 15 fps after
  resuming.

**After** (ffprobe on the saved files, 7.3 s takes): still take worker 7.33 s / 222 frames, window 7.36 s / 222 frames
(largest gap 0.07 s); a take with the window frozen for 4.6 s keeps 7.40 / 7.35 s; pause 2 s / resume gives 5.26 /
5.32 s for 5.3 s recorded, no slow-down.

**Checks:** `dev/checks/capture-pack.js` has a new step 2b. It takes a 4 s still take in each pump and has ffprobe check
its length (within −0.5 / +1 s of the wall clock) and steady rate (≥ 70 % of 30 fps, no gap ≥ 0.3 s). The watchdog
step's length check now compares against the real wall time instead of "> 4 s".

## 2. A mission typed while offline went out as a plain message
**What you saw:** you picked 🐝 Swarm, 📢 Ask everyone or another helper mission, typed your message while offline,
and once back online it was sent as a normal message, or it failed silently inside the Swarm card.

**Why:** the offline queue held only text. A message with a mission skipped it ("goes the normal way"). It then
started the mission offline: a Swarm's seats failed inside the card and nothing retried them. Ask everyone queued
plain retries in each AI's chat, whose answers never reached the card. Split it up's retry lost its helper agents,
because the per-message setting was undone when the send failed.

**Fix:**
- **Typed while offline with a mission** (offline.js): the message waits in the offline queue with its mission. The
  mission is saved on disk with it, so it survives a restart. Its chip shows the mission's icon ("⏳ 🐝 …") and
  `/offline` lists it as "🐝 Swarm: …". Once back online it runs as that mission in its chat
  (`Missions.start`). A "next message only" mission is used up when the message waits, as it would be on a send.
  Clicking the chip puts the words and the mission back in the box. After a crash, a mission that was going out is
  matched in its chat by your words, so it never runs twice (`OfflineCore.reached`).
- **A mission sent as the chat's own message that then failed** (Split it up, Answer then review, Plan first, Explain
  like a teacher, Research on Astra): when the offline / busy retry sends it again, the mission's setup is applied
  again first (`Missions.arm`): helpers on, the review after, the ▶ Go ahead bar. Before, the retry only kept the
  words the mission adds.
- **Ask everyone that failed for lack of internet / a busy AI:** the AIs' chats are no longer re-sent as plain
  messages. The whole ask runs again **once** from the chat it was asked in, and the failed first try (your words, the
  all-failed card, the line) is replaced so nothing shows twice. If an AI answered meanwhile, it isn't asked of
  everyone again.

## Same class of bug, also fixed
- **The chat's own queue** (typed while a reply runs) dropped the mission: the queued message went out plain and the
  mission stayed armed for the next message you typed. A queued message now keeps its mission: its chip shows the
  icon, it runs as that mission when its turn comes, and it keeps it when it moves to the offline queue (a failed
  reply) or across a restart (native.js, offline.js).
- **One-message settings** (`/quick`, the "one message with other settings" commands in astra.js): they were used up
  by the failed send, so a retry went out with the chat's own settings. They're now kept on that message
  (`message.once`) and reused when it is sent again (offline retry, ⋯ Retry).
- Looked at and fine: **attachments** (a retry re-sends the packed text and pictures kept on the message; a message
  with files typed offline still goes the normal way and waits if it fails), **Lab / Hearth context and memory** (added
  when composed and kept in what's re-sent, or added when a waiting message is composed), **answer length**
  (per-AI setting, read at send), **the chat's model / effort / web** (per chat).

## Tests
- `capture-pack`: 7 of 7 passed (5 consecutive runs on the final code + 2 earlier), the `capture` group 7/7, `offline`
  (with new steps: Split it up re-sent with its helpers; Swarm typed offline waits with 🐝, survives the restart, runs
  as a Swarm once), `unit:offline-test` (+8: the item keeps its mission, a JSON round trip / reconcile keeps it, the
  restart match, the chat queue's missions), the `missions` group 4/4 (missions, missions2, swarmlean,
  unit:swarmlean-test), `dev/cache-test.js` (prompts unchanged).
- Probed by hand: Ask everyone failing offline → one re-run, the card "Claude done, Astra done", no duplicate; Answer
  then review typed while a reply runs → "⏳ 🔍" chip, then the reply and the review.

## Caveats
- The worker pump's frames reach the recorder through the window's thread (a transferred stream). While the window
  is frozen (a 4.6 s busy loop), no frames come through. The take keeps its full length, but that stretch is one
  held frame. Engines that offer a track generator inside workers would avoid this; this Electron doesn't.
- CPU-backed canvases: a captured change is read back from the GPU once. At 1080×1920 / 60 fps of constant motion
  that costs more CPU than the old GPU copy, and it runs off the window's thread. A still screen costs nothing.
- Collaborations (Swarm / Debate / Side by side / Pair / Jam) that **start online** and lose the internet mid-run
  still fail inside their card: the card's own "answer again" is the way back. Only messages typed while offline, and
  Ask everyone, wait and re-run.
- A mission waiting for a chat you've left opens that chat when it runs (missions run in the open chat).

## For the patch notes
- Screen recordings of a part of Hearth where nothing moves now keep their full length at a steady frame rate. Before,
  they could stop at the last change: a 7-second take came out about 1 second long.
- Recording a still screen costs next to nothing: an unchanged picture is reused instead of being copied again.
- Pausing a recording no longer makes Hearth think the encoder fell behind (it used to drop the take to 15 fps).
- A message you type offline with a mission (🐝 Swarm, 📢 Ask everyone, 📝 Plan first…) now waits with its mission
  and runs as that mission once you're back, even after a restart. Its chip shows the mission's icon.
- If the internet drops just as you send with Split it up, Answer then review or Plan first, the automatic re-send
  runs the mission again too: helpers, the review, the Go ahead bar.
- Ask everyone that fails for lack of internet runs again once, as a whole, when you're back, and replaces the failed
  try instead of sending plain messages to each AI.
- A mission picked for a message that waits behind a running reply now stays with that message (its chip shows the
  icon) instead of jumping to the next one you type.
- One-message settings (like /quick) survive a failed send and its retry.
- Caveat: tested with simulated outages, fake engines and a headless screen. A Swarm or Debate that starts online and
  loses the internet midway still shows its failed seats in the card.
