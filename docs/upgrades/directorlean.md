# A leaner Three Director: less input on every turn (round 37, directorlean)

The Three Director is the owner's heaviest token user. Earlier rounds cut its **fixed** part (the prompt and tool list,
≈ 2.8k tokens a step, mostly cached: tokensaver, cachewise, diet) and its **output** (concise). What was left is what
its tools send back: every result — code, slider tables, scene reports, pictures — is added to the chat's engine
session and **re-read with every later step of the chat** (the session keeps its whole history). This stream measured
that per typical ask, and cut it without taking anything away the director needs.

## Measured first
`node dev/directorlean-measure.js` runs the owner's typical asks the way the director makes them (its most used calls:
get / read / search code, edits, screenshots, sliders, media control, play-tests, contact sheets) through
`tools/three-director.js` — the round 36 version (git `7d8cb4e`) and this one — on the same fake Lab
(`dev/directorlean-lab.js`: a 3-layer scene, the 102-line tunnel from the concise fixture, a 70-line particle layer, a
glow filter, sliders from their tweak() blocks, a 3:12 song with sections / hits / energy, errors when asked). Text ≈
characters / 4 as the MCP server formats it (`mcp/common.js fmtValue`); pictures ≈ width × height / 750 (Claude's
rate). The asks run as one chat, one message each, like the owner's docked director chats.

What a turn sent, before: the user's message itself carries **no** scene context (the scene only comes through tools);
the fixed part is 2,827 tokens a step (`dev/tokens-test.js`); the rest is tool results, where the big items were
- **whole code again**: `get_code` / `read_code` re-sent a layer the session already had (≈ 1,200 tokens each), and
  `select_layer` / `get_code` came with every layer as a JSON object and a slider table that repeats the code's tweak()
  block (`select_layer` ≈ 1,640 tokens);
- **pictures**: 768 px screenshots (≈ 440), a play-test's **full-size PNG** (1080×1920 ≈ 1,840), the contact sheet
  (1710×1556 ≈ 2,980);
- **echoed JSON**: play / seek answered with the whole song analysis (≈ 875 tokens: energy every 5 s, sections, hits);
  `three_do layers` as JSON objects; slider moves answered with the whole table; the same 8 console lines in every
  edit result; add_layer listing the sliders the director had just written.

