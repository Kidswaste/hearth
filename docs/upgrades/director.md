# Director stream (round 2): faster, cheaper, smarter directors

Your Three Director (docked next to the Lab) is where you spend most of your time, and its tool calls were the most
used features in the app (eval 76, edit 61, screenshot 46, read 39, search 32, sliders 28). This round makes every
director message cheaper, cuts the round trips of a typical "change it and look" loop, and gives the docked chat a
live view of what the director is doing, one-click undo of its edits and quick asks. Everything has a chat command
(`/help director`, or `/director <sub>`).

## What it costs per message (before → after)
Fixed overhead of each director on every message (tool list + MCP instructions + its part of the system prompt;
≈ characters / 4, measured with `node dev/director-cost.js` and `/director-cost`):

| Director | Before | After (lean, default) | Saved |
| --- | ---: | ---: | ---: |
| Three Director | 8,686 | 2,842 | −67 % |
| Video Director | 2,133 | 1,568 | −26 % |
| Forge Debug | 2,592 | 1,532 | −41 % |
| Plain Claude chat (chat tools) | ≈ 800 | ≈ 420 | −48 % |

"Before" counts the MCP servers' instructions (3,793 tokens of guide for the Three Director). If the Claude CLI drops
MCP instructions when the hub replaces its system prompt (likely, and the reason the Forge guide had been pasted into
`forge_eval`), the old Three Director really paid ≈ 4,600 and never saw its own guide: now the short core guide is
in the system prompt, so it is both cheaper and actually delivered. Full mode (`/director-mode full`) is 7,472.

Per call, results shrank too (measured in `dev/checks/director-tools.js`, characters the model reads):

| Call | Before | After |
| --- | ---: | ---: |
| three_edit_code (small edit) | 1,330 | 390 + a 384 px preview if asked |
| three_set_code | 1,187 | 368 |
| three_get_code | 3,658 | 2,209 |
| three_search_code "mesh" (2 layers) | 1,902 | 856 |
| three_sliders (3 sliders) | 493 | 144 |
| three_console | 2,091 | 314 (full: true 1,299) |
| three_read_code 30 lines | 1,113 | 1,007 |
| default screenshot | 1280 px ≈ 1,230 tok | 1024 px ≈ 790 tok |

A typical "make it hit harder on the kick" loop went from search → edit → screenshot → console (4 calls, ≈ 3.3k
tokens of results) to search → edit with shot: true (2 calls, ≈ 0.6k tokens).

## Token audit and lean tool lists (1–24)
1. **Lean mode** (default) for the Three Director: the 12 everyday tools keep their own entries; the 18 rarer ones share one tool.
2. **three_do**: one multi-command tool for layers, select / add / update / remove layer, keyframes, animate, timeline, timeline edit, looks, notes, references, triggers, media info, load media, frame size, new sketch.
3. **three_do help**: guide topics on demand (audio, sliders, looks, layers, filters, keyframes, timeline, refs, notes, scene, live, games, frame, bigcode, all), answered by the tool server itself with no trip to the hub.
4. **Topic aliases** for help (music, cues, grid, palette, variations…).
5. **Full mode** opt-in: every tool on its own and the whole guide every message (`/director-mode full`).
6. **Short core guide** (≈ 650 tokens) instead of 3,800: sketch rules, sliders, music globals, the work loop, layers.
7. Guides moved **into the system prompt**, which the hub controls, so directors really receive them.
8. Three Director's system-prompt part cut from 713 to a role line plus the core guide.
9. Every tool description rewritten shorter without losing an option.
10. The layer-reference explanation is said once (in three_do), not in every schema.
11. **Forge Debug**: the game's globals are no longer sent twice (instructions + forge_eval).
12. **forge_patch**: save / list / remove patches merged into one tool.
13. Forge tool descriptions tightened (spawn types live in the guide only).
14. **Video Director** tools tightened; its guide folded into its system prompt.
15. **Chat tools** (ask / progress / show / second opinion): guide and descriptions no longer repeat each other.
16. Plain Claude chats no longer carry the chat_ask / second-opinion sentence (only the `<suggest>` convention).
17. Old tool names keep working (the hub routes them), so nothing a director learned breaks.
18. **Compact result text** for every hub tool: "key: value" lines instead of indented JSON (≈ 30–40 % fewer characters on structured results).
19. `/director-cost`: each director's fixed cost per message and what it is made of, with lean vs full.
20. `/director-cost all`: every director at once.
21. `/director-tools [three|video|forge|chat]`: each tool's own cost, biggest first.
22. `/director-guide [topic]`: read exactly what the director reads for a topic.
23. `node dev/director-cost.js` (`--tools`, `--json`): the same report for development.
24. MCP servers can be loaded for their definitions without starting (for the report and tests).

