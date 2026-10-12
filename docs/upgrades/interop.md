# Interop (round 25, interop): the Lab plays well with your other tools

You perform music visuals in the Lab. This stream connects it to the rest of a live rig: **OSC** both ways
(TouchDesigner, Ableton, Resolume, TouchOSC and phone apps drive the Lab; Hearth sends the beat, the kicks and the
sound's features back), **MIDI out** (clock and cues for lights, synths and drum machines), **OBS** (the Lab as a
transparent Browser Source, and OBS following the Lab's scenes, recording, streaming) and **Ableton Link** tempo.
Nothing new sits on screen and nothing runs until you turn it on: it's all in **right-click the preview → 🎚 Live (VJ)
→ 🔌 Connect**, Ctrl/⌘+K and the commands **`/osc`**, **`/midi-out`**, **`/obs`**, **`/link`**.

Files: `interopmain.js` (main process: UDP, Link, the OBS page server, the obs-websocket client; loaded on first use),
`interop.js` (OSC map, presets, learn, the beat clock, audio features, slider watcher, Link), `interop-midi.js` (MIDI
out), `interop-obs.js` (Browser Source frames, OBS control), `interop-cmds.js` (commands), `obs-page.html` +
`obs-page.js` (the page OBS loads). Lazy group `interop` (loads on first use).

## Measured / tested
| | |
|---|---|
| OSC in → a slider | applied on the next frame (one value per slider per frame, like a MIDI knob) |
| A burst of 300 OSC messages | 300 received, handed to the window in ≈ 8 batches (one IPC per event-loop turn) |
| Beat messages at 128 BPM | mean gap 468 ms (468.75 expected), bar 1 on beat 1 |
| MIDI clock at 128 BPM | 19.53 ms between ticks (19.53 expected), scheduled 100 ms ahead; the beat tick lands on the beat note (0 ms off) |
| OBS Browser Source (SwiftShader, headless) | 8–12 frames a second here (30 asked; a real GPU encodes faster), ≈ 2 KB a frame for a simple scene; 0 frames with nobody watching |
| Per frame in the hub | nothing: frames are made and encoded by the preview (WebP, off its thread) and passed as bytes |

Tests: `node dev/interop-test.js` (34 checks: the OSC codec, bundles, broken packets, UDP in with batching, out only to
private addresses, the Link parser and follower, the page server's Host / Origin checks, obs-websocket v5 against
`dev/fake-obs.js` with a wrong then the right password, scenes, record, readable OBS errors, the password never
written in the clear) and `dev/checks/interop.js` in the app (`node dev/smoke.js --fake-obs …`, 56 steps): OSC sent
to Hearth on 127.0.0.1 moves Glow / Size / Spin, cues "Main" and GO switches to it, a bundle sets 128 BPM and
freezes, a learned `/mycontroller/knob3` (0–127) moves Spin; a listener receives `/hearth/beat` 1–4, `/hearth/bar`,
`/hearth/pong`, the scene name and slider values; a stubbed Web MIDI output gets Start, 98 ticks, a note on every
beat (469 ms apart), bar notes, note offs, a slider as CC 20 and Stop; the page loads in a hidden window and draws
the Lab with alpha (24 of 49 points inside the picture transparent, 25 solid; opaque key: 49 solid), no frames
once it closes; with a fake OBS, Hearth asks for the password in a masked field, connects, OBS follows a linked scene
and "Main" by name on GO, records, asks before streaming (cancel → nothing, allow → live), adds "Hearth Lab" as a
browser source; Link tempo 126 followed; the commands and the 🔌 Connect menu. `labstage`, `remote`, `qa-commands`
pass.

## Upgrades

### OSC in: other apps play the Lab (`/osc`)
1. **`/osc on`**: Hearth listens for OSC (UDP). Off by default; on this computer only (127.0.0.1) unless you say otherwise.
2. **`/osc lan`**: listen on your network too (phones, a second computer); only private addresses (home / studio network) are accepted (`/osc local` goes back).
3. **`/osc port 9000`**: pick the port (or Live (VJ) → 🔌 Connect → OSC → Listen on → Port…).
4. **`/hearth/slider/<name> 0–1`** moves a slider of the scene on screen by its name ("glow", "Size", the start of a name works).
5. **`/hearth/slider/<name>/value 1.5`**: the slider's real value instead of 0–1.
6. **`/hearth/fader/<n> 0–1`**: the nth slider, for grid controllers with no names.
7. **`/hearth/xy x y`**: the first two sliders from one XY pad.
8. **Pads**: `/hearth/go`, `/cut`, `/next`, `/prev`, `/shuffle`, `/shuffleBack`, `/freeze`, `/tap`, `/blackout`, `/play`, `/look`, `/show` (1 = press; a button's release does nothing).
9. **`/hearth/act/<action>`**: every stage action by name, including `scene1`–`scene8` (cue that set-list scene).
10. **`/hearth/scene <name | number>`** opens a scene (a number is its place in the set list); `/hearth/scene/next`, `/prev`.
11. **`/hearth/cue <name | number>`** cues a scene for the next GO (the cue monitor shows it).
12. **`/hearth/set/<n>`**: cue that set-list scene and GO in one press.
13. **`/hearth/bpm 128`** sets the stage's tempo.
14. **`/hearth/xfade 0–1`**: the stage's crossfader from a fader in your app.
15. **`/hearth/layer <name>`** selects a layer (its sliders become the ones the faders play).
16. **`/hearth/look <name>`** applies a saved look; `/hearth/look/next` steps through them.
17. **`/hearth/ping`** answers `/hearth/pong` (to the sender and your apps): a quick "is it connected?" from a phone app.
18. **`/hearth/sync`** sends every slider value out again (feedback controllers update their faders).
19. **Bundles** (also nested) and old senders without type tags are understood.
20. **Light on the Lab**: moves are the hub's own slider moves, one per slider per frame; one undo step and one save after your hand stops (300 ms).
21. **Limits**: 4,000 messages a second at most, broken packets are counted and dropped, a large receive buffer so a TouchDesigner burst isn't lost.

### Learn, like the MIDI knobs
22. **`/osc learn`**: touch a slider (or name one: `/osc learn glow`), move any control in your app: bound (🎯 Learn: the slider I touched in the menu).
23. **Its range is read from the first value**: a 0–127 control (MIDI-style apps) or a −1–1 control (sensors) maps across the whole slider.
24. **`/osc learn-pad go`** (or 🎯 Learn a pad ›): the next button you press in your app fires that action.
25. **`/osc maps`** lists what you learned; **`/osc forget <n>`** (or click it in Mappings ›) removes one.
26. Learning stops with Esc, or by itself after 30 s with nothing heard.

### App presets (`/osc preset <app>`, or OSC › App preset ›)
27. **Any OSC app**: Hearth's own addresses, in 9000 / out 9001.
28. **TouchOSC** (phone / tablet, "Simple" layout): faders 1–5 → the first five sliders, push 1–4 → GO / shuffle / freeze / tap, a toggle → black-out, XY → sliders 1–2, slider values sent back to the faders; on your network (in 8000 / out 9000).
29. **TouchDesigner**: in 7000 / out 7001 with audio features and slider values on, ready for an OSC In CHOP; an OSC Out CHOP with channels named `hearth/slider/glow` drives the Lab.
30. **Ableton Live (Max for Live)**: in 9001 / out 9002 for `[udpsend]` / `[udpreceive]` patches.
31. **Ableton Live (AbletonOSC)**: Hearth asks Live (AbletonOSC remote script) for its tempo and every beat, and the stage follows: same tempo, bar 1 lined up. This is the beat-exact tempo bridge (Link alone gives the tempo only, below).
32. **Resolume Arena / Avenue**: launching a column in Resolume GOes to that set-list scene, a clip cues it; Hearth sends Resolume its tempo and a resync on every bar 1.
33. **Phone sensors** (GyrOSC, ZIG SIM, TouchOSC's accelerometer): tilt and rotation move the first three sliders.

### OSC out: Hearth tells your apps what's happening
34. **`/osc to 127.0.0.1:9001`**: where Hearth sends (up to 8 apps); only this computer or your local network, never the internet (`/osc untarget` removes one).
35. **`/hearth/beat 1–4`** on every beat, on time (the clock wakes early and sends on the beat).
36. **`/hearth/bar <n>`** on each bar's first beat.
37. **`/hearth/bpm`** when the tempo changes (song grid, taps, MIDI clock in, Link, AbletonOSC).
38. **Hits**: `/hearth/kick`, `/hearth/snare`, `/hearth/hat` with their strength, from the Lab's sound analysis (song or live input).
39. **Audio features** (`/osc send features on`): `/hearth/audio/level`, `sub`, `low`, `mids`, `highMid`, `brilliance`, `air`, `loudness`, `centroid`, `flux`, `onset`, `vocal`, `beatPhase`, `barPhase`, `intensity`, `build`, `drop`, about 30 times a second, in one bundle.
40. **Slider values** (`/osc send sliders on`): `/hearth/slider/<name> 0–1` whenever one moves (by hand, a shuffle, a knob, the phone), all of them after a scene switch.
41. **The scene**: `/hearth/scene <name>` and `/hearth/scene/index <set-list number>` on every switch.
42. **`/osc send <beat|bpm|hits|features|sliders|scene> on|off`** (OSC › Send out ›) picks what goes out.
43. **`/osc ping`** sends a ping and the tempo to your apps (check the wiring).
44. **`/osc addresses`** (OSC › Addresses…): the whole address map in one card.
45. **`/osc`**: on / off, where it listens, where it sends, what goes out, messages heard / refused, the last address, what you learned.

### One beat clock
46. **OSC and MIDI out share one beat clock** on the stage's tempo (the song's grid while it plays, MIDI clock in, your taps, Link), scheduled one beat at a time, with bar 1 read from the stage's own bar grid: no loop per frame.

### MIDI out (`/midi-out`, alias `/midiout`)
47. **Device picker**: an output by name, or every output (`/midi-out device IAC`, MIDI out › Device ›); on a Mac the IAC Driver reaches apps on the same computer.
48. **Clock out**: 24 ticks a beat at the stage's tempo, with Start and Stop, for drum machines, synths, DAWs and light desks (`/midi-out clock on`).
49. **Tight clock**: ticks are scheduled 100 ms ahead with Web MIDI timestamps and pulled gently onto the stage's beat (no drift, no jumps).
50. **Notes on cues**: a note on every beat, on bar 1, on kick / snare / hat hits or on a scene change, with channel, velocity and length (`/midi-out note kick 36 10 110 60`).
51. Preset **Lights**: one note per cue on channel 1 (bar C1, beat C#1, kick D1, snare D#1, hat E1, scene F1).
52. Preset **Drum machine**: General MIDI drums on channel 10 from the kicks, snares and hats Hearth hears.
53. Preset **Click**: a click on the beat with an accent on bar 1.
54. **Note names** are understood (C1, F#2, 36).
55. **Slider → CC**: `/midi-out cc glow` gives the slider the next free CC (from 20) and sends a short wiggle so the other side's MIDI learn picks it up; its moves go out as CC from then on.
56. **Program change on a scene change** (its set-list number): light-desk cues follow the set list (`/midi-out pc on`).
57. **Channel** for CC and program changes (`/midi-out channel 2`).
58. **Panic**: all notes off on every channel (`/midi-out panic`).
59. **`/midi-out`** shows the device, the clock, every cue and CC; `/midi-out off` stops it all.

### OBS: the Lab as a Browser Source (`/obs output on`)
60. **A page only this computer can open** (http://127.0.0.1:47850/): add it in OBS (Sources → ＋ → Browser) and the Lab is in your stream / recording.
61. **Transparent background**: layers with no background stay see-through in OBS (the Lab's own alpha).
62. **Black → transparent** (luma key) for scenes with a black background (`/obs key luma`).
63. **Opaque**, exactly as on screen (`/obs key none`).
64. **Fit**: the whole picture, fill, or stretch (`/obs fit cover`).
65. **Frame rate** 15–60 (`/obs fps 60`).
66. **Size** up to 960 / 1280 / 1920 / 3840 px (`/obs size 1920`).
67. **Frames only while OBS shows the page**: nothing is made with nobody watching; a toast says when OBS starts showing it.
68. **Light**: the preview merges its layers and encodes WebP off its own thread, passes the bytes without copying; slow viewers are skipped, not queued.
69. **The page reconnects by itself** and clears when the output stops (OBS shows what's under it); the "waiting" hint appears only in a normal browser tab, never inside OBS.
70. **Locked down**: 127.0.0.1 only, a strict Content-Security-Policy, two files, and only that page can open its socket (another website can't read the picture).
71. Turning it on from the menu **copies the address** for OBS.

### OBS control (obs-websocket 5, OBS 28+)
72. **`/obs connect`** (or `/obs connect ws://192.168.1.30:4455` for OBS on a streaming PC on your network); reconnects by itself if OBS restarts.
73. **The password is typed once in a masked field** (`/obs password`), kept encrypted with the system keychain (Electron safeStorage; for this session only when there's no keychain), never shown, logged or sent to a chat; text typed after `/obs password` is ignored.
74. **`/obs forget-password`**.
75. **Status**: OBS and obs-websocket versions, the program scene, recording and streaming (`/obs`, and the 🎥 line in the menu).
76. **`/obs scene <name>`** switches OBS; `/obs scenes` lists them (OBS › Scene ›).
77. **OBS follows the Lab**: switching a Lab scene (by hand, GO in the set list, a pad, OSC, the phone) switches OBS to the scene with the same name (`/obs follow on|off`).
78. **Link a Lab scene to an OBS scene** (`/obs link Outro`, OBS › Link "…" to ›).
79. **Record from Hearth**: `/obs record on|off|toggle|pause|resume` (OBS › ● Record).
80. **Streaming asks first, every time** ("Go live on OBS?"), stopping doesn't (`/obs stream on|off`).
81. **`/obs add`**: puts "Hearth Lab" into the current OBS scene as a browser source at the Lab's frame size.
82. **Toasts** when OBS starts / stops recording or streaming, disconnects or wants its password.

### Ableton Link (`/link`)
83. **`/link on`**: the stage follows the tempo of a Link session (Live, Traktor, Resolume, Serato, Link-enabled apps) on your network; a playing song or MIDI clock in still leads.
84. **`/link`**: how many Link peers, their tempo and whether they play.

### Where to find it
85. **🎚 Live (VJ) → 🔌 Connect**: OSC, MIDI out, OBS and Link in one submenu with their state in the hints.
86. **Ctrl/⌘+K**: Lab: OSC on / off · OBS output (Browser Source) on / off · Connect to OBS · MIDI clock out on / off · Connect menu.
87. **What was on comes back on** at the next start (OSC, the OBS output and connection, Link, MIDI out cues).
88. The directors' app map knows `/osc`, `/midi-out`, `/obs`, `/link` (one line, read on demand).

## How it works (for the lead)
- Main side `interopmain.js` via `lazyIpc` (main.js, one line); preload `hub.interop`. OSC: one `dgram` socket bound
  to 127.0.0.1 (local) or 0.0.0.0 with a private-sender filter (lan), decoded in main, batched per event-loop turn to
  `interop:osc`; out through a second socket to private / loopback hosts only. Link: multicast 224.76.78.75:20808,
  `_asdp_v` alive messages, only the `tmln` tempo and `stst` play state are read. Browser Source: an http server on
  127.0.0.1:47850–47853 (Host + Origin checked, CSP) and a hand-made WebSocket per viewer; frames come from the
  window as bytes (`interop:page-frame`). obs-websocket: a hand-made RFC 6455 client (Hello → Identify with
  `base64(sha256(base64(sha256(password + salt)) + challenge))`), requests from the window limited to an allowlist;
  the password lives in main (`data/interop/obs.json`, `kx` = safeStorage-encrypted; nothing written without a
  keychain).
- Hooks (small, additive): `tools/three.js` (one line: `obs-frame` messages → `InteropObs.frame`),
  `tools/three-sandbox.html` (`composite(…, clear)` keeps alpha; `obs-shot` → `obsShot`: WebP via `toBlob`,
  transferred), `tools/three-stage.js` (the 🔌 Connect item in the Live menu; loads the group at start when something
  was on), `main.js` / `preload.js`, `lazy-data.js` (+ manifest), `mcp/hearth-map.js` (one line), `dev/smoke.js`
  (`--fake-obs`), `dev/run-checks.js` (interop in the lab group, interop-test in unit).
- Tests: `node dev/interop-test.js`; `node dev/smoke.js --fake-obs --check-timeout 240000 --script dev/checks/interop.js`
  (or `sh dev/run-checks.sh interop`). `node dev/fake-obs.js 4455 <password>` runs the fake OBS by hand.

## Ableton Link: what's possible without a native module
Link's discovery is plain UDP multicast with a simple binary format, so **following a session's tempo in pure JS is
light** (≈ 40 lines, done: `/link`). Joining as a full peer (sending tempo, beat-exact phase) needs Link's clock
measurement exchange (ping / pong with host and ghost times, a Kalman-filtered offset) and the exact session
negotiation; doing that reliably without the official C++ library (a native module, which Hearth avoids) isn't worth
the risk. For beat-exact sync use the **AbletonOSC preset** (tempo + every beat from Live, bar 1 lined up), or **MIDI
clock** either way (`/midi-out clock on` from Hearth, or Live sending clock into the stage's MIDI input).

## Notes and limits (security first)
- **OSC has no passwords** (no OSC app supports them): on "your network" anyone on the same Wi-Fi could move sliders or
  press GO. That's why it listens on this computer only by default; use `/osc lan` on a network you trust. OSC can only
  do what a controller can (sliders, pads, scenes, the set list, tempo): no code, no commands, no files.
- OSC out and OBS connect only to this computer or private addresses (10.x, 172.16–31.x, 192.168.x).
- The OBS page is 127.0.0.1 only; any program on this computer could open it and see the Lab's picture (the same as
  watching the screen). The socket refuses other websites (Origin), and DNS rebinding (Host).
- obs-websocket on your network is plain ws:// (OBS has no TLS); the password itself never travels (challenge /
  response), but scene names and commands do.
- Streaming always asks in Hearth; a chat can't start a stream without you clicking "Start streaming".
- The Browser Source picture is the preview's own pixels: a small preview gives a small picture (turn on the Stage
  window at 1080p, or enlarge the preview, for a full-size picture). It doesn't include the cue deck during a
  crossfade (the new scene appears when it takes over), and the preview sleeps when the Lab isn't on screen (keep the
  Lab or the Stage window visible while streaming).
- Link: tempo only (see above). OSC features: from the hub's live input copy, else a probe of the preview (one at a
  time), so they arrive ≈ 30 a second at best.
- Not tested against the real apps (TouchDesigner, Live + AbletonOSC, Resolume, OBS, a Link peer) here: fakes and
  stubs stand in for them; Resolume's tempo is sent normalized (20–500 BPM → 0–1), as its OSC inputs expect by default.

Count: 88 upgrades.