## Before → after (tokens added to the session per ask)
| ask | calls | text | pictures | **added to the session** | input over the turn's steps |
|---|---:|---:|---:|---:|---:|
| change a color ("make the rings pink") | 3 | 1310 → 1223 | 442 → 197 | **1752 → 1420** (−19 %) | 15,597 → 15,101 |
| add a layer ("sparkles that burst on the kick") | 4 | 264 → 103 | 884 → 308 | **1148 → 411** (−64 %) | 16,755 → 15,112 |
| fix an error (the Lab's "fix it" draft) | 5 | 931 → 751 | 442 → 197 | **1373 → 948** (−31 %) | 20,956 → 20,094 |
| "make it feel more energetic" | 9 | 3373 → 497 | 1237 → 552 | **4610 → 1049** (−77 %) | 52,369 → 32,355 |
| follow-up ("a bit more glow"), the owner saved a slider | 3 | 1345 → 165 | 442 → 197 | **1787 → 362** (−80 %) | 15,647 → 11,912 |
| play-test ("click to burst") | 1 | 5 → 5 | 1844 → 197 | **1849 → 202** (−89 %) | 7,507 → 5,860 |
| whole song ("show me the whole piece") | 2 | 950 → 97 | 2983 → 1272 | **3933 → 1369** (−65 %) | 13,295 → 9,878 |
| layers ("put the sparkles under the tunnel") | 3 | 2057 → 306 | 0 → 0 | **2057 → 306** (−85 %) | 14,056 → 11,947 |
| **all 8 asks** | 30 | 10235 → 3147 | 8274 → 2920 | **18509 → 6067** (−67 %) | 156,182 → 122,259 (−22 %) |

- **The whole 8-message chat** (38 steps): its history ends at **18,509 → 6,067** tokens of tool results; the input
  over all its steps (fixed part + history, before the cache discount) **385k → 228k (−41 %)**, or **−57 %** leaving out
  the fixed part. Every token kept out of the history is a token not re-read at each later step, so long chats gain most.
- "Change a color" gains least: the first look at a layer still sends its code (the director needs it). The gains are
  biggest on the second and later looks, on pictures, and on everything the Lab used to echo back.
- The fixed part is unchanged: 2,827 → 2,829 tokens a step (the guide's work-loop line says "look when the ask is
  visual" and "code once"; the lean tool list 1,184 → 1,184 tokens, its budget tightened 1,300 → 1,220).
- End to end with the fake engine's real MCP calls (`dev/checks/directorlean.js`): a new chat's Orb layer read again in
  the next message: **9,404 → 94 characters**; play / seek: one 49-character line.

## Upgrades
### Nothing sent twice in a chat
1. **Code the director already has isn't re-sent**: a layer it read (or wrote with add_layer / set_code, or edited from
   a copy it had) comes back as one line — "unchanged since you read it 1 message ago (force: true re-sends)" — in
   later messages of the same chat too, not only within one reply.
2. **Only the changed lines** when the layer changed since it saw it (the owner saved a slider, edited by hand): a
   small diff with the new line numbers, instead of the whole layer.
3. **Slider tables** read again unchanged: one line.
4. **Scene state said once per chat session** (sketch, frame, music, layers, the backstage note), then only changes —
   it was once per reply.
5. **Console lines**: each result shows only the lines it hasn't had (every edit result repeated the last eight).
6. **Safe by design**: the memory is per chat and per engine session; a new chat, a compact / continue lighter, a
   handover to the other engine, an error or a stop forgets it; anything older than 8 messages is sent again; a session
   that changed under a reply keeps only that reply's knowledge; `force: true` always re-sends.
### The scene as an outline + the layer involved
7. **get_code**: one line per layer ("2. Sparkles · add · 70 lines · 8 sliders · keys: opacity 0s=0, 8s=1") + only the
   selected layer's code; the slider table isn't repeated when the code (with its tweak() block) is there — only what
   the code doesn't say (music links, setup-only reads).
8. **Big layers as an outline from 160 lines** (was 350): functions, classes, tweak(), sections with line numbers; the
   director reads parts on demand (three_read_code from / to).
9. **select_layer** answers like get_code (it was the whole Lab report as JSON).
10. **three_do layers**: one line per layer with only what isn't the default (hidden, opacity, blend, time range,
    transform, sliders, keyframes, the owner's placements).
11. **Unsaved slider moves** as plain lines ("Speed (line 12): 0.8 in the code → 1.4 on the slider").
12. A node-built layer's graph line is shortened in read_code too (three_nodes edits it).
### Results trimmed to what the model needs
13. **Slider moves** answer with the sliders that moved, which keys couldn't be set, and a count of the rest.
14. **add_layer with code** doesn't list the sliders the director just wrote (a template still lists its sliders).
15. **Play / pause / seek / loop** answer with the transport in one line ("night-drive.mp3 paused at 64.1 / 192.3 s");
    `three_do media_info` still gives the whole analysis.
16. Edit / set_code / update_layer / console results drop the selected layer's slider-name list (the "add sliders"
    nudge stays).
### Pictures
17. **Screenshots are small (512 px) by default** (≈ 200 tokens instead of ≈ 440); `size: "medium" | "large"` or a
    region crop for detail; `/director-shot-size` still sets the owner's own default.
18. **A later picture in the same reply** that names no size is a 384 px thumbnail (≈ 110 tokens), with a short note.
19. **Play-test pictures** (three_input screenshot) are a 512 px JPEG — they were the full-size PNG (≈ 1,840 tokens).
20. **The contact sheet** fits 1024 px (≈ 1,270 tokens instead of ≈ 2,980 for 9:16); notes' and references' pictures
    512 px.
21. The work loop says to look "when the ask is visual" (same length as before).
### Guards
22. `node dev/directorlean-measure.js` (the table above; `--calls` per call, `--json`).
23. `node dev/directorlean-test.js` (unit group): the diff of a known copy, the outline, layer lines, the one-line
    transport, slider notes; the session memory (same reply, next message, force, an owner's edit → diff, error, a
    handover after the message went, older than 8 messages, another chat, calls without a chat); what it wrote is
    known; a safe edit that was undone; get_code whole / outline / unsaved; slider moves; picture sizes; the Lab's
    trimmed answers; byte-identical results for the same calls; and that every measured ask is lighter (≥ 55 % overall).
