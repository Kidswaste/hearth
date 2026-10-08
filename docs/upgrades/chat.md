# Chat stream: upgrades

The native chat is now the app's core, and every chat feature can be driven by a chat command: type `/` in
any chat box (the docked Three Director / Video Director chats too). `/help` lists everything, `/help <word>`
filters, and every command is also in the Ctrl+K palette as "/name — what it does". Nothing here adds to the
system prompt: style commands (`/tone`, `/persona`, `/lang`, `/style`) ride along once with your next message.

Counted: 304 upgrades (144 commands, 60 presets, 100 features / visible polish). Development tooling, API
additions and fixes are listed at the end but not counted.

## Chat commands — Chat (managing chats)
1. `/new [message]` — new chat, optionally sending the first message (Ctrl+N).
2. `/rename [title]` — rename this chat (undo with `/undo`).
3. `/title [ai]` — name the chat from its content for free; `ai` lets the agent write it (one small call).
4. `/auto-title on|off` — new chats get a content title after the first reply (free).
5. `/pin` — pin / unpin this chat at the top of the list.
6. `/delete` — move the chat to Recently deleted, with Undo (toast or `/undo`).
7. `/restore [title]` — list deleted chats or bring one back.
8. `/undo` — undo the last chat action (delete, rename, title, forget, clear draft, archive, remember).
9. `/duplicate` — copy this chat; the copy continues on its own.
10. `/branch [#]` — new chat from a message, to try another direction.
11. `/open <chat>` — open any chat by title (suggestions as you type).
12. `/recent [agent | n]` — your latest chats, clickable.
13. `/pins` — pinned chats and the messages pinned in this chat.
14. `/next-chat` / 15. `/prev-chat` — step through this agent's chats.
16. `/unread` — chats with replies you haven't seen.
17. `/next-unread` — open the next one.
18. `/mark-read` — clear every unread mark.
19. `/mark-unread` — keep this chat flagged for later.
20. `/tag <tags>` — tag the chat (`#tag` in the search box finds it).
21. `/untag <tag | all>`.
22. `/tags` — this chat's tags and folder, and every tag in use (clickable filters).
23. `/folder <name | none>` — put the chat in a folder; the list groups folders under each agent.
24. `/filter <pinned | today | week | unread | busy | archived | tag:x | folder:x | agent | all>` — filter the chat list.
25. `/sort <recent | oldest | title>` — order of the chat list.
26. `/archive` — hide a chat from the list without deleting it.
27. `/unarchive`.
28. `/stats-all` — all your chats in numbers.
29. `/import` — import one chat from a JSON (from `/export json`) or Markdown file.

## Chat commands — Messages
30. `/find [text]` — find in this chat: all matches highlighted, Enter / Shift+Enter step (Alt+F).
31. `/search <text>` — search inside every chat; clickable results with snippets.
32. `/jump <# | top | bottom | mine | reply | pin | bookmark | new>` — scroll to a message.
33. `/fold [# | all]` and 34. `/unfold [# | all]` — long replies.
35. `/fold-code` and 36. `/unfold-code` — every long code block.
37. `/thinking [open | close | always | never | show | hide | copy]` — the Thought-process blocks (Alt+T).
38. `/retry [model]` — write the last reply again, optionally with another model.
39. `/edit [#]` — edit one of your messages and resend.
40. `/quote [#]` — quote a message in your next one.
41. `/continue` — continue where the reply stopped.
42. `/repeat` — send your last message again.
43. `/copy [last | code [n] | all | # | thinking | mine]` (Ctrl+Shift+C for the last reply).
44. `/code [n] [copy | save | lab | nodes | insert]` — list the chat's code blocks or act on one.
45. `/links` — every link in the chat.
46. `/files` — every attachment in the chat.
47. `/raw [#]` — show a reply's Markdown source in place.
48. `/pin-msg [#]` — pin a message; pinned ones show in a strip on top.
49. `/bookmark [#]` — bookmark a message (Alt+B for the last reply).
50. `/bookmarks` — bookmarks across every chat.
51. `/react <👍 👎 ❤️ 🔥 🤔 | up / down / love / fire / hmm> [note]` — feedback on the last reply, kept (not sent).
52. `/feedback` — your reactions and notes in this chat.
53. `/unmark [# | all]` — clear pins, bookmarks and reactions.
54. `/read [# | stop | rate x | voice name | auto on|off]` — read aloud (Alt+R).
55. `/review` — ask it to check its own last result.
56. `/opinion` — Astra's second opinion on the last reply.
57. `/summarize [n | short | long]` — compact summary of the chat so far.
58. `/compact` — compact the context (the chat keeps every message).
59. `/fresh` — continue in a new chat from a short summary.
60. `/stats` — messages, words, tokens, time, tool calls, model.
61. `/tokens [today | week | all]` — per-reply token use, or every agent over a period.
62. `/context` — what each message costs now and how to shrink it.
63–75. Quick follow-ups, each one short prompt about the last reply: `/shorter`, `/simpler`, `/deeper`,
`/examples`, `/bullets`, `/as-table`, `/steps`, `/why`, `/alternatives`, `/pros-cons`, `/next`, `/check`, `/tldr`
(13 commands).

