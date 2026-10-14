# inputlatency (round 38): from a key, a click or a drag to the next frame

You want Hearth to feel instant at 120–240 Hz: the time from an input to the next painted frame as short as it can be.
This pass measured that time for the everyday interactions, found the Hearth code that ran in (or right before) those
frames for nothing, and moved or removed it. Nothing looks or behaves differently; the same things happen sooner.

## How it was measured
- `dev/checks/inputlatency.js` (new; in the `smooth` group and its own `inputlatency` group): real input (CDP
  `Input.*`, trusted events, as a keyboard, mouse and trackpad send them), Forgeheart look, a 300-message chat:
  typing 60 letters + 12 Backspaces in the chat box · typing at the end of a **30,000-character draft** ·
  **Enter to send** ×3 (fake engine) · **Ctrl/⌘+K** ×4 (type "dark", ↓, Esc) · the chat's **right-click menu** ×4 ·
  **⋯ AI setup** ×4 · **clicking chats** in the list ×6 · **wheeling** the long chat 40 notches · dragging a **gap in the
  grid view** · dragging a **Lab slider** across and back (a scene whose "Turn" slider turns a knot) · **orbiting** the
  Lab preview (right-drag) · **scrubbing** the music timeline.
- Per event, a probe in the page records its timeStamp, when the page started handling it, when its handlers were done
  and when the next frame was rendered (a message posted from rAF). That gives **input delay**, **handlers**, **input →
  handled** and **input → next frame** p50 / p95 for every event, pointer moves and wheel included (which the Event
  Timing API leaves out). The **Event Timing API** (PerformanceEventTiming `duration`, processing, presentation) is
  reported next to it, and with `window.IL_TRACE = 1` the timeline trace adds input delay / processing / presentation
  from Chromium's own EventTiming and the forced styles / layouts with their JS lines (dev/trace-stats.js
  `phasesOfInput`).
- **Lab slider → frame**: the scene notes the slider value of every preview frame it runs; for every value the slider
  took, the check counts the preview frames that started after the Lab had it until one drew it (1 = the very next
  preview frame), plus the ms from the pointer move and the hub → preview delivery. **Orbit**: pointer move → the next
  WebGL draw, inside the preview.
- Budgets (it fails above them): input → handled p95 ≤ 50 ms for typing and Enter, ≤ 100 ms for Ctrl/⌘+K and menus,
  ≤ 150 ms for AI setup and chat clicks; handlers p95 ≤ 8 ms for typing and drags (a 120 Hz frame), ≤ 16–24 ms for what
  builds a surface; Lab slider → frame p95 ≤ 2 preview frames; no blocking wheel listener around the chat; the
  preview draws while you orbit. `window.IL_REPORT = 1` reports without failing, `IL_ONLY = 'scrub,…'` runs some.
- Before = this branch's starting commit (ce67c71) from a copy with the same check, interleaved with the after runs.
  **This machine is not a 240 Hz Mac**: Xvfb at 60 Hz, software GL (SwiftShader), 4 CPUs shared with four other agents
  (load 6–18 during the runs). Frames there take 50–500 ms to be presented whatever the page does, so the "next frame"
  and Event Timing `duration` numbers are mostly this machine's compositor and move ±100 % between runs. The numbers
  that describe Hearth's own code are the **handlers**, the **forced styles / layouts** and **script time** in the
  stretch, and the **preview frames** for the slider; those are the ones to read below.

## Numbers (before → after)

Ranges are min–max over the interleaved runs (2 before / 2 after, plus traced runs). "Handlers" = the time inside
the page's handlers for each event; "next frame" = input → the end of the next rendered frame (this machine's
compositor dominates it); p50 / p95 in ms.

