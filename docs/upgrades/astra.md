# Astra stream: upgrades

Astra is the Codex (ChatGPT login) chat agent. This round makes it a full partner to Claude: it runs on its own,
side by side with Claude, or together with Claude in one chat. Everything works from chat commands (type `/` in any
native chat; `/help astra` or `/help collab` lists them). The visible UI is one small ⚇ chip in the composer, plus
the cards that collaborations leave in the chat.

Token rule: nothing here makes a normal message bigger unless you switch it on. Collaborations, second opinions and
quick asks run "lean" (no hub tools, no file tools), so each turn costs about one plain chat turn.

## A. Astra as a full chat agent (parity with Claude)
1. **Per-chat model**: `/astra-model <model>` (or the header's Model menu); `--default` changes the agent's default.
2. **Quick model switch**: Ctrl/⌘+Alt+M cycles the open chat through the engine's models.
3. **Per-chat reasoning effort**: `/astra-effort minimal|low|medium|high|xhigh` (Astra) or `low…max` (Claude chats too).
4. **Default effort from chat**: `/astra-effort high --default`.
5. **Two more effort levels for Astra in the agent editor**: Minimal (fewest tokens) and Extra high.
6. **Web search, opt-in**: off / cached (cheaper) / live, per chat with `/astra-web` or as a default in the editor.
7. **Answer length (verbosity)**: `/astra-verbosity low|medium|high|default`, and "Answer length" in the editor.
8. **Thinking summaries control**: `/astra-thinking on|off|concise|detailed`; off sends `model_reasoning_summary="none"` (fewer output tokens).
9. **"Show its thinking" checkbox now applies to Astra** in the agent editor.
10. **Opt-in file access for Astra**: pick a folder (editor → File access, or `/astra-files pick`). Read-only by default: Astra looks with short commands inside Codex's OS sandbox, no network.
11. **"Read + edit" file mode** (`/astra-files edit`, with a confirmation): writes allowed only inside that folder, network off.
12. **Sandbox re-applied on resumed sessions** (resumed Codex runs used to get no sandbox flag).
13. **Astra's prompt explains its file access** honestly (read-only vs edit, stay in the folder, tell you what to run).
14. **Attach any file to Astra when it has file access** (it opens it with a read-only command), like Claude.
15. **Talk-back tools for Astra (opt-in)**: `/astra-talkback on` gives it question cards, live plan checklists, chat pictures and second opinions from Claude (through MCP; adds tool descriptions, so off by default).
16. **Next-step suggestion buttons for Astra (opt-in)**: `/astra-suggest on` (`<suggest>` tags become buttons, as for Claude).
17. **Suggestions without talk-back tools** work for any agent (`suggestNext`), so Claude agents with talk-back off can have them too.
18. **Astra's own plan becomes the live checklist card** (Codex's todo list is shown like Claude's chat_progress).
19. **Shell commands appear as tool chips** ("Shell · rg -n TODO").
20. **Web searches appear as tool chips** ("Web search · query").
21. **File edits appear as tool chips** ("Edited · app.js", or "Edit failed").
22. **Streaming replies**: when Codex sends message updates, Astra's text streams in instead of arriving at the end.
23. **Reconnects and warnings no longer end a reply**: they go into the thinking fold with ⚠.
24. **Cached and reasoning tokens recorded** with each Astra reply (`usage.cached`, `usage.reasoning`).
25. **Token deltas verified and hardened**: running totals become per-turn numbers; a Codex version that reports per turn is detected (no more "0 in" turns).
26. **Personas per chat**: `/astra-persona <name>` replaces the agent's instructions for that chat only; memory stays (works for Claude chats too).
27. **Persona as the agent's default**: `/astra-persona coder --default`.
28. **Your own text as a persona**: `/astra-persona You are a…`.
29. **Save your own personas**: `/astra-persona-save <name> <instructions>` (kept in data/kv/astra-personas.json).
30. **Delete saved personas**: `/astra-persona-delete <name>`.
31. **List personas**: `/astra-personas`.
32. Persona preset **Coder**.
33. Persona preset **Reviewer**.
34. Persona preset **Writer**.
35. Persona preset **Researcher**.
36. Persona preset **Director helper** (music-driven Three.js and video).
37. Persona preset **Skeptic**.
38. Persona preset **Teacher**.
39. Persona preset **Brainstormer**.
40. Persona preset **Planner**.
41. Persona preset **Concise**.
42. Persona preset **Translator**.
43. Persona preset **Product designer**.
44. Persona preset **Debugger**.
45. Persona preset **Shader artist**.
46. **Effort presets**: `/astra-preset frugal|fast|balanced|deep|max` (effort + answer length, model untouched).
47. Effort preset **Frugal** (minimal reasoning, short answers).
48. Effort preset **Fast**.
49. Effort preset **Balanced**.
50. Effort preset **Deep**.
51. Effort preset **Max**.
52. **Settings typed before the first message apply to the new chat** (model, effort, web, persona…).
53. Agent preset **Astra Coder** (＋ → preset list).
54. Agent preset **Astra Reviewer**.
55. Agent preset **Astra Researcher** (cached web search).
56. Agent preset **Astra Quick** (low effort, short answers).
57. **Talk-back checkbox names the right partner** in the editor (Claude for Astra, Astra for Claude).
58. **`/astra-memory`** shows Astra's memory or adds a fact (`/astra-memory I prefer metric units`).
59. **`/astra-forget <text>`** removes matching memory lines.
60. **ChatGPT apps toggle explained**: `/astra-apps on|off` says where apps come from and what they cost.
61. **`/astra`** opens Astra (and sends a message if you add one), from any chat.
62. **`/astra-new`** starts a new Astra chat.
63. **`/astra-settings`** opens Astra's agent settings.
64. **`/astra-status`**: this chat's model, effort, web, persona, files, apps, talk-back, memory, session and collab totals.
65. **`/astra-reset`**: fresh engine session for this chat (the next message carries the conversation).
66. **`/astra-session`**: copies the session id and shows the terminal command to continue it (`codex resume …` / `claude --resume …`).
67. **`/astra-tokens`**: this chat's tokens split into replies, second opinions / quick asks, collaborations, and the Codex thread total.
68. **`/astra-usage [days]`**: tokens per agent (Astra and Claude) over the last days, with today's share.
69. **`/astra-color <#hex>|reset`**: Astra's accent color.
70. **`/astra-quick <message>`**: one message with the lowest effort and short answer (fewest tokens); the chat keeps its setting.
71. **`/astra-deep <message>`**: one message with the most reasoning (xhigh for Astra, max for Claude).
72. **`/astra-web-once <question>`**: one Astra message with live web search, the chat stays without web.
73. **Persona chips in the empty Astra chat** (Coder, Reviewer, Writer, Researcher, Director): one click sets the chat's persona.
74. **Models you type are remembered** per engine (completion and Ctrl/⌘+Alt+M include them).
75. **`/astra-prompt`**: shows the exact instructions + memory each agent sends with every message, and their size.
76. **`/astra-log [lines]`**: the last engine log lines (exit codes, stderr) for troubleshooting.
77. **`/astra-help`**: one-screen guide to Astra and the collaboration commands and keys.
78. **Minimal effort with web search on becomes low** (Codex can't combine them) instead of failing.
79. **`/astra-feature <feature> on|off`**: switch one of the 19 Codex features Hearth disables back on for Astra (e.g. view_image), knowing it adds tools to every message.
80. **`/astra-flags [agent]`**: the exact command line Hearth runs for an agent (frugal flags, disabled features, sandbox, model).
81. **`/astra-clone <persona>`**: adds an Astra variant with that persona to the rail (e.g. Astra Reviewer), ready as a collab partner.
82. **`/astra-memory-shared <fact>`**: adds a fact every agent keeps in mind.
83. **Astra's typing dots and thinking fold use its accent**.
84. **Today's tokens in the empty Astra chat** ("Today: 12k tokens in 9 replies").

## B. Docked directors on either engine (stretch goal)
85. **`/director-engine three astra`** runs the Three Director on Astra (Codex); `… claude` switches back.
86. **Works for the Video Director too** (`/director-engine video astra`).
87. **Directors keep their tools on Codex**: the hub's MCP tool sets (three_*, video_*, forge_*, chat_*) are passed to Codex as config overrides, nothing written to your Codex config.
88. **Switching back restores the old model and effort**.
89. **`/director-engine`** with no arguments lists the directors and their engines.

## C. Engine robustness (both engines, Claude's flags unchanged)
90. **Lost sessions recover**: when Codex or Claude no longer has a chat's session, the reply continues in a fresh session with the conversation as context (a ⚠ note says so) instead of failing.
91. **Stop is always "stopped"**, even when the engine exits cleanly after the signal (it used to show as an error).
92. **Stop keeps the session id**, so the chat resumes after a stopped reply.
93. **The last output line is no longer lost** when an engine ends without a final newline.
94. **Oversized output lines are dropped safely** (64 MB guard) instead of growing memory.
95. **Hung-run watchdog**: an engine silent for 50 minutes is stopped with a clear message (questions to you can still wait 45 min).
96. **An engine quitting before reading your message no longer throws** (stdin errors handled).
97. **Error fix: model not available** → says to pick another model (`/astra-model`).
98. **Error fix: usage limit reached** → wait, or lighter model / lower effort.
99. **Error fix: outdated engine** ("unexpected argument") → update the app, run `/astra-doctor`.
100. **Error fix: engine can't start** → check Settings → Engines, run `/astra-doctor`.
101. **Error fix: network problems**.
102. **Error fix: conversation too long** → compact or start from a summary.
103. **Error fix: sandbox refusals** → `/astra-files`.
104. **Sign-in detection widened** (expired / refresh token messages) with a sign-in hint.
105. **The most telling stderr line is shown** (an "Error" line rather than the last line).
106. **"Engine not found" explains the fix** (and says Mac on a Mac).
107. **Missing file-access folder is caught for Astra too**.
108. **Prompt files are per content** (no two parallel runs overwrite each other's instructions) and unused ones are cleared after a week.
109. **Paths with apostrophes are safe** in Codex config values.
110. **One-shot runs (`once`) have a timeout**, per-run options (model, effort, persona, lean) and return token usage.
111. **Unknown effort values are dropped** instead of failing the run.
112. **Stop ends the whole process tree on Windows** (Codex and its tool servers) and escalates to a hard kill elsewhere if the engine ignores the stop for 5 s.
113. **Usage-limit errors offer "Continue with <the other agent>"** in a toast (one-click handoff).
114. **Model-unavailable errors offer "Pick another"** (fills `/astra-model`).
115. **A reply that fails midway keeps what it already wrote** (marked stopped, above the error) instead of losing it (both engines).

## D. Onboarding and diagnostics
116. **`/astra-doctor`**: for Codex and Claude: found? where (Settings / PATH / desktop app)? version? Codex signed in? plus Astra's settings and fixes.
117. **`/astra-doctor --run`**: also sends Astra a tiny test message and reports the answer, time and tokens.
118. **Onboarding line in an empty Astra chat**: "✓ codex-cli x · signed in", or what's wrong with a one-click "Sign in with ChatGPT".
119. **Capability chips in the empty Astra chat**: model + effort, images, files, web, talk-back; click one to change it.
120. **"Try" links in the empty Astra chat** (/duo, /relay, /debate, /astra-persona, /astra-doctor).
121. **Collab tip in empty Claude chats** when an Astra agent exists.
122. **`/astra-login`**: opens Codex's own ChatGPT sign-in window.
123. Palette (Ctrl/⌘+K) action **Astra: diagnostics (doctor)**.
124. Palette action **Astra: new chat**.
125. Palette action **Astra: sign in with ChatGPT**.
126. **Doctor shows each agent's instructions + memory size per message** and its tool sets (where tokens go).
127. **Doctor checks the hub tool servers and the workspace folder** (present, writable, bridge running).

## E. Claude × Astra collaboration
128. **⚇ Collab chip in every native composer** (next to 📎): Solo, Duo, Relay, Critique, Debate, Council; your next messages go to both.
129. Chip menu: **swap who goes first**.
130. Chip menu: **rounds** (1–4).
131. Chip menu: **who writes final answers** (this agent or its partner).
132. Chip menu: **second opinion on the last reply**.
133. Chip menu: **hand this chat off** to the partner.
134. **Right-click the chip** for ready-made collaborations.
135. **Armed composer look**: the chip glows and the box gets a Claude→Astra gradient while a mode is on.
136. **`/collab duo|relay|critique|debate|council|off [rounds]`**, `/collab swap`, `/collab` (menu).
137. **Duo** (`/duo <message>`): both answer at once, side by side in one card.
138. Duo: **Pick this one** keeps an answer; your next message continues from it.
139. Duo: **⧉ Merge both** (written by this chat's agent) and **Merge by <partner>**.
140. Duo: **⚖ Judge**: one reads both answers, names the better one and why, and keeps it.
141. Duo: **± Differences**: a line-by-line diff of the two answers.
142. Duo: **Copy** per answer.
143. **Duo conversations remember**: a later duo in the same chat continues both engine sessions (only the new message is sent); ↻ marks it, `/duo --fresh` starts over.
144. **Relay** (`/relay claude→astra 2 <task>`): one drafts, then the other improves it, alternating for N passes; each pass ends with a "Changes:" line.
145. **Critique** (`/critique astra→claude 1 <task>`, also `/review-by`): one drafts, the other reviews, the first revises; stops early when the reviewer says LGTM.
146. **Debate** (`/debate 3 <question>`): both answer, read each other and reply for N rounds, then one merged final answer.
147. **Council** (`/council claude,astra,astra@skeptic <question>`): several seats answer, the chair writes the final answer.
148. **Compare** (`/compare-agents astra:gpt-6-sol,astra:gpt-6-luna <task>`): the same task on different models or agents, up to 3 columns.
149. **`/astra-compare-models <task>`**: every Astra model side by side.
150. **Seats with a model**: `astra:gpt-6-luna`.
151. **Seats with a persona**: `claude@reviewer`, or a bare persona (`coder,reviewer` alternates engines).
152. **Seats with an effort**: `astra~low`.
153. **`all` as seats**: every chat agent in the rail (`/council all …`).
154. **Directions in plain words**: `claude→astra`, `astra->claude`, `claude to astra`.
155. **Collapsible rounds**: each round folds to one line (who did what, tokens); the final answer stays open and starred.
156. **Fold a whole card** to one line (click its title).
157. **Live streaming** into the card while each seat writes.
158. **Per-participant token totals** in the card header (hover for in / out / turns) and a Σ total.
159. **Per-turn tokens and time** on every part.
160. **■ Stop** on a running card, `/collab-stop`, and Ctrl/⌘+Alt+S.
161. **Retry a failed seat** (card ⋯) without re-running the others.
162. **Run it again** and **Run again, order swapped** (card ⋯), `/collab-again [new task]`.
163. **Put the final answer in the composer** (card ⋯).
164. **Copy the final answer** and **Copy everything (Markdown)** (card ⋯), `/collab-export`.
165. **Token totals dialog** (card ⋯).
166. **Continue with <agent>** from a card (hands the result to that agent's chat).
167. **`/pick <1|2|name>`** and **`/merge [judge]`** from the keyboard.
168. **`/collab-stats`**: every collaboration's tokens in this chat, per participant.
169. **`/collabs`**: list this chat's collaborations and jump to one.
170. **The outcome reaches the conversation, once**: the host agent's next message carries the kept / final answer only if its own session didn't see it (frugal).
171. **Pictures and text files you attach go to every seat**.
172. **`<remember>` in collaborations** saves to that seat's memory, with Undo on the card.
173. **`<suggest>` buttons** under a collaboration's final answer send to this chat.
174. **Unread dot / notification** when a collaboration finishes while you look elsewhere.
175. **Usage events for the token meter** (`hearth:usage` with agent, tokens and source: collab, second opinion, quick ask).
176. **Handoff** (`/handoff [agent]`): continues this chat with the other agent from a compact summary written in the current agent's own session.
177. **`/handoff --raw`**: a short excerpt of the last messages instead, no extra turn.
178. **Ctrl/⌘+Alt+H** hands off to the partner.
179. **Ctrl/⌘+Alt+D** turns Duo mode on / off.
180. Palette action **Collab: Duo mode on / off**.
181. Palette action **Collab: second opinion on the last reply**.
182. Palette action **Astra: next model for this chat**.
183. **Card menu: One more round** for a finished debate or council (then a new final answer, resuming each seat's session).
184. **Card menu: One more improvement pass** for a finished relay.
185. **Card menu: Save as a Markdown file…**.
186. **Card menu: Read the final answer aloud**.
187. **Click a seat in the card header** to open that agent.
188. **Same agent in two seats gets a second shade**, so its columns and dots stay distinct.
189. **`/collab-budget 50k`**: any collaboration stops itself once it has used that many tokens (a note on the card says so).
190. **`/collab-scoreboard`**: whose answers you keep (picks and judge verdicts) per agent and mode, kept in data/kv/astra-scoreboard.json.
191. **`/collab-partner <agent>`** (and the chip menu): collaborate with e.g. Astra Coder instead of Astra.
192. **`/collab-persona coder reviewer`**: personas for this chat's two collab seats.
193. Chip menu: **After a duo: merge / judge / nothing**, so a duo can end with one answer on its own.
194. **`~low <task>`** in any collab command gives every seat that effort (`/debate ~low 2 …`).
195. **`/duo-last`**: runs your last message again as a duo.
196. **`/collab-export all`**: every collaboration of this chat as Markdown.
197. **`/handoff back`**: from a handed-off chat, return to the original one, carrying what was said meanwhile (once).
198. **Chip shows the partner's color** as a small dot.
199. **An armed composer says where your message goes** ("⚇ Duo: message Claude and Astra…").
200. **Seat completion** in `/duo`, `/council`, `/compare`, `/debate`: type `claude@` for personas, `astra:` for models, `astra~` for efforts.
201. **Each seat's thinking and tool use are kept** in the card (folded "Thought process", "Used …" chips), like a normal reply.
202. **A seat that isn't signed in shows a Sign in button** in its part of the card.
203. **`--judge <agent>`** on `/debate` and `/council` picks who writes the final answer.
204. Card menu: **Save the final answer to Notes**.
205. Chip menu: **Ready-made collaborations…**.
206. **The chip's tooltip shows what the last collaboration of that mode cost** in this chat.
207. **An empty Send or Esc stops a running collaboration** in this chat.
208. **Ctrl/⌘+Alt+C** opens the collab menu.
209. **Calmer cards with reduced motion**: the running animation stops when the system asks for less motion.
210. **Council with 2 rounds** (`/council 2 …` or chip rounds): seats review each other briefly before the chair decides.
211. **Debates stop early when everyone says AGREED** (no wasted rounds).
212. **Copy any single part** of a relay / critique / debate round.
213. Card menu: **Follow up with both…** (a new duo that continues both sessions).
214. **`/collab-again swap`**: the same task with the other agent going first.
215. **`/handoff astra:gpt-6-luna@reviewer`**: hand off to a specific model and persona.

## F. Second opinions, both ways
216. **👁 Second opinion in Astra chats asks Claude** (it used to exist only for Claude chats).
217. **`chat_second_opinion` from Astra asks Claude** (with talk-back on); from Claude it still asks Astra.
218. **Second opinions run lean** (no tools for the judge), so they cost about one plain turn.
219. **Second opinions show their tokens** in their header.
220. **`/opinion [claude|astra]`** and **Ctrl/⌘+Alt+O**.
221. **`/ask-astra <question>`**: a quick Astra answer right in this chat (one lean turn), with "Ask X to use it".
222. **`/ask-claude <question>`**: the same with Claude.
223. **`/redo-with [agent]`**: asks your last message again to the other agent, answer shown right here.
224. **`/opinion-auto on`**: after every reply in this chat, the other agent gives a second opinion (one lean turn each; off by default).
225. **`/opinion --shot`**: the second opinion also sees a screenshot of the window (docked directors already sent the Lab).
226. **`/ask-astra` and `/ask-claude` take `--shot`** (attach a screenshot) and **`@persona`** (answer as reviewer, skeptic…).
227. **`/attach-screen`**: attaches a screenshot of the window to your next message (both engines see pictures).
228. **`/attach-lab`**: attaches the Three.js Lab preview.

## G. Collaboration presets (`/collab-preset`, `/cp`, one searchable picker)
229. **Brainstorm** (council: two brainstormers + a skeptic), also `/brainstorm`.
230. **Code review** (Claude codes, Astra reviews, Claude fixes).
231. **Pair programming** (relay of two coders), also `/pair`.
232. **Fact check** (Claude answers, Astra checks as researcher), also `/factcheck`.
233. **Writing room** (Claude drafts, Astra edits).
234. **Plan it** (two planners and a risk check).
235. **Explain it** (two teachers side by side).
236. **Debug** (two debuggers side by side).
237. **Visual direction** (director, shader artist and a critic: for the Lab).
238. **Red team** (Astra attacks, Claude defends, then a verdict), also `/redteam`.
239. **Product call** (two product designers debate).
240. **Translation check**.
241. **Explain simply** (two short teacher answers at low effort).
242. **Name it** (names and taglines from two brainstormers, a product designer picks).
243. **Email polish** (Claude writes, Astra shortens).
244. **Security pass** (Astra looks for risks in Claude's code, two rounds).
245. **Summary duel** (two tight summaries side by side).

## H. Astra's look (CSS variables `--astra`, `--astra-2`, `--claude` for themes)
246. **Starry ring avatar** with a glowing ✦ in the empty Astra chat.
247. **✦ before Astra chat titles**.
248. **Astra accent line** on its replies and its composer focus.
249. **✦ star on rail buttons** of agents that run on the Astra engine.
250. **Collaboration cards**: Claude→Astra gradient edge that flows while running, seat-colored columns, starred final answer.

## Tests
- `node dev/astra-engine-test.js`: 25 engine checks against the fake engines (flags, file sandbox, MCP, parser, deltas, errors, lost sessions, stop, personas, doctor).
- `node dev/astra-smoke.js collab`, `… ui` and `… manager`: the app under Xvfb with `dev/fake-codex-astra.js` and `dev/fake-claude-astra.js` (Codex / Claude stand-ins speaking their real JSONL) driving every collaboration, the chip, second opinions, handoff, doctor, personas, director switch and the agent editor.