## Chat commands — Compose
76. `/clear-draft` — empty the box and its attachments (undo).
77. `/draft <text>` — fill the box without sending (useful in suggestion chips).
78. `/drafts` — what you sent lately, one click puts it back (Alt+↑ / Alt+↓ in the box).
79. `/wc` — words, characters and tokens of the draft (or the last reply).
80. `/attach [path]` — attach files (no path: the picker).
81. `/screenshot [window | lab]` — window or Lab snapshot into your message (Ctrl+Shift+S).
82. `/queue [message | list | clear]` — line up messages while it answers.
83. `/smart-paste on|off`.
84. `/snippet <name> | save <name> | delete <name>` — reusable bits of text.
85. `/template [name]` — fill the box from a ready-made brief or a saved prompt.
86. `/enter-sends on|off` — Enter sends, or Enter = new line and Ctrl+Enter sends.
87. `/spell on|off` — spell checking in the box.

## Chat commands — Agents
88. `/claude <message>` — send to Claude from any chat (its reply waits there; a toast opens it).
89. `/astra <message>` — the same for Astra (ChatGPT).
90. `/both <message>` — Claude and Astra at once.
91. `/ask <agent> <message>` — any native agent.
92. `/all <message>` — every Ask-all agent, websites included.
93. `/continue-with <agent>` — move this chat to another agent with its history.
94. `/stop` (Esc) and 95. `/stop-all`.
96. `/model [name | default]` — this chat's model.
97. `/effort <low | medium | high | xhigh>` — agent setting.
98. `/agent <name>` — go to an agent; 99. `/agents` — list with engine, model, busy state.
100. `/dock [show | hide | width px]` — the director chat docked in a tool.
101. `/login` — sign the engine in.
102. `/engines` — were Claude Code / Codex found, and from which path.

## Chat commands — Style, Memory, Export
103. `/tone [name | words | off]`, 104. `/persona [name | words | off]`, 105. `/lang <language | off>`,
106. `/style [words | off]` — sent once with your next message, shown as a chip above the box.
107. `/translate <language>` — translate the last reply.
108. `/remember <fact>`, 109. `/remember-all <fact>`, 110. `/forget <words | last>` (undo),
111. `/memory [edit]` — what it remembers and how many tokens that adds.
112. `/export [md | json | html | txt] [file | clipboard]`.
113. `/note [text | last | #]` — save to Notes.

## Chat commands — View and App
114. `/zoom <+ | - | 0 | %>` — chat text size only.
115. `/width <narrow | normal | wide | full>`.
116. `/density <compact | cozy>`.
117. `/font <default | sans | serif | mono | rounded>`.
118. `/wrap on|off` — wrap code lines.
119. `/timestamps <always | hover | never>`.
120. `/numbers on|off` — message numbers.
121. `/autofold on|off` — fold long replies automatically.
122. `/scroll-lock on|off` — stop following a streaming reply.
123. `/focus` — just this chat; 124. `/zen` — focus + quiet chrome.
125. `/theme <name>`, 126. `/panel [show|hide]`, 127. `/grid`, 128. `/clear-notes`.
129. `/notes`, 130. `/palette`, 131. `/settings`, 132. `/shortcuts`, 133. `/prompts`, 134. `/usage-table`, 135. `/deleted`.
136. `/notify on|off`, 137. `/ontop`, 138. `/chime on|off|test`.
139. `/echo <text>`, 140. `/calc <expression>` (no eval: its own little parser), 141. `/time`.
142. `/run /a ; /b …` — chain commands (for chips and aliases).
143. `/alias <name> <command | text>` — make your own commands (listed under "Yours"); 144. `/unalias`.