## Faster loops (25–68)
25. **three_edit_code returns a compact diff** (removed / added lines with line numbers) instead of the whole Lab report.
26. Edit results include errors, new console lines and fps in one call.
27. **shot: true** on an edit adds a small preview picture (≈ 150 tokens) — no separate screenshot call.
28. **Batch edits across layers**: each edit can name its own layer.
29. Batches are **atomic**: if one edit misses, nothing changes.
30. A missed find says which line has the same text with different whitespace.
31. Edit results list **sliders the edit added or removed**.
32. Errors come with **the offending line of code** next to them (edit and set_code).
33. `report: "full"` on edits / set_code gives the old full report.
34. **three_set_code** returns a compact report (errors, console, fps, frame, slider names, music).
35. **three_update_layer** returns a compact report too.
36. **three_console**: errors, 14 lines, stats; `full: true` for sliders / layers / music.
37. **three_screenshot size**: small 512 / medium 1024 (default, was 1280) / large 1280.
38. Screenshot **region** crop [x, y, w, h] (detail at full resolution).
39. Screenshot **at**: seconds, "drop", "kick", "snare", "hit" or a cue name — seeks first.
40. Screenshot **compare**: the previous picture and now side by side, labelled.
41. Screenshot **frames**: a strip of 2–8 frames `gap` seconds apart, labelled with song times.
42. **Unchanged picture detection**: the same view with no visible change in one reply comes back as a one-line note (force: true sends it).
43. `/director-shot-size small|medium|large`: the default size for every director screenshot.
44. `/director-autoshot on`: every edit returns a preview automatically (off by default).
45. **three_read_code as plain numbered text** (no JSON escaping).
46. three_read_code **around: line** reads ±20 lines.
47. **Re-reading unchanged lines** in the same reply returns a one-line note instead of the code.
48. **three_search_code**: merged context windows, so shared lines print once.
49. Search strips each window's common indentation (no walls of spaces).
50. Search lines trimmed to 160 characters.
51. Search groups hits by layer with a count header; `max` hits (default 40).
52. **three_eval result truncation** at `max` chars (default 3000) with a hint how to narrow it.
53. three_eval returns plain values (no wrapper object) when nothing was printed.
54. three_eval shows **only the console lines it printed** (not the last 5 lines whatever they were).
55. **three_eval samples / every**: the same expression n times over time (does it jump on kicks?) without screenshots.
56. **three_sliders as one line per slider** (key = value · label [range] (group) ♪ music link, setup-only flag).
57. three_get_code: sliders as lines, layers as one line.
58. Edit / set_code / update_layer record the **director's code history** (40 entries) for undo.
59. Undo checks the layer wasn't changed since (yours or a slider save) and offers "undo anyway".
60. Undo reopens the sketch the edit belonged to when another one is open.
61. **Redo** of an undone edit.
62. three_load_media (also via three_do) gets a 3-minute limit instead of 1.
63. three_do needs `cmd` and says so when it's missing.
64. Tool routing picks the **most specific handler** (three_nodes no longer depends on script order).
65. Usage stats keep counting the real tools (three_do keyframes counts as three_keyframes).
66. `HubBridge.call(tool, args)`: run any director tool exactly like an agent (tests, `/director-try`).
67. `/director-try <tool> [json]`: run a director tool yourself with no tokens, see its result size.
68. Tool results report their size for the activity strip (text + pictures ≈ w×h/750).

## Docked chat (69–107)
69. **Activity strip** at the top of the docked chat: the director's last 12 tool calls as icons.
70. Running calls pulse violet, failed ones turn red.
71. Hover a call: what it did, its arguments in short, how long it took, its error.
72. This reply's summary: calls, edits, **≈ tokens read from tool results**, failures.
73. Click the icons: the full activity list (25 calls with tokens and time).
74. Clear the list from it.
75. **Mini thumbnail** of the last picture the director looked at.
76. Click it: the picture large, with **Attach to the chat**.
77. **↶ Undo the director's last edit** button (shows which layer, which tool, how long ago).
78. **✦ menu**: quick asks, hide / show chips, add a chip, redo, cost, collapse.
79. **Quick chips** above the chat box, one line, scrolling sideways.
80. Chip: 🥁 Hit harder on the kick (sent to the director).
81. Chip: 🎨 Shuffle colors (runs `/shuffle colors` here, no tokens).
82. Chip: 💾 Save this look (runs `/save-look` here, no tokens).
83. Chip: ✨ 3 variations (sent).
84. Chip: 🔧 Fix the errors (runs `/fix-errors`).
85. Chip: 🌊 Change on the drop (sent).
86. Video Director chips: 🎞 Review the open render, 📝 Do my notes.
87. Forge Debug chips: 👾 Spawn 20, 🛡 God mode.
88. Local chips have a dashed outline (free), sent ones a solid one.
89. A chip pressed while the director is busy goes into the chat box instead.
90. **Your own chips** (✦ → Add a quick chip, `/director-chips add …`); start with / to run a command.
91. Right-click your chip to remove it.
92. **Collapse to a thin bar** (⇥): the director's icon, its name, a busy dot.
93. A gold dot on the bar when a reply finished while it was folded.
94. Click the bar to open the chat again (focuses the box).
95. **Double-click the divider** to collapse / expand.
96. **Right-click the divider**: width presets 360 / 420 / 520 / 640 / 760 px, reset, collapse.
97. Collapse state remembered per tool (width already was).
98. **Alt+Shift+Z** undo the director's edit, **Alt+Shift+Y** redo (in the Lab).
99. **Alt+Shift+D** collapse / open the docked chat.
100. The strip and chips come back if the chat re-mounts.
101. The strip turns violet while the director is working.
102. Forgeheart look for the strip (mono summary, dark gradient).
103. The thin bar shows "working…" / "a new reply" in its tooltip.
104. Thumbnail only shows pictures from this tool's director.
105. Chat activity of other agents never shows in a director's strip.
106. The activity log keeps the last 60 calls.
107. Strip, chips and bar are hidden behind nothing new on screen: one 26 px row and one chip row.

