# Meter stream: live tokens and usability totals

Everything below is in `meter.js` + `meter.css` (new), with the numbers kept by `store.js` in `data/kv/token-stats.json`.
Open the dashboard with **Ctrl+Shift+U** (⌘⇧U), a click on the meter, Ctrl+K → "Token dashboard", or `/usage`.
`/help meter` lists every command below.

## The meter strip (bottom of the window, 22 px)
1. Slim status strip under the chat area, showing live token numbers at a glance.
2. **Live ticking** while a reply streams: estimated output tokens from the streamed text and thinking, about 8 updates a second.
3. **Snap to real**: when the reply ends the cell flashes ✓ with the engine's real input → output numbers.
4. A thin rainbow line runs along the strip while anything streams (live = rainbow).
5. Several replies streaming at once (docked directors plus chats) are added up, and the tooltip says how many.
6. "This chat" cell: total tokens of the chat on screen (follows docked director chats too).
7. "Today" cell: today's total, turning orange near a budget and red past it.
8. Claude vs Astra cell: today's split with a two-color mini bar.
9. Cache cell: today's prompt-cache hit ratio (⚡ %).
10. Context gauge: how full the active chat's context window is (violet, orange past 30 %, red past 55 %).
11. Context cell click: menu with one-click **Compact this chat's context** and the long-context warning switch.
12. Replies cell: replies today (tooltip adds tool calls).
13. Average cell: average tokens per reply today.
14. **Usability total**: today's feature clicks (✦), live as you click; opens the Features tab.
15. Optional "Last 7 days" cell.
16. Optional reply-speed cell (output tokens per second).
17. Optional API-value cell (what today's Claude replies would cost through the API; you pay $0 extra).
18. Optional streak cell (days in a row).
19. Choose the cells: right-click → "Choose what the strip shows…" (`/meter fields`, `/meter-field <name> on|off`).
20. Every cell has a tooltip with exact numbers, and clicking it opens the matching dashboard tab.
21. ‹ tucks the strip into a single **rail pill**; right-click menu on strip and pill (dashboard, mode, fields, budgets, export, hide).
22. Hide the meter completely (`/meter off`); `/meter strip` brings it back.
23. On narrow windows the less important cells drop out first.
24. The strip hides in Lab Focus / Present; calm mode and "reduce motion" stop its animations.

## The rail pill
25. Today's total in the rail (or the live estimate while streaming), above ⚙.
26. Rainbow spinning dot while a reply streams.
27. Mini bar under the number: budget used today (or context fill when there's no budget), orange / red with budgets.
28. Click = dashboard, right-click = meter menu (`/meter pill`).

## Live estimate quality
29. Self-calibrating estimate: learns how many characters one token is for Claude and for Astra from real replies (`/calibration`).
30. The meter follows whichever chat is on screen, including directors docked in the Lab / Video Review.

## Dashboard (replaces the old Token usage list; Ctrl+K "Token usage" opens it too)
31. Ctrl+Shift+U opens / closes it.
32. Range switch: Today · 7 days · 30 days · All (remembered).
33. Remembers the last tab.
34. KPI tile: tokens with in / out and a 30-day sparkline.
35. KPI tile: cache hit %.
36. KPI tile: replies and average tokens per reply.
37. KPI tile: average reply time and output tokens per second.
38. KPI tile: tool calls and calls per reply.
39. KPI tile: API value (Claude's own estimate) with "you pay $0 extra".
40. KPI tile: feature clicks in the range.
41. ⧉ Copy a Markdown summary of the range.
42. Overview: stacked day bars split into cached input / fresh input / output, with a hover tooltip per day.
43. Overview: switch the day bars to **by agent** (agent colors).
44. Overview "Today": tokens by hour.
45. Overview: Claude vs Astra split bar.
46. Ring gauges: cache hits and output share.
47. Ring gauge per budget (green / orange / red).
48. "This chat" card: context ring, totals, peak, and a 🗜 Compact button.
49. "Your week": average tokens per weekday.
50. Agents tab: per agent table (tokens, in, cached %, out, replies, average) with bars and a 14-day sparkline each.
51. Models tab: the same per model.
52. Tools tab: per docked director tool, plain chat and second opinions.
53. Chats tab: **most expensive chats** with replies, context now, peak, and Open.
54. Chats tab: filter box.
55. Features tab: clicks today, streak (current / best), days tracked, hidden count.
56. Features tab: clicks per day chart.
57. Features tab: "Used today" list.
58. Features tab: hot features (your most used).
59. Features tab: cold features (not used for 3+ weeks) with Hide.
60. Features tab: **never used** list with a filter and Hide / Show on each row.
61. Features tab: "Show all hidden" brings every hidden control back.
62. Features tab: clicks per app area.
63. Budgets tab: daily budget per native agent with today's bar.
64. Budgets tab: alerts on / off.
65. Budgets tab: warning percentage.
66. Budgets tab: long-context threshold.
67. Export tab: save as CSV (per day × agent / model / tool, with cache, time, tool calls, API value).
68. Export tab: save as JSON (token stats + feature usage).
69. Export tab: copy the last 7 days as a Markdown table.
70. Export tab: rebuild the stats from your chats.
71. Export tab: tracking-since line and the learned estimate rates.

## Budgets & alerts (opt-in)
72. Daily token budget per agent (`/budget Claude 300k`); nothing is ever blocked.
73. One notification near the budget (default 80 %) with a "Budgets" button.
74. One notification past the budget.
75. Strip and pill change color with the budget state.
76. Budgets and "today" roll over at midnight on their own.
77. Long-context warning (opt-in, e.g. `/long-warn 60k`): a notification with a one-click 🗜 Compact.

## In the chat and the chats panel
78. New token line under every reply: in · out · ⚡ cache % · time.
79. Its tooltip: cached and cache-written tokens, tokens per second, API value.
80. Three badge styles: full, compact ("12k tok") or the old plain line (`/badges`).
81. Token total next to every chat in the chats panel (tooltip: replies and context now).
82. Panel totals on / off (`/panel-totals`).

## Data and tracking
83. `data/kv/token-stats.json`: per day × agent / model / tool, per hour and per chat, one small compact write per reply.
84. First run builds it from every chat's recorded replies, then tops each day up to the old usage.json counts (deleted chats, second opinions).
85. Engines now report cache reads and writes (Claude and Codex), Claude's API-price estimate, reply time and tool calls (no extra tokens, nothing added to prompts).
86. usage.json also keeps cached tokens.
87. Second opinions (Astra one-shots) are counted under their own tool.
88. Feature usage keeps per-day, per-feature counts (35 days) for "used today" and streaks.
89. Feature usage counts days in local time, like the token meter.
90. Live counters like "21k context" keep one stable feature name.
91. Clicks on the meter and in the dashboard are tracked under their own areas.

## Command palette (Ctrl+K)
92. Token dashboard (Ctrl+Shift+U).
93. Meter: strip / rail pill.
94. Meter: choose fields.
95. Daily token budgets & alerts.
96. Most expensive chats.
97. Features used today / never used.
98. Export token usage (CSV).
99. Export token usage (JSON).
100. Compact this chat's context.

## Chat commands (area "Meter")
101. `/tokens [today|week|month|all|chat]` totals with sparklines (alias `/tok`).
102. `/tokens <agent> [range]` one agent's totals and 14-day sparkline.
103. `/usage [tab]` opens the dashboard on a tab (aliases `/dashboard`, `/token-usage`).
104. `/meter [strip|pill|off|toggle|fields|reset]`.
105. `/meter window <model> <tokens>` sets a model's context window.
106. `/meter-field <field> [on|off]`.
107. `/budget [agent] <tokens|off>`.
108. `/budgets` every budget and today's use.
109. `/budget-left` tokens left today per budget (alias `/left`).
110. `/budget-warn <percent>`.
111. `/alerts [on|off]`.
112. `/long-warn <tokens|off>` (alias `/context-warn`).
113. `/cost-free [range]` API-price value vs $0 on your subscription (aliases `/free`, `/api-value`).
114. `/stats-today` (alias `/today`) with tokens by hour and today's clicks.
115. `/stats-week` (alias `/week`).
116. `/stats-month` (alias `/month`).
117. `/lifetime` (alias `/all-time`).
118. `/compare` today vs yesterday, this week vs last week.
119. `/forecast` the month at the current pace.
120. `/hourly` today by hour + busiest hour.
121. `/daily [days]` per-day sparkline.
122. `/weekdays` average per weekday.
123. `/peak` busiest day and hour.
124. `/session` tokens since Hearth started.
125. `/top-chats [n]` (alias `/expensive`).
126. `/models [range]`.
127. `/by-agent [range]` (alias `/agents-usage`).
128. `/by-tool [range]` (alias `/tools-usage`).
129. `/split [range]` Claude vs Astra bars (alias `/claude-vs-astra`).
130. `/cache [range]` cache hit ratio.
131. `/replies [range]` counts, averages, tool calls per reply.
132. `/speed [range]` reply time and tokens per second.
133. `/context` (alias `/ctx`) this chat's context gauge.
134. `/ctx compact` compacts this chat.
135. `/live` replies streaming now with their estimates.
136. `/estimate [text]` tokens of text or of your draft (alias `/count-tokens`).
137. `/last-reply` breakdown of the last reply (alias `/msg-tokens`).
138. `/chat-tokens` this chat's totals.
139. `/calibration` learned characters per token.
140. `/badges [full|compact|off]`.
141. `/panel-totals [on|off]`.
142. `/export-usage [csv|json|md]` (alias `/tokens-export`).
143. `/usage-rebuild` recount from the chats.
144. `/top-features [n]` (alias `/most-used`).
145. `/unused [area]` never-used controls (alias `/never-used`).
146. `/hide-feature <name>` hides a control everywhere.
147. `/show-feature <name|all>` (alias `/unhide`).
148. `/hidden` lists hidden controls.
149. `/hot` your hot features.
150. `/cold [days]` features gone cold.
151. `/streak` days in a row.
152. `/areas` clicks per app area.
153. `/feature <name>` how often and when you used one.
154. `/clicks` today's usability total and top features.
155. `/features` opens "Your usage" (alias `/your-usage`).

## Look
156. Forgeheart: gold for active numbers and KPI values, violet for AI working / context, rainbow for live, orange / red for budgets, cut corners and chrome-glass KPI tiles.
157. All meter colors are CSS variables (`--meter-active`, `--meter-ai`, `--meter-warn`, `--meter-over`, `--meter-info`, `--meter-ok`, `--meter-claude`, `--meter-astra`), so other skins restyle it.

**Total: 157 upgrades.**

For developers: `Meter.badge(message)`, `Meter.chatTotal(chat)`, `Meter.ingest(engineEvent)` (pass `local: true` to count a reply without the main process) and `dev/meter-fake-engine.js` (a stand-in Claude engine for `settings.enginePaths.claude`).
