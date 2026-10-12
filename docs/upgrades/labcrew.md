# Lab crew (round 22): the director deploys helpers for three.js variations

You said directors "sometimes should deploy agents for three.js". Now a **crew** does: 2–6 helpers each explore one
variation of the chat's scene at the same time, on hidden copies, while you watch their live thumbnails in one small
grid. You see the cost before anything runs, a running total while it works, and you can stop it at any time. Then you
pick one (or ask the director to pick) and it becomes the chat's scene, with one-click undo.

Try it: **`/crew 3 make it hit harder on the drop`** in a Three Director chat → check the estimate → **Start** (or
`/crew go`) → double-click the one you like. `/crew on` lets the director deploy a crew by itself in that chat.

## Why separate lean runs, not Claude's subagents (measured)
Both were options (round 21's `/subagents` path, or separate engine runs). Numbers from `mcp/cost.js` (`node dev/director-cost.js`) and the fake engines' real MCP calls:

| | Claude Task subagents (`/subagents`) | Crew helpers (shipped) |
|---|---:|---:|
| Tools re-sent on every step of a helper | the director's whole list: three-lab 1,784 + chat 575 = **2,359** + Claude Code's own subagent prompt | **710** (6 tools, 2,840 chars) |
| Fixed cost per helper step (tools + prompt) | ≥ 3,216 (what the director itself pays) | **924** (910 + a 60-token role line) |
| Cost on the director's own messages | Task tool on every message while on | **0** (off) · **+92** with `/crew on` (3,216 → 3,308) |
| Which scene a helper edits | all share the director's run and its `HUB_CHAT_ID`: the **same** scene | each its **own copy** on its own stage |
| Per-helper budget | none (one run) | tokens + calls, enforced by Hearth |
| Astra (Codex) | different multi-agent feature, no isolation | same path (`options.crew` works for both engines) |

## Cost of a crew (the estimate the grid shows, and what the fake run used)
- Estimate = per helper Σ over 5 inferences (4 tool calls + the answer) of (924 fixed + the brief + ≈ 450 tokens each earlier step added) + ≈ 900 out; time ≈ 5 × 9 s + 8 s, +8 % per extra helper (they run in parallel).
- 3 helpers on the orb starter: **≈ 32k tokens in all (≈ 10.7k each, mostly prompt-cache reads), ≈ 61 s**; budget cap 24k each (72k).
- The brief: 142 tokens + the scene's code when it fits in 6,000 characters (≈ 1.5k tokens: saves each helper one read step, ≈ 1k tokens and ≈ 9 s).
- "✦ Director picks": one lean question with a numbered contact sheet: **806 tokens** (fake run).
- Fake-engine run (this loaded test machine, software rendering at 2–12 fps): 3 helpers, 2 real MCP calls each, done in **11–29 s**; the running total read 3.1k tokens at the end (the fake counts prompt text only).

## Upgrades

### Start it, cost first
1. **`/crew [2–6] <brief>`**: helpers explore variations of this chat's scene in parallel, each on its own copy (3 by default).
2. **Cost before anything runs**: the grid opens with the estimate (tokens in all and per helper, the fixed cost per step from director-cost, the time) and **Start / Cancel**; nothing runs before your OK.
3. **`/crew go`** starts it from the chat; `/crew cancel` drops it.
4. **Running total** in the grid's header while it works (estimated from every tool result the hub sees, replaced by each run's real usage when it ends) and the time so far.
5. **A strict budget per helper**: ≤ 4 tool calls (stopped at 6) and ≤ 24k tokens, enforced by Hearth (the helper is stopped past it and keeps what it made); a helper stuck for 6 minutes is stopped too.
6. **Stop anytime**: ■ in the grid, `/crew stop`, or right-click a tile → Stop this helper.
7. **One angle per helper** from six (color, motion, look, music, form, camera), so the variations really differ; the director can give its own angles.

### Lean helpers (token frugality)
8. **A short shared brief, no chat history**: the scene, its layers, your brief, the helper's angle, its budget, and the scene's code when it fits (no read step).
9. **A crew toolset**: six Lab tools (edit, add layer, rewrite, read, screenshot, console), ≈ 710 tokens instead of ≈ 2,359; a five-line sketch guide instead of the director's guide and app map; no chat tools, nodes, memory or self-review.
10. **Each helper on its own stage**: a small hidden sandbox (360 px, 12 fps) per helper, so helpers never touch your scene or each other's; the stages are thrown away when the crew ends (GPU back).

