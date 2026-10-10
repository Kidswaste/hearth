# Progress bars (round 11): how far along everything that's being made seems to be

You asked: "when we create something or it's in the middle of being created, give me a loading bar of how far the
progression seems to be." Now everything in Hearth that takes time has one: a slim bar on the thing itself (the
reply being written, its chat in the list, the rail icon of the agent or tool doing the work, the card of a
dispatch, a video project, a flow, a jam, the Commands page run) and one quiet indicator at the bottom of the rail
that lists everything in progress, with a click to jump there. Nothing new shows when nothing is running.

The bars are honest:
- **Measured** where Hearth can count (ffmpeg's own progress, frames rendered, steps done, rounds, seconds of a take
  of known length): a solid bar and a plain number.
- **Estimated** otherwise (an agent's reply, a website snapshot, a sync pass, an engine update): a softer, hatched bar
  whose words say "about". The estimate comes from how long the same kind of work took here before (learned as things
  finish, kept on this computer), the tool calls made against the usual count, the text streamed against the usual
  length, a plan's steps, and the agent's own word when it gives one.
- **Never backwards, never stuck at 99 %**: an estimate stops at 95 % and says "almost there", then "waiting on the
  agent" (or "taking longer than usual"); after a long silence it says "no news for a while" and turns ember; a flow
  that hung offers ↻ Pick up here from the list. A time left shows only when the rate (measured) or the history
  (estimated) is steady enough to trust.

Token frugality: nothing reaches Claude or Astra. The estimator works alone. `/progress tags on` (directors only, off by
default) adds one line to the directors' prompt (≈ 30 tokens a message) so they can say how far they are with a
hidden tag.

Counted honestly: one line per thing you can see or use (a behaviour, a place a bar shows, a source, a command).

## Honest bars
1. **One progress model** for everything that takes time (replies, flows, Commands-page runs, video projects, dispatches, jams, renders, recordings, tours, Lab sequence renders, website snapshots, sync, engine updates, the ffmpeg install).
2. **Measured bars show the real number** ("40 %"): ffmpeg's own progress, frames rendered, steps done, rounds, seconds of a take of known length.
3. **Estimated bars look like estimates**: lighter and hatched, and their words say "about 40 %".
4. **A bar never goes backwards** (a noisy source going back, a new part added: the bar holds until it is really further).
5. **No 99 % forever**: an estimate stops at 95 % and says "almost there" (it breathes gently) once it runs past the usual time.
6. **"Waiting on the agent"** (replies, flow AI steps, jams, dispatches) or **"taking longer than usual"** (everything else) well past the usual time.
7. **"No news for a while"** after a long silence (no text, no tool call, no step: 5 min for a reply), the bar turns ember; it comes back to life on the next sign.
8. **"Waiting for you"** (a flow asking a question, a paused recording) is a paused bar, never counted as hung.
9. **Time left only when it can be trusted**: from a steady measured rate, or from a history of 3+ similar runs that took about the same time ("about 20 s left", "about 3 min left").
10. **Done fills to 100 % and fades** (green, then gone); a failure turns red and stays a few seconds longer; a stopped one simply goes.

## How the estimate learns
11. **Per kind, from finished runs**, kept on this computer: replies, renders, Lab sequence renders, website snapshots, sync passes, engine updates, the ffmpeg install, jams, video projects, each flow.
12. **Replies learn per agent and per message size** (short / medium / long), and fall back to the engine's (Claude's, Astra's) history for a new agent; directors start from a longer default (≈ 1.5 min, 6 tool calls).
13. **Tool calls made** against the usual count for that kind of reply.
14. **Text streamed** against the usual length, once it starts writing (and when in a reply the writing usually starts).
15. **A plan's steps**: the agent's chat_progress checklist and Codex's own todo list move the bar step by step.
16. **The agent's own word**: a `<progress pct="40" note="…"/>` tag anywhere in a reply moves the bar (ahead of the estimate it pulls it up; behind it, it barely slows it) and its note becomes the bar's words; the tag is hidden from the reply as it streams and never saved.
17. **A `progress` field in any hub tool call** (`progress: 40` or `{ pct, note }`) does the same.
18. **A parent is the mean of its parts** (a dispatch and its parts), measured when every part is, estimated otherwise; it finishes when its parts do.

## Where the bars show
19. **On the reply being written**: a line along its top edge, with its words in the corner ("about 55 % · writing · about 20 s left"; the agent's note when it gives one).
20. **On the chat's row** in the chats list (so a reply in a chat you left still shows).
21. **On the rail icon** of the agent or tool doing the work (a docked director on its tool's icon: the Lab; exports on Video Review; flows from the Commands page on ☰ Commands; snapshots on the Board).
22. **On the dispatch card** (`/dispatch`): the whole comp on the card's head, each part on its own row.
23. **On the video project card** (`/intro`).
24. **On a flow's card in the chat.**
25. **On the Commands page run**: one bar for the whole run (your answers and the commands it runs), in place of the questions-only one.
26. **On the jam card**, the Lab's jam badge and the Lab's rail icon.
27. **On a board card** while its website snapshot loads.
28. **On the sync dot** while a pass runs.

## The indicator at the bottom of the rail
29. **One quiet indicator** above the keys button: a tiny bar (the mean of what runs) and how many things are running; hidden when nothing is.
30. **Point at it**: up to six things in progress with their words.
31. **Click it: the list**: every item with its title, its words and its bar; the parts of a dispatch under it.
32. **Click a row to jump there**: the chat (even a docked director's), the dispatch card, the video project, the flow on the Commands page, Video Review, the Lab, the Board.
33. **■ on a row stops it**: a reply, a flow run, an export, a Lab sequence render, a recording, a jam, a video project.
34. **↻ Pick up here on a hung flow** (also flows that hung when Hearth closed, in the last hour).
35. **Right-click it**: the list, "Directors report their progress" (on / off), what Hearth learned, forget the typical times, hide finished bars.
36. Ctrl/⌘+K: "What's in progress (loading bars)".

## What feeds them
37. **Claude and Astra replies**, in any chat (directors, plain chats, a dispatch's parts).
38. **Flows and Commands-page runs**: steps done / total, weighted (an AI step 4, a command 2, a check 2, a choice or your words 1), the path ahead taken from the likely answers; drawn as an estimate while choices remain.
39. **Video projects (`/intro`)**: the seven steps weighted by how long they take (scenes most, then render, captures, edit), with each step's own n / m; its words name the step ("✦ Scenes 2/4").
40. **Dispatches**: each part's reply, and the comp as their mean.
41. **Jams**: rounds done of the total (and the final pick), named by what is happening ("round 2/4 · Astra directing").
42. **Video Review exports and cuts**: ffmpeg's real progress, the bar named after the export ("⇪ Export Instagram Reels").
43. **Any other ffmpeg job** gets a bar too ("Rendering a video").
44. **Captures' MP4s** (the ffmpeg pass after a take): "◉ Making the MP4".
45. **Lab sequence renders**: frame n / N, then muxing the sound; without ffmpeg, the real-time take.
46. **Recordings**: seconds against the take's length when one is set (Longest take…), else a sweeping bar with the clock; paused shows as waiting.
47. **Capture tours**: step i of n.
48. **Board website snapshots**: estimated from earlier snapshots, on the card.
49. **Sync passes**: on the sync dot; in the list only when one lasts more than 4 s (so the quick ones stay quiet).
50. **Engine updates, installs and sign-ins** in their visible window, until Hearth sees the engine fixed.
51. **The ffmpeg install** (`/ffmpeg install`), until ffmpeg is found (it gives up after 40 min, in red).

## Commands
52. **`/progress`** (also `/loading`): what is in progress, with how far along each seems, and the list opens.
53. **`/progress learned`**: how long things usually take here (replies, renders, snapshots…), learned from finished runs.
54. **`/progress tags on | off`**: directors say how far they are with the hidden tag (one line in their prompt, ≈ 30 tokens a message, from their next new chat); off by default.
55. **`/progress forget`**: Hearth learns the typical times again from scratch.
56. **The app map has a `progress` topic** (also `loading`, `bars`, `eta`), read on demand by both engines: no tokens unless asked.

## Smooth (round 5 rules)
57. **Compositor-only**: the fill moves with `transform: scaleX()` and a CSS transition, each fill on its own layer; the "almost there" breathing is opacity; nothing animates layout or paint.
58. **One timer for every bar**, 4× a second and only while something runs; values compared before anything is written; half-percent steps; a reply's words change at most once a second; nothing runs at all when nothing is in progress.
59. **Reduced motion**: no transitions, no breathing, a still bar for "no number yet".

Measured (`dev/checks/progress-smooth.js`: one long streaming reply, the bars off and on in alternating 2.5 s windows,
4 each, `smoke({ trace })`; a shared, loaded test machine with a software GPU, so read the numbers as relative):

| A streaming reply, per 2.5 s | Bars off | Bars on |
|---|---:|---:|
| Painted area | 64.5 Mpx | 66.6 Mpx (the same) |
| Layout | 16 ms | 16.3 ms (the same) |
| Style | 14 ms | 31 ms while a bar moves (about the same as off in windows where it held still) |
| Paint | 17.5 ms | 24 ms (within this machine's run-to-run noise: 11–41 ms) |
| DOM changes | 31.8 / s | 37.5 / s (the bars: ≈ 6 writes a second on average, 17 at most) |
| Frames | 21.5 fps | 20.5 fps (the same) |

Before the fix found while measuring, the indicator's fill had no layer of its own: every move made the rail repaint
(painted area 1.9× with the bars on); it now has one (same painted area as with no bars).

**Count: 59 upgrades** (numbered 1–59).

## For development (not counted)
- `progress.js` (`Progress`, no DOM, Node-testable): `set(key, { pct, label, eta, parent, title, kind, expect, signals,
  estimate, state, where, jump, icon, weight, hungMs, actions, quietMs })`, `done(key, { ok, label })`, `drop(key)`,
  `on(fn)`, `get`, `list`, `children`, `tick`, `words`, `configure({ now, load, save })`, `forget`. The API is
  documented at the top of the file; `pct` is 0–100 and measured unless `estimate: true`. For the makes stream:
  `Makes.progress(makeId, partId?, { pct, label, eta })` = `Progress.set(partId ? \`make:${makeId}:${partId}\` :
  \`make:${makeId}\`, { pct, label, eta, parent: partId ? \`make:${makeId}\` : undefined })`; keys `make:…` find
  `[data-make="<id>"]` / `[data-make-part="<part>"]` cards by themselves.
- `progress-ui.js` (`ProgressUI`): the bars (`where` locators: `reply:<chatId>`, `row:<chatId>`, `rail:<surface>`, a
  selector, a function), the indicator, the list, `/progress`; `setEnabled(on)` for measuring.
- `progress-hooks.js` (`ProgressHooks`): the sources (Native hooks + engine events, HubBridge results, Flows.onChange,
  Intro.onChange + `hearth:intro-end`, `jam(J, text)` from jam.js's badge + `hearth:jam-end`, `job(id, o)` and
  `video.onJob`, `capture.onProgress`, `hearth:recording`, `sync.onStatus`).
- Small hooks elsewhere: `native.js` (the tag hidden like `<flow>`), `engines.js` (the opt-in line when
  `agent.progressTag`), `tools/review.js` (names its ffmpeg job), `tools/three-seq.js` (renderEdit's frames),
  `board.js` (snapshots), `engine-health.js` (fix windows, ffmpeg install), `capture.js` (`max` in `status()`),
  `jam.js` (one line in `badge()`), `mcp/hearth-map.js`, `dev/fake-common.js` (keyword `progress`), `index.html`.
- Tests: `node dev/progress-test.js` (14: monotonic, capped at 95 with almost / waiting on the agent, never 99 after an
  hour, measured vs estimated, measured ETA, learning per kind with prefix fallback and saving, one run blended,
  failed runs teach nothing, tool / text / steps / agent signals, parents, done / failed / drop, hung and back, states
  the caller knows, a key reused, the directors' line opt-in and ≈ 30 tokens); `dev/checks/progress.js` (a slow fake reply with tags: bars on the reply / row /
  rail, the indicator and its list, jump, the tag hidden, forward only, done and faded, learned; `/progress`; a real
  ffmpeg export measured; a Commands-page chain `/wait 2s` → `/wait 2s` on the run's head; a hung run picked up from
  the list; `/progress tags`), `dev/checks/progress-comp.js` (a `/dispatch` of two parts, Claude and Astra: the comp
  as the parent of the parts' replies, bars on the card head and rows, forward only, done together),
  `dev/checks/progress-smooth.js` (the table above). `sh dev/run-checks.sh progress` runs the four.