## Collaboration: Astra as a director (108–116)
108. **Any director can run on Astra** (Codex): the same hub tools reach Codex as MCP servers through `-c mcp_servers.<name>.*` flags.
109. `/director-engine astra|claude`: switch the director's engine (opens a new chat, sessions can't move between CLIs).
110. `/astra-tools on|off`: the per-agent opt-in (`agent.hubTools`) for Codex agents.
111. Codex directors get the same lean guides in their instructions file.
112. Codex tool timeouts set per tool set (5 min; 45 min for renders and questions).
113. `--ignore-user-config` keeps your own Codex MCP servers out of director runs.
114. One-off calls (second opinions) never get hub tools (no recursion, no extra tokens).
115. Astra's tool calls show in the chat steps and the activity strip like Claude's.
116. Fake Codex reads the `-c mcp_servers` flags and makes real MCP calls (tested end to end).

## Commands (117–141)
117. `/director-cost [all]`
118. `/director-tools [three|video|forge|chat]`
119. `/director-guide [topic]`
120. `/director-mode [lean|full]`
121. `/director-engine [claude|astra]`
122. `/astra-tools [on|off]`
123. `/director-setup [three|video]`: makes the Three Director (or Video Director) docked in its tool if missing.
124. `/director-ask <message>`: send the docked director a message from any chat.
125. `/undo-edit [force]`
126. `/redo-edit`
127. `/director-edits`: its code edits this session, newest first.
128. `/director-activity [n]`
129. `/director-stats`: calls per tool, average time, tokens read, failures, pictures, and what wasn't re-sent.
130. `/director-clear`
131. `/director-peek`: the last picture it looked at.
132. `/director-try <tool> [json]`
133. `/dock-width <px|reset|wider|narrower>`
134. `/dock-collapse [on|off]`
135. `/director-chips [on|off|add|remove|reset]`
136. `/director-autoshot [on|off]`
137. `/director-shot-size [small|medium|large]`
138. `/director <sub>`: every command above as a subcommand (`/director cost`, `/director undo`…); `/director` alone still shows / hides the Video Director.
139. Argument suggestions for every command.
140. Commands register only under free names (a taken name is skipped with a console note).
141. `/help director` lists them (area "Director").

## Testing tools (142–146)
142. `dev/checks/director-tools.js`: every director handler called like an agent, with size comparisons.
143. `dev/checks/director-dock.js`: end to end with real MCP calls, the strip, undo, commands, collapse, Astra.
144. Fake Claude `mcp` keyword: really calls the hub MCP servers from `--mcp-config` (`mcp: [[tool, args]…]` line).
145. Fake Codex `mcp` keyword: the same from `-c mcp_servers.*`.
146. `dev/director-cost.js` with the opt-in modes for comparison.
147. `dev/director-mcp-test.js`: starts every hub MCP server like the CLIs do and checks lean / full lists, local help, no instructions, result format.

Count: **147** upgrades (honest count: features, options, commands, chips, shortcuts and visible polish; internal
refactors not counted).

## Notes
- Codex MCP: not verified against a real Codex binary here (none in this environment). The flags follow Codex's
  documented `mcp_servers` config (command / args / env / startup_timeout_sec / tool_timeout_sec). If a Codex version
  rejects them, `/director-engine claude` switches back; nothing changes for Claude directors.
- Whether the Claude CLI forwards MCP server instructions with `--system-prompt` wasn't verifiable here either; the
  new layout doesn't depend on it (servers send no instructions; the guides live in the system prompt).