| Interaction | Handlers p50 / p95, before → after | Next frame p50 / p95, before → after | What changed underneath |
|---|---|---|---|
| **Scrubbing the timeline** (82 moves) | 0.3–0.5 / **3.2–5.6 → 0.1 / 0.3–0.6** | 86–153 / 306–644 → 250–469 / 414–785 (machine) | forced style / layout **123 / 120–190 ms → 74–77 / 49–61 ms**; the preview-answer path (three.js listener) **195–280 ms → 25 ms**; one timeline draw per frame instead of two per move |
| **Typing in a 30,000-character draft** (42 keys + 10 Backspaces) | 0–0.1 / **1.4–1.5 → 0.1 / 0.4** | 50–56 / 112–120 → 42–51 / 92–98 | the chat box's input handler **63–71 ms → 42–43 ms** of script; no whole-draft copies per key |
| Typing 60 letters + 12 Backspaces (short) | 0.1 / 0.2–0.3 → 0.1 / 0.3 | 65–85 / 143–236 → 64–65 / 112–118 | (already light: the text box's own layout is the rest) |
| **Clicking chats** (×6) | 0–0.1 / 13–25 → 0–0.1 / 12–26 | (machine) | the hidden node view's minimap no longer redrawn: **229–331 ms → 0** of script; one layout less per switch (focus) |
| **Dragging a Lab slider** (82 moves) | 0.1 / 0.6–1.1 → 0.1 / 0.8 | 102–138 / 256–517 → 97–130 / 176–394 | forced style / layout in the stretch 9–17 / 18–80 ms → 5 / 9 ms (the 2 s check and the chip no longer land in it) |
| **Lab slider → preview frame** | **1 / 2 frames** (3 once under load) | → **1 / 2 frames**, never missed | p50 = the very next preview frame; hub → preview delivery p50 11–19 ms |
| Orbiting the preview (move → next draw) | — | 30–46 / 60–151 → 21–40 / 69–95 | (all in the preview; unchanged code) |
| Enter to send (×3) | 0–0.1 / 0.3 → 0–0.1 / 0.3–0.4 | 121–397 / 414–748 → 109–117 / 377–388 | — |
| Ctrl/⌘+K (×4, type, ↓, Esc) | 0.1 / 4.3–9.6 → 0.1 / 4.4–10.5 | (machine) | plain words memo: the opening's second task ≈ 3 ms lighter |
| Right-click menu (×4) | 0.1 / 8–16 → 0.1 / 4–10 | (machine) | — |
| ⋯ AI setup (×4) | 0.1 / 4.6–6.3 → 0.1 / 5.6–8.1 | (machine) | — |
| Wheel over a 300-message chat (40 notches) | 0.1 / 0.2–0.9 → 0.1 / 0.2–0.4 | (wheel events reach the page late here; scrolling itself runs on the compositor) | no blocking wheel / touch listener around the chat (checked) |
| Grid gap drag (40 moves) | 0.1–0.2 / 0.7–1.6 → 0.1 / 0.3–3.4 | (machine) | — |

Event Timing `duration` p95 (input → presented frame, as the API reports it) was 300–6,000 ms in every stretch before
and after: on this machine nearly every event's frame takes ≥ 16 ms to be presented, so the API's numbers are the
software compositor's. On a real GPU they collapse to the frame time; the check keeps reporting them.

## Upgrades

### Scrubbing and the Lab while you drag
1. **Scrubbing the music timeline draws it once per frame.** Each pointer move drew the whole timeline, and the
   preview's answer to the seek drew it a second time; each draw also made the page work out its styles first. Now
   the seek goes to the preview at once and the timeline is drawn once, in the coming frame. `tools/three-media.js`
2. **The Lab's 2-second safety check waits for an idle moment** (is the preview on screen? did it stop answering?).
   It asked the page for a style and layout of the whole Lab and, on its timer, landed in the middle of slider drags and
   scrubs, holding up the next move. `tools/three.js`
3. **The preview's stats line is checked right after a frame**, when the page's style is fresh, instead of between two
   frames of a drag (twice a second). `tools/three.js`
4. **The ◧ Before / after chip is placed before it's written**, so showing or updating it doesn't lay the page out a
   second time (it came right after a slider gesture). `tools/three-abcompare.js`
5. **The node editor's minimap waits when its editor isn't on screen**: switching chats switches the Lab's scene, which
   redrew the hidden node view's minimap, a whole-page style and layout inside the click. It's drawn when idle, only
   if shown (panning and zooming still draw it in the frame). `nodes.js`

6. **◧ Before / after only asks "is the preview on screen?" when something of it is showing**: it laid the page out
   right after every chat switch and window change. `tools/three-abcompare.js`

### Typing
7. **Typing in a very long draft doesn't copy it on every key**: the chat box's size check, the character counter and
   the Send button read the text's length instead of the whole text (a 30,000-character draft was copied several
   times per keystroke). `native.js`
8. **Backspace in a full-height chat box measures once** (it reset its height and laid the chat out twice per key in a
   long draft). `native.js`
9. **The "@" picker looks only from the last "@"** before the cursor instead of running its pattern over the whole
   draft on every key. `chat-refs.js`
10. The character counter formats its number with one shared formatter (it built a new one per key), and the "any key
   stops reading aloud" listener reads its setting only while something is being read. `native.js`, `voice.js`
11. **Your unsaved work is kept in an idle moment** (safety net: drafts, the Lab scene, text boxes), not in a timer
    that could fall between two keys or two slider moves. Still kept within about a second. `safetynet.js`