24. `dev/checks/directorlean.js` (fake engines, real MCP calls): the second message's read is one line, force, a small
    default picture, one-line seek, a new chat gets the code whole.
25. `dev/director-mcp-test.js`: the lean list's budget 1,300 → 1,220; three_read_code takes force.
26. Run group: `sh dev/run-checks.sh directorlean`.

## Files
`tools/three-director.js` (session memory per chat, outline / diff / layer lines / transport line, sliders, pictures,
`trim` for the Lab's own answers; loadable in Node), `mcp/three-mcp.js` (lean words for read_code (+ force), get_code,
sliders, screenshot; same size), `mcp/three-guide.js` (work-loop words; bigcode help), `director-cmds.js`
(`/director-shot-size` default small).
Small hook outside the director files: `tools/three.js` passes the call's chat to `ThreeDirector.handle` and runs the
Lab's own answers through `ThreeDirector.trim` (`directorCall` split into `directorCall` + `labCall`, 10 lines).
New: `dev/directorlean-lab.js`, `dev/directorlean-measure.js`, `dev/directorlean-test.js`, `dev/checks/directorlean.js`;
`dev/run-checks.js` (unit list, `directorlean` group); `dev/checks/director-tools.js` (layers are lines now).

## Tested
- `node --check` on every touched file.
- Unit: `directorlean-test`, `director-mcp-test`, `tokens-test`, `cache-test`, `concise-test`, `tokenaudit-test`: pass.
- Smoke (`sh dev/run-checks.sh directorlean`): directorlean, director-tools, labdirector, director-dock + the units: 8/8.
  labdirector failed once under load (a 9:16 screenshot timed out in the software renderer) and passed on the re-run.
- `labeasy`: pass. `scenedoctor`: fails one step ("one click hides it … no longer lists the error") — **the same step
  fails on the round 36 base** with the old `tools/three.js` / `tools/three-director.js` checked out, so it isn't from
  this change.

## Not done (on purpose) / risks
- **"Unchanged" relies on the engine keeping its history.** Claude Code and Codex resume the same session and keep
  every tool result; if an engine ever trimmed old tool results by itself, the director would get a line pointing at
  something it no longer sees — it can pass `force: true`, and anything older than 8 messages is re-sent anyway. A lost
  session that Hearth restarts mid-reply is noticed when the reply ends (that reply's knowledge only is kept).
- **Smaller default pictures**: 512 px reads colour, layout and motion well; fine detail (thin lines, small text) needs
  `size: "medium"` or a region — the description says so. The owner's `/director-shot-size medium` brings back the old
  default. A later picture in the same reply is 384 px unless a size is named.
- get_code's outline now starts at 160 lines (was 350): a 160–350-line layer costs one more read call when the director
  needs all of it (its outline points it to the right lines).
- The bigcode help topic grew ≈ 40 tokens (it rides along only in the opt-in "full" director mode).
- Directors still keep the whole chat tool list (tokensaver's note: ≈ 236 tokens a step could go to `chat_do`); left as
  is because the dock's asks name those tools.
- Numbers come from a fake Lab and scripted asks (no real chats here); the per-call shapes are the real code's.

## For the patch notes
- The Three Director now spends far fewer tokens per turn: on a typical set of asks, its tool results add about two
  thirds less to the chat (≈ 18.5k → 6k tokens over eight asks), and long director chats get cheaper with every message.
- It no longer re-reads code it already has in the same chat: unchanged code is one line, and when you changed something
  (a saved slider, a hand edit) it gets just the changed lines.
- It sees your scene as a short outline — one line per layer — plus only the layer it's working on; very long layers
  come as an outline it reads in parts.
- Screenshots it takes are smaller by default (still sharp enough to judge colour, layout and motion); it can ask for a
  bigger one or a close-up when detail matters. `/director-shot-size medium` brings back the old size.
- Play-test pictures, contact sheets and note screenshots are sent small too (they were sent full size).
- Moving sliders, playing or seeking the song now answer in a line or two instead of whole tables.
- Nothing to set up: a new chat, a compact or a switch to Astra simply starts fresh.