## Presets
145–164. 20 chat templates (`/template`): Music visualizer, Visual from a reference, Lyric video, Loop for a post,
Fix what I see, Polish pass, Video feedback, Bug report, Explain like a friend, Decide between options, Plan a task,
Write a message, Brainstorm, Rewrite my text, Learn something, Compare two things, Daily plan, Devlog post,
Shader effect, Color palette.
165–176. 12 tones (`/tone`): concise, friendly, direct, formal, playful, calm, teacher, expert, eli5, bullet, socratic, hype.
177–188. 12 personas (`/persona`): art-director, motion-designer, music-producer, code-reviewer, editor, coach,
devil, mentor, colorist, game-designer, writer, scientist.
189–204. 16 reply languages (`/lang`).

## Messages and replies
205. Every message has a ⋯ menu; rarely used actions (quote, branch, retry, review, second opinion, save) moved
there, so the footer is just tokens · time · Copy · 🔊 · ⋯ (Retry / Continue show up when a reply was stopped).
206. Copy as plain text. 207. Copy its thinking. 208. Retry with another model. 209. Show the Markdown source.
210. Token badge per reply, with tokens/s and model on hover.
211. Times show the full date, "x min ago" and the message number on hover.
212. "edited" mark keeps the earlier wording (hover).
213. Pinned messages get a sticky strip at the top (click cycles through them).
214. Bookmarks across chats. 215. Reactions with an optional feedback note (React… submenu). 216. Small mark badges on messages.
217. Day lines (Today / Yesterday / date). 218. A "New" line where replies you haven't seen start.
219. Live status under a streaming reply: Thinking / Working / Writing · seconds · words · steps · Esc stops.
220. The ↓ button becomes "↓ new" while the reply grows below you.
221. "Show full reply · N words"; 222. a Fold button to fold it back.
223. Thinking blocks show duration and word count; 224. a one-line peek of the thinking while folded;
225. can stay open while streaming and after (`/thinking always`); 226. Alt+T opens / closes them all.
227. Read aloud highlights the message it reads; 228. Esc stops reading; 229. rate and voice; 230. auto-read new replies.
231. Selecting text shows a small bar: Quote · Copy · 🔎 Find · 📝 Note.
232. Drag text or a link onto the messages to quote / insert it.
233. Suggestion chips that start with "/" run that chat command (agents can offer commands); they look like commands.
234. `/commands` inside the hub's notes are clickable (commands with blanks fill the box instead).
235. Hub notes (command output) survive redraws, can carry buttons, and Esc in an empty box clears them.
236. A new empty chat offers a few starter commands.
237. Errors get Copy error and Check engines buttons.

## Code blocks
238. Language and line-count label. 239. Long blocks fold ("Show all N lines").
240. Code ⋯ menu: insert in my message, wrap lines, copy as a Markdown block, save to notes, open in Lab.
241. "Nodes" button / menu entry when the node view is installed (`NodeView.openCode(code, lang)`).
242. Thin themed scrollbars on code and tables.

## Markdown
243. Task lists with checkboxes. 244. Nested lists by indentation. 245. Callouts (`> [!NOTE]`, TIP, WARNING,
CAUTION, IMPORTANT…; `[!TIP]-` starts folded). 246. Table column alignment, zebra rows, sideways scroll.
247. Inline math `$x^2$` (superscripts, subscripts, Greek, fractions). 248. Block math `$$…$$`.
249. `==highlights==`. 250. `[[Ctrl+K]]` keycaps. 251. https pictures (`![alt](https://…)`), click to open.

