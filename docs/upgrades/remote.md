# Phone remote (round 24, remote): play the Lab and the live stage from your phone

Your hands are on the music and the Lab is across the room. Type **`/remote on`** (or right-click the preview →
🎚 Live (VJ) → 📱 Phone remote…). A small card shows a QR code, an address and a 6-digit code. Scan the QR code with
your phone on the same Wi-Fi and type the code once. After that the phone is remembered: open the address and you're in.
The page has the scene's sliders as big faders, an XY pad, the pads you use most, the set list with GO, and a small
live preview. Two phones can play at once. Nothing runs until you turn it on, and it turns itself off when nobody uses it.

Files: `remotemain.js` (the server, main process, loaded on first use), `remote-page.html` + `remote-page.js` (the
phone page), `remote.js` (the Lab side), `remote-cmds.js` (`/remote`), `remote-qr.js` (QR codes, no library),
`remote.css`. Lazy group `remote` (loads on first use).

## Turning it on
1. **`/remote on`**: starts the remote and opens the 📱 card (alias **`/phone`**).
2. **QR code** on the card: scan it with the phone's camera to open the page. It's drawn by Hearth itself, so no library or internet is needed.
3. **The address** under it (for example `http://192.168.1.23:47830/`). It has no secrets in it, so you can bookmark it.
4. **A steady address:** it tries port 47830 first, so the bookmark keeps working from one show to the next.
5. **Off by default.** Nothing listens until you turn it on.
6. **`/remote off`** (or Turn off on the card) stops it, and every phone is told.
7. **Turns itself off** after 10 minutes with nobody connected, or an hour with nobody touching anything. A note says so (`/remote idle 30` changes the 10).
8. **The 📱 pill** (bottom right, only while the remote is on) shows how many phones are connected. Click it for the card.
9. Ctrl/⌘+K: **Lab: Phone remote on (QR code)** · **Lab: Phone remote off** · **Lab: Phone remote: who is connected**.
10. **Right-click the preview → 🎚 Live (VJ) → 📱 Phone remote…** opens it from the stage menu.

## Pairing and devices
11. **A 6-digit pairing code** on the card. Type it on the phone once. It works for 5 minutes and for one phone.
12. **Name the device** while pairing ("iPhone", "iPad", "Android phone" filled in for you).
13. **Each phone gets its own key**, and both the phone and this computer remember it. Next time the phone connects on its own.
14. **The key never travels again.** Each connection gets a fresh challenge, and the phone answers it with a signature (HMAC-SHA-256) made from its key. Someone listening on the Wi-Fi can't reuse what they hear.
15. **Wrong codes are limited.** After 5 wrong tries the code changes and pairing pauses for 30 s. After 20, pairing stays off until you show a new code.
16. **Pair a new phone** on the card (or **`/remote pair`**) shows a fresh code.
17. **Who's connected:** the card lists each connected phone with its address and a **Kick** button. A toast says when a phone joins or leaves.
18. **`/remote kick <name>`** disconnects a phone. It can come back.
19. **Paired devices** (on the card, or **`/remote devices`**) lists every phone with when it was paired and last seen.
20. **Forget (revoke):** the card's Forget, or **`/remote forget <name>`**. The phone is disconnected, its key stops working, and it has to pair again.
21. **Keys stay on this computer.** They're kept in `data/remote` and never synced to the cloud drive. They're encrypted with the system keychain (Electron safeStorage) when the system has one.

## Kept to your network
22. **Local network only.** The remote listens on this computer's Wi-Fi or Ethernet address, never on every interface.
23. **Requests from outside private addresses are refused** (10.x, 172.16–31.x, 192.168.x and link-local are allowed). A router forwarding the port by mistake doesn't open it to the internet.
24. **No DNS-rebinding:** a request that names another host is refused.
25. **Only the remote page can connect:** WebSocket connections whose Origin isn't the page itself are refused, so another website open on the phone can't drive the Lab.
26. **The page is locked down:** a strict Content-Security-Policy (only its own script), no framing, no referrer, nothing cached. It serves only two files (anything else gets a 404) and answers only GET requests.
27. **Limits:** 8 connections at once, 64 KB per message, 240 messages a second per phone. A connection has 10 s to say who it is, and phones that went silent are dropped after 75 s.
28. **The phone can only play.** It can move sliders, press the listed pads, run the set list and open scenes. It can't run code, chat commands or anything else.