### The variations grid
11. **Live thumbnails** of every variation as it evolves (every 3 s while you can see the grid, after each edit and each helper picture) and its last picture when it ends.
12. **Each tile says what its helper does**: the tool it's in, calls used, tokens; ✓ done, ✕ failed, ⊘ budget, ■ stopped, "errors" when its code broke; the number pulses while it works (still with reduced motion).
13. **Pick one**: click + **Use #n**, double-click, or `/crew pick 2`: its layers become the chat's scene, on screen at once.
14. **Undo the pick**: the toast's Undo, ↶ Undo #n in the grid, or `/crew undo`.
15. **✦ Director picks** (`/crew pick auto`): the director sees them side by side, numbered, and picks one with a short reason (one lean question).
16. **Keep the others as sketches**: `/crew keep all` / `/crew keep 3`, or right-click → Keep as a sketch; otherwise they're discarded.
17. **Right-click a tile**: use it, keep it, copy one of its layers into this chat's scene, see what it changed, stop its helper.
18. **`/crew`** shows the crew (each helper's line, total, time, the pick) and reopens the grid.

### Merge ("the motion from #2 and the colors from #4")
19. **`three_do crew {op: "code", n, layer}`** (and `/crew code 2`): what a variation changed in a layer, as a diff against the scene before the crew (`full: true` for the whole code).
20. **`three_do crew {op: "copy", from, layer, into}`** (and `/crew copy 4 Orb`): a variation's layer into the chat's scene through the director's own tools, so `three_do undo` reverts it.

### The director deploys it
21. **`/crew on|off`** per chat: with it on, the director may start a crew itself for an open look question (one prompt line, ≈ 92 tokens a message, only then).
22. **`three_do crew {op: "start", n, brief, angles}`**: the director proposes it, you see the cost and OK it in the grid; its answer comes back with every helper's line and one numbered contact sheet, so it can pick when you ask (`crew {op: "pick", n, reason}`).
23. **The crew shows in the liveness tree** of the director's running reply: each helper as an agent (its angle, running / done / failed, its tool calls and result), and the finished reply keeps "🤖 Deployed N agents".

### Calm and consistent
24. Crew edits stay out of your undo history, and parallel helpers each keep their own "scene state said once" (none hides the state from another or from the director).
25. Helper runs count in the usage meter like any reply.
26. `/director-cost` (and `dev/director-cost.js`) lists "Crew helper" and "Three (/crew on)"; the app map mentions `/crew`.

Count: **26** upgrades.

## Testing
- `dev/checks/crew.js` (lab group, fake engines): /crew 3 plans and shows the estimate with nothing running, /crew go, three
  helpers making real MCP calls through the crew toolset (the fake reports "6 tools, list 2,840 chars"), live thumbnails,
  running total, your scene untouched while they work, stages thrown away, edits out of the undo history, Use #2 on
  screen, /crew undo, the director's pick with a reason, keep all, crew code (diff) and copy through `three_do`, /crew stop
  (all stopped in ≈ 0.6 s), the director refused while crew is off, then a director-started crew approved in the grid
  with both helpers in the reply's liveness tree. **28/28 pass.**
- `dev/director-mcp-test.js` (+3 checks: crew toolset 6 tools / 710 tokens / no guide, the crew prompt, the /crew on line only when on): all pass.
- `dev/director-cost.js` (the new rows), `qa-commands`, `labdirector`: pass. `scenes`: 56/57, the known
  "switching cross-fades from a picture" timing step fails on this loaded machine (labdirector noted it fails on the base too).
- `node dev/lazy-manifest.js` rewritten (/crew and the `three_crew` prefix registered by the lab group); `node --check` on every touched file.

## Notes / risks
- Times are assumed for a real engine (≈ 9 s per step); on this machine everything renders in software, so wall times here are not claims.
- The budget is enforced on the live estimate (the engines report real usage only at the end of a run).
- Up to 6 extra hidden WebGL pages run while a crew works (12 fps, 360 px); the browser's limit on live WebGL contexts could drop the oldest one on a heavy scene with many layers.
- Variations live in memory until picked or kept: closing the app discards a crew you didn't keep.
- A helper that rewrites a layer keeps that layer's slider values for keys with the same name (as any rewrite in the Lab does).

## Outside this lane (small hooks)
`chat-scenes.js` (a crew helper's calls route to its stage, 3 lines), `chat-live.js` (`ChatLive.feed` export), `native.js`
(`crewOn` option when the chat has /crew on), `gamebridge.js` (a crew call may wait 20 min for your OK + the helpers),
`engines.js` (`options.crew`, `crewOn` line, HUB_TOOL_MODE=crew), `mcp/three-mcp.js` (crew toolset, `crew` in three_do),
`tools/three-backstage.js` (`ThreeBackstage.make` factory, `thumb`, `dispose`), `tools/three-director.js` (per-helper
"said once" state, crew sketches kept out of the history), `mcp/hearth-map.js` (one line), `lazy-data.js`,
`dev/fake-common.js` (crew helper plan), `dev/run-checks.js`, `dev/director-cost.js`, `dev/director-mcp-test.js`.