## Message box
252. Draft history: Alt+↑ / Alt+↓. 253. Smart paste: code gets a fence with its language.
254. Huge pastes become a text attachment (one click to paste as text instead). 255. Tab indents inside a code fence.
256. Ctrl+Enter mode. 257. Style chips above the box (what rides along next). 258. Click a queued message to edit it again.
259. Typo guard: `/stas` asks "Did you mean /stats?" instead of sending; Enter again sends it as written.
260. Alt+R read the last reply aloud. 261. Alt+B bookmark it. 262. Alt+P pin it. 263. Alt+M its ⋯ menu.
264. Alt+Home / Alt+End scroll to the top / bottom. 265. Alt+F find in the chat.

## The "/" menu
266. Your recent commands come first. 267. Grouped by area with headers. 268. Shortcut hints next to commands.
269. A hint footer (↑↓ · Tab · Enter · Esc). 270. Argument suggestions know the chat you're in (models, chats, tags, voices…).
271. Enter on a picked argument runs it. 272. Saved prompts in their own group. 273. Long argument hints are trimmed.

## Header and menus
274. Docked director chats get a compact header (＋ instead of "New chat", model in ⋯), shorter placeholder.
275. "Model…" in the chat ⋯ menu. 276. Chat ⋯ menu: Find, Thinking, Read last reply, Tags, Export JSON, Import, Commands.
277. Chat title tooltip: message count and start date.
278. Find bar with highlights, match count, ↑ ↓, includes thinking text, unfolds folded replies when it lands there.

## Chats panel
279. ⏷ filter menu: pinned, today, last 7 days, unread, answering now, archived, folders, tags.
280. The active filter shows as a chip with ×. 281. Unread dot and bold title. 282. Unread count per agent.
283. The window title shows the unread count. 284. Tags on rows; `#tag` in the search box.
285. Folders as collapsible sub-groups. 286. Archive keeps a chat out of the list. 287. Sort: latest, oldest, by title.
288. Keyboard: ↓ from the search box, ↑ ↓ Home End, Enter opens, F2 renames, Delete deletes, Esc back to search, menu key.
289. Row tooltip: last activity and tags. 290. Right-click: duplicate, export, tag, folder, archive, mark unread.
291. Docked directors are labelled "docked".

## App-wide
292. Every chat command is in the Ctrl+K palette (commands with blanks fill the chat box).
293. Soft chime for replies in chats you aren't looking at (opt-in).
294. Your own commands with `{args}` placeholders. 295. Command chains.
296. Chat text size, width, density and font are separate from the app zoom.
297. Focus mode has an "Exit focus" button.
298. Export as an HTML page. 299. Export as plain text. 300. Export as JSON that re-imports (Markdown existed).
301. Import a Markdown chat (as written by Export).
302. `/tokens week` and `/tokens all` read the usage history per agent.
303. Style rides along once per engine session (re-sent only after a compact / fresh session).
304. Settings → Engines paths now also decide the "engine found" status.

## For development (not counted)
- `dev/fake-claude.js`, `dev/fake-codex.js` (+ `.cmd` launchers, `dev/fake-common.js`): fake CLIs that speak the real
  JSONL (stream-json deltas, thinking, tool calls, usage with cache tokens, resume, errors, login errors, crashes,
  Codex running totals). Keywords in a message pick the behavior: think, tool, tools3, code, table, long, remember,
  suggest, slow, error, login, crash, big, echo.
- `node dev/smoke.js --fake-engines` points `settings.enginePaths` at them in the throwaway copy.
  Checks: `dev/checks/chat-stream.js`, `chat-cmds.js`, `chat-extra.js`, `chat-look.js`, `chat-menus.js`.
- API additions other streams can use (additive): `Commands.recent()`, `areas()`, `run()`, `closest()`, `keys` hints,
  `ctx.note(text, { actions, id })`, `ctx.chat`, `ctx.agent`; `Native.hooks` (render, message, event, mark, send) and a
  chat API (`Native.current`, `view`, `compact`, `jumpTo`, `toggleMark`, `insertDraft`, `setStyle`, `speakMessage`…).
- Fixes: engine events were handled twice after this stream's API addition (caught by the fake engines);
  the smoke test no longer crashes when a temp folder is still busy.
