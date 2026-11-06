# Round 136 · phone136: 📱 See it on my phone

The owner's ask: check a render or the live preview on his phone, over his own Wi-Fi. Many of his visuals are
vertical reels made for phones, and a phone screen shows them as people will see them.

## What existed (checked first)
- **The phone remote** (round 24: `remotemain.js`, `remote.js`, `remote-page.*`, `remote-qr.js`, `remote.css`): a
  small web server on the local network for **playing** the Lab from a phone (faders, pads, set list). It is bound to
  this computer's LAN address (`lanAddress()`: private IPv4, never 0.0.0.0) and refuses requests from outside the
  private ranges and requests that name another host. It pairs with a 6-digit code and a key per device, and the
  phone sees a small preview of **JPEG frames over its WebSocket** (about 4 a second, at 360 px, from
  `ThreeLab.director.shotSmall`). `remote-qr.js` draws QR codes without a library. This was the best fit and is
  reused: the address rules (`isPrivate`, `lanAddress` are exported from `remotemain.js`), the QR maker, and the card's
  look (`remote.css`). It is built to control the Lab, and it has its own pairing, so phone136 is a sibling server
  rather than more routes on the remote's server.
- **The Stage window** (`stage:open` in `main.js`): the Lab's sandbox page in its own window, for a second screen.
  It is a local window and has no network side.
- **◉ Perform** (round 131): uses the Stage window or full screen. It has no network side.
- **Render outputs** (renderpre131 and the render queue `renders.js`): the files go to the renders folder, and the
  queue's done note offers Open / Folder / Copy path / 📮 Post.
- **Deploy** (`deploymain.js`, round 14): publishing to Vercel, Netlify, Cloudflare and GitHub through their CLIs.
  This sends things to the internet, so phone136 **does not use it**.

## What's new, and where the owner clicks
- **A render: 📱 Open on my phone.** When a render finishes, its note has a **📱 Phone** button next to Open / Folder /
  Copy path / 📮 Post. The render queue row's right-click menu has **📱 Open on my phone** too. This works for MP4,
  MOV and WebM files.
- **Live: 📱 Live on my phone.** Right-click **▣ Present** and choose **📱 Live on my phone** (the row under ◉ Perform).
- Both open **one small card** at the bottom right. It also shows over ▣ Present when Present is full screen. The card has:
  - the **QR code**. Scan it with the phone's camera on the same Wi-Fi;
  - the **local address** (e.g. `http://192.168.1.23:47840`);
  - **"waiting for your phone…"**, then **"● connected: 1 phone"**;
  - a line saying what plays: "Plays “Reel – Vertical reel – ….mp4” on a loop", or "Live from the preview ·
    1080×1920 · the song plays here";
  - **■ Stop**, and ✕, which also stops.
- **On the phone.** A render plays full screen, looping and muted at first so it can start by itself. **🔇 Sound**
  turns the sound on and **⛶** goes full screen. Vertical videos fill a phone held upright. In Live, the Lab's
  preview streams to the phone (up to about 12 pictures a second, 720 px on the long side) with "● live from Hearth ·
  1080×1920" (the scene's real frame size). The song plays on the computer. When the computer stops sharing, the
  phone says so.
- No new toolbar: one button on the existing done note, one row in an existing menu and one row in Present's menu.
- **The AI is not involved.** No tool, no prompt text, and no tokens.