## The phone page (light: no framework, one WebSocket)
29. **Big touch faders** for the scene's sliders (the selected layer), with the value under each.
30. **Grouped** like the sliders panel (Colors, Formation, Particles…): one chip per group.
31. **Layer chips** when the scene has several layers. Tap one to play its sliders.
32. **Music meters:** a slider that follows the music (♪) shows a live green meter of what the music is doing to it.
33. **Multi-touch:** each finger moves its own fader, as many at once as you like.
34. **Soft takeover**, like the MIDI knobs: if your finger lands away from the value, the fader waits (a grey line marks your finger) until you pass through the value, so nothing jumps.
35. **Two phones at once:** a fader one phone moves follows on the other, about 8 times a second. If a phone's finger is held on a slider that something else moves (the other phone, a shuffle, your mouse), it has to pass through the new value again.
36. **Switches and choices** (on / off, option lists) are buttons that step to the next value.
37. **XY pad:** two sliders at once, chosen from two menus (remembered). The dot follows the sliders' real values.
38. **Pads:** 🎲 Shuffle, ↶ Back (the shuffle before), ❚❚ Freeze, ♩ Tap, 💾 Save, ■ Black-out, ✦ Next look, ▶ Play / pause. Freeze, black-out and play light up when they're on.
39. **BPM at the top:** shows the stage's tempo. Tap it to tap the tempo.
40. **Set list tab:** a big **GO**, ◀ previous, ▶ next, **Cut now**, **＋ This scene**. The list marks what's on screen (●) and what's cued (◌). **Cue** on any row.
41. **Scenes tab:** every scene with a search box. Tap a name to open it, or **Cue** it for the next GO.
42. **The scene's name** at the top (tap it for the scenes).
43. **Live preview:** a small picture of the Lab, about 4 frames a second, sent only while a phone shows it (▣ turns it off). It uses the Lab's own thumbnail pictures (small JPEGs), so it costs the Lab little.
44. **Remembers your tab,** group, XY sliders and preview choice.
45. **Reconnects by itself** after a Wi-Fi hiccup or when you come back to the page. It says so when the computer kicked it, turned the remote off, or forgot it.
46. **Light vibration** on pads (Android phones).
47. **Phone-shaped:** safe areas on iPhones with a notch, no zoom on double-tap, dark, with Forgeheart orange.

## Light on the Lab
48. **Moves are the hub's own slider moves** (the same path as a MIDI knob), batched once a frame on both ends: a phone sends at most one message a frame, and the Lab applies one value per slider per frame.
49. **Nothing runs while nobody is connected:** no loop, no frames, no listening. Updates to the phones (values, meters, tempo, set list) go out about 8 times a second, only what changed, with no DOM work.
50. **Slow phones are skipped** for preview frames instead of piling them up.

## For the chats
51. The app map (read on demand, no tokens per message) has one line on `/remote`.

## Measured / tested
`dev/checks/remote.js` (`sh dev/run-checks.sh remote`, in the lab group) starts the server on 127.0.0.1 and checks
that a socket from another Origin, one with no Origin and a rebinding Host are all refused (403), and that anything
but the page gets a 404. It loads the page in a hidden window as the phone. A wrong code is refused, then pairing
works and the code is used up. A far touch waits (soft takeover), then the fader moves the Lab's Glow to 0.19. Two
fingers move Spin and Size at once to 0.90. A second phone pairs, and phone A's move shows on phone B (0.80). The
card lists both. GO on the set list switches to the next scene, and the Freeze pad freezes. Preview frames arrive
(81 sent in the run). Kick shows "Disconnected by the computer". Forget sends the phone back to pairing with its key
erased. `/remote` and `/phone` work, there are no duplicate commands, and the remote turns itself off after 1.2 s
idle in the test setting. `dev/remote-qr-test.js` checks the QR maker against fingerprints that were matched module
for module with a reference encoder (python-qrcode, every mask, versions 1–10), plus the private / public address
rules. `labstage`, `labhub` and `qa-commands` pass.

## Notes and limits
- **Plain HTTP on the LAN**, because phones won't trust a self-signed certificate without setup. The pairing code is typed once and the key goes to the phone once, in the clear, at pairing. After that only signatures travel. Slider traffic isn't encrypted, so pair on a network you trust (your home or studio Wi-Fi, not a venue's open network).
- The first time you turn it on, **macOS / Windows may ask whether Hearth can accept incoming connections**. Allow it for private networks.
- The phone remembers the address it paired with. If the computer gets a new address on the network, pair again (the code takes a few seconds).
- Screen wake lock isn't available to a plain-HTTP page. Set the phone's auto-lock longer for a show.
- 100.64.x (Tailscale / carrier-grade NAT) addresses are refused, which keeps it to the local network only.

Count: 51 upgrades.