### Opening things
12. **Switching chats focuses the chat box without laying the page out to scroll it into view** (it's always in view).
    `native.js`
13. **Ctrl/⌘+K works out each command's plain words once** (≈ 1,000 rows, five patterns each, on every opening, in
    the moment your first letters arrive). `appsearch.js`

## For the next measurer (not counted)
- `dev/checks/inputlatency.js` (`sh dev/run-checks.sh inputlatency` runs it with the checks around it): per stretch
  `frame` (the in-page probe: events, per type with the slowest handlers, toFrame / delay / handlers / afterHandlers /
  toHandled p50 / p95 / max), `et` (Event Timing: events, how many ≥ 16 ms, p50 / p95 duration counting the
  unreported ones as < 16, processing p95, the worst one split into delay / handlers / after), `sliderToFrame`,
  `orbitToDraw`, `scrollBlocking`. `IL_TRACE = 1` adds the trace's per-input phases and forced layouts per stretch;
  `IL_DEBUG = 1` lists slider values never drawn and node editors in the grid.
- Arrays read back from the preview with three_eval are cut to 60 items: long ones come back as JSON text.
- `dev/trace-stats.js` segments now carry `phasesOfInput` (input delay, handlers, presentation p50 / p95 / max).

## Measured, left as is
- **Frames on this machine**: input → next frame here is 80–500 ms p50 for everything, with Hearth's handlers under
  1 ms for keys and drags; it is the software display compositor (the GPU process at 60–120 % CPU), not the page.
  Idle, the plain look and Forgeheart both run at 60 fps; the first 2 s after a chat opens are slow (startup work).
- **The Lab slider**: already one message per frame with the latest value (round 21), sent at the end of the task of
  the first move after a frame. A value drawn by the next preview frame is the floor across processes: the hub
  handles a pointer move in the same frame the preview starts drawing, so the earliest frame that can have it is the
  next one; p50 was 1 preview frame, p95 2 before and after (3 once before under load).
- **Wheel**: no blocking wheel or touch listener around the chats (checked). The Lab's knobs, the timeline, the node
  editor and the board take the wheel on purpose (they turn / zoom), so scrolling the slider panel over a knob waits
  for the page, as designed.
- **Menus**: a right-click menu's code is ≈ 3–6 ms here (building its rows, then measuring itself to stay on screen,
  one style pass). Placing it in the next frame would save that inside the click but other code reads its position
  right after opening, so it stays.
- **Enter to send**: ≈ 5–10 ms of script here (the reply's progress bar, the meter, the cost bar, saving the chat,
  drawing your message); the hooks belong to other features and run in order, so they stay.
- The text box's own editing (Chromium's layout inside the key press) is the rest of a key's cost: not Hearth's code.

## Tested
`node --check` on every touched JS file. `sh dev/run-checks.sh inputlatency` (inputlatency, chat-stream,
streamrender, labpace, labgestures, motionpolish, smooth32, appsearch, lazy, unit:boot-test) plus nodes-lab,
smooth-nodes, safetynet (+ its unit test), abcompare: all pass; labpace failed once on its "the sketch changes itself:
draws again within a frame or two" timing (lag 100 ms, load ≈ 10; the preview page isn't touched here) and passed on
the re-run; smooth-nodes passed, then hit its 300 s limit once under load after the minimap's last change, then passed
again in 187 s. Before / after: the new check interleaved on the starting commit's copy and this branch, 3 + 3 runs (one
round traced).

## Edits outside the lane
`native.js` (chat box size / counter / Send label / focus), `chat-refs.js` (the @ lookup), `voice.js` (one line),
`appsearch.js` (memo), `safetynet.js` (idle keep), `nodes.js` (minimap), `tools/three.js` (idle check, stats line),
`tools/three-media.js` (scrub paint), `tools/three-abcompare.js` (chip placement), `dev/trace-stats.js`
(`phasesOfInput`), `dev/run-checks.js` (smooth + inputlatency groups).

## For the patch notes
- Scrubbing the music timeline is lighter: the timeline is drawn once per frame instead of twice per mouse move, and
  the page no longer recalculates its styles for each move.
- Dragging Lab sliders and scrubbing no longer hitch every two seconds: the Lab's background checks now wait for a
  quiet moment.
- Typing in a very long message stays light: Hearth no longer copies the whole text several times per key, and
  Backspace in a full chat box is cheaper.
- Switching chats, opening Ctrl/⌘+K and the Before / after chip each skip a needless page measurement.
- A hidden node view no longer redraws its minimap when you switch chats.
- Your drafts and Lab changes are still kept safe within about a second, just at a quiet moment.
- Nothing looks or works differently; inputs simply reach the screen with less work in between.