## Safety
- **Nothing is uploaded and nothing leaves the local network.** The server listens on this computer's Wi-Fi /
  Ethernet address only (the remote's `lanAddress()`: a private IPv4), never on 0.0.0.0 or a public interface.
  Requests from outside the private ranges (10.x, 172.16–31.x, 192.168.x, link-local) are refused, and so are requests
  naming another host (DNS rebinding). A test may bind 127.0.0.1. Any other host is refused. With no private network,
  it says "No local network found" and opens nothing.
- **A one-time token in the QR code.** Each share gets 128 random bits, and every request needs them (`/v/<token>/…`).
  A new share (another render, or Live) gets a new token, and the old link is dead. There are no passwords and no
  pairing, and nothing is remembered on either side. The page has a strict CSP (only its own script), no referrer,
  no framing and no caching. It answers only GET and HEAD, and only five paths under the token.
- **It only runs while the card is open.** It stops with **Stop**, with ✕ (closing the card), and after **30
  minutes with nobody watching** (a page left open pings, and a live stream counts as watching). It also stops when
  Hearth's window reloads or closes. Nothing starts by itself.
- **Windows Firewall.** On Windows, the first time, a plain note comes before anything opens: "Windows Firewall may
  ask whether Hearth can use your network. Tick 'Private networks' (your home Wi-Fi) and click Allow." It is shown
  once (`phone.firewallTold`).
- **No installs.** It uses no new program or package. The phone needs only its browser.

## Files
- New: `phoneviewmain.js` (main, `lazyIpc`: the server, the token, ranges for the video, the MJPEG stream, idle,
  status, the test hooks), `phoneview.js` (window: the card, the firewall note, live frames while a phone watches),
  `phoneview.css`, `phoneview-page.html` + `phoneview-page.js` (the phone's page).
- Lazy group **phoneview** (`tier: 'use'`, after `remote` for its QR maker and card look) in `lazy-data.js`
  (+ manifest), the `lazy-at.js#…,phoneview` tag in `index.html`, `docs/lazy-groups.md`. First screen: 62 scripts,
  1584 KB of 1586 KB (`lazy-data.js` grew by its one group line).
- `main.js`: the `lazyIpc('phoneviewmain.js', …)` line. `preload.js`: `hub.phone`.
- `renders.js` (marked): 📱 Open on my phone in a video's actions; the done note shows 5 buttons (was 4) so it fits
  next to Copy path and 📮 Post.
- `tools/three.js` (marked): the 📱 Live on my phone row in ▣ Present's right-click menu.
- `HANDOFF.md`: one line under "Windows and pages".
- `dev/checks/phone136.js` and the `phone136` group in `dev/run-checks.js`.
- `dev/checks/perform131.js`: the settle wait (below). The app's Perform code is unchanged.

## perform131's flaky full-screen step
The check read the window's state as soon as the strip showed. `ThreePerform.start()` builds the strip, *then* awaits
`requestFullscreen()` (or the whole-window fallback) and only then sets the screen's own rate. Alone, that happens
within the same moment. With another Electron check running at the same time, the read came first: `full: false,
fps: -1`. The step now waits for the window to settle (`fps 0` and full screen / whole window), **load-aware with
`dev/loadwait.js`** through smoke. It waits 10 s on a calm box, and 40 s more only when the wait was the box's (the
smoke process waited for a CPU, or the load average is ≥ 0.75 per CPU). The step's info now shows `settle: { ms, load,
ok }`.

## Tests
One check, **`dev/checks/phone136.js`** (group `phone136`, ≈ 52 s). A hidden window is the phone, on 127.0.0.1,
because this box's only other address is 192.0.2.2 (not a private LAN):
1. The entry points: the done note has 📱 Phone (with Open / Folder / Copy path / 📮 Post). ▣ Present's menu has 📱
   Live on my phone. Here, with no private network, it says "No local network found" in plain words and opens nothing.
2. A render (the 540×960 fixture video): the address carries a 32-hex token. The card shows the QR, the address,
   "waiting…" and Stop. The page (with its CSP) and the video in byte ranges (206) are served with the token. Without a
   token, with a wrong one, or naming another host: 403. The phone page plays it (540×960, looping, currentTime moving).
   The card shows "connected: 1 phone". A phone page without the token gets "This link has ended" and no video.
3. Live: a new token, and the render's old link is refused. The phone shows the frames (21 in 2 s, ≈ 10 a second, 405×720
   for the 1080×1920 scene) and "● live from Hearth · 1080×1920". The raw stream is multipart/x-mixed-replace with
   JPEG parts. The card shows the size and "connected: 1 phone".
4. ■ Stop: the server is off, the card closes, the phone page says the computer stopped, a new connection is
   refused (ECONNREFUSED), and no more frames are taken.
5. Idle: a 1.5 s timeout (test copies only, 30 min otherwise) stops it in ≈ 1.6 s with "nobody watched for 30 minutes".
6. Local only: bound to 127.0.0.1 (not 0.0.0.0). This box's other address (192.0.2.2) can't reach it
   (ECONNREFUSED). The hosts 0.0.0.0, 192.0.2.2 and 8.8.8.8 are refused, and the running share is untouched.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock /tmp/hearth-run.lock … run-checks.js --exact`):
- `phone136` ✓ (52 s), and ✓ again while perform131 ran at the same time;
- `perform131` ✓ three times: alone (59 s), **at the same time as phone136** (59 s, settled in 92 ms), alone (57 s);
- `remote` ✓ on its own run. In a row of other checks it failed once on its "kick" step (a 4 s wait for the
  kicked phone's page). It doesn't touch anything phone136 changed;
- `unit:remote-qr-test` ✓, `renderpre131` ✓ (71 s);
- `node dev/boot-test.js` ✓ (3074 checks; first screen 62 scripts, 1584 / 1586 KB);
- `node dev/lazy-manifest.js`: names, aliases, actions, keys, apps and tools match the lazy build;
- `dev/slim116-test.js` ✓, `dev/selfmap118-test.js` ✓.

## For the patch notes
- **📱 See it on your phone.** When a render finishes, click **📱 Phone** on its note. Scan the QR code with your
  phone (on the same Wi-Fi) and the video plays full screen, on a loop. That's perfect for checking a vertical reel
  the way people will see it.
- **Live on your phone.** Right-click **▣ Present** and choose **📱 Live on my phone**. Your phone shows the Lab's
  picture as it plays ("live from Hearth · 1080×1920"), and the song plays on the computer.
- The small card shows the QR code, the address and when your phone is connected. **Stop** (or closing the card)
  ends it, and it also stops by itself after 30 minutes with nobody watching.
- **It stays at home.** It only works on your own Wi-Fi, with a fresh code in each QR. Nothing is uploaded and
  nothing goes on the internet. On Windows, the first time, Windows may ask about your network: choose Private
  networks and Allow.

## For Codex
- No Codex-owned file was edited: `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
  `cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged.
- Nothing new syncs and no store moved. The only setting is `phone.firewallTold` (the app's store, Windows only).
  Shares live in memory and end with the card.
- Astra and Claude are not involved: no tool, no prompt part.
