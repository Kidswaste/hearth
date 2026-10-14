# Slimmer tool definitions (round 41, toolslim)

Every message an AI gets carries the definitions of every tool it has (names, descriptions, JSON schemas), before the
owner's words, at every step of a reply. tokensaver (round 31) gave the opt-in sets help on demand and plain chats a
lean chat list; directorlean (round 37) cut what the director's tools send back. This stream slimmed the definitions
everywhere else: the chat tools (every Claude chat, every director step), the mood board, screenshots / recordings,
app windows, Adobe, publishing, Forge Debug and the permission tool. It also stops sending an opt-in set at all on
messages that don't need it. Every tool still does exactly what it did (the hub's handlers are untouched).

## Measured
`node dev/tokens-test.js --table` (tokens ≈ characters / 4, like `mcp/cost.js`; the sample memory of tokensaver;
the engines' own base prompts are not Hearth's and not counted). "Before" is the round 40 tree (`a31bfd9`) measured
with the same script. New columns: **wire** = the tool lists as the engines really name them
(`mcp__board__board_vibe`, `input_schema`: ≈ 3–5 % more than the bare lists), **asleep** = the same AI on a message that
needs none of its opt-in sets (below).

| Kind of AI (per message) | prompt | tools before → after | **total before → after** | saved | asleep |
|---|---:|---:|---:|---:|---:|
| **Plain Claude chat** | 119 → 119 | 296 → 208 | **571 → 483** | −88 (15 %) | – |
| Plain Astra chat | 89 → 89 | 93 → 85 | 318 → 310 | −8 | – |
| **Three Director** (lean, Claude) | 884 → 885 | 1,809 → 1,533 | **2,829 → 2,554** | −275 (10 %) | – |
| Three Director on Astra | 884 → 885 | 1,809 → 1,533 | 2,829 → 2,554 | −275 | – |
| Three Director + board tools | 971 → 975 | 2,594 → 2,012 | 3,701 → 3,123 | −578 | **2,554** |
| Claude + board tools | 206 → 209 | 1,081 → 687 | 1,444 → 1,052 | −392 (27 %) | **483** |
| Claude + screen tools (capture) | 119 → 119 | 781 → 533 | 1,056 → 808 | −248 | **483** |
| **Claude + board + screens** | 206 → 209 | 1,566 → 1,012 | **1,929 → 1,377** | −552 (29 %) | **483** (−75 %) |
| Claude + apps tools | 161 → 162 | 751 → 439 | 1,068 → 757 | −311 (29 %) | 483 |
| Claude + Adobe tools | 119 → 119 | 597 → 359 | 872 → 634 | −238 | 483 |
| Claude + publishing tools | 119 → 119 | 528 → 380 | 803 → 655 | −148 | 483 |
| Astra + board tools | 177 → 179 | 878 → 564 | 1,191 → 879 | −312 | 310 |
| Claude + a connection | 119 → 119 | 437 → 349 | 712 → 624 | −88 | – |
| Forge Debug (Claude) | 730 → 731 | 1,046 → 758 | 1,912 → 1,625 | −287 | – |

Tool sets on their own (list → wire): chat for directors 532 → **256** (550 → 265), chat for plain chats 296 → **208**,
Astra's lone chat_open 94 → 85, board 785 → **479**, capture 485 → **325**, apps 455 → **231**, Adobe 301 → **151**,
publishing 232 → **172**, Forge 514 → 502, the permission tool 66 → 60. The Three Director's own Lab list (1,277) was
left to directorlean's budget (`dev/director-mcp-test.js` ≤ 1,220 lean, unchanged).

**A typical week** (tokensaver's mix: ≈ 600 director messages, 150 plain Claude, 60 Astra, 40 with board tools, 20
with capture, 10 with apps, 20 with a connection), counted once per message and with every set awake: ≈ **200,000
fewer tokens a week** (165k of it from the director's chat list). Each tool step of a reply re-sends the same
definitions, so a tool-heavy week saves several times that (mostly as cheaper cache reads). A message that needs none
of an AI's opt-in sets saves the whole set on top (board + screens: 1,377 → 483).

Byte stability: the lists are constants (no dates, ids or counters; `dev/toolslim-test.js` checks the same bytes run
after run) and `dev/cache-test.js` still passes. A sleeping set that wakes mid-chat changes the tool list once (one
re-read without the cache, like a picture's Read tool), then stays for the rest of that engine session.

## Upgrades
### Every Claude chat
1. **Plain chats list two chat tools instead of three**: `chat_ask` and one `chat_do` (plan checklist, picture, second
   opinion, **open a file / folder / page**, problem report): 296 → 208 tokens on every plain Claude message. Opening
   things for you works as before (`chat_do open`), and Astra keeps its own one-tool `chat_open`.
2. **Shorter chat tool words** (same args): chat_ask, chat_open, chat_progress; the checklist's step schema is said once
   in words.
### The Three Director (and every docked director, Forge Debug)
3. **Directors list chat_ask + chat_progress + chat_do**: a picture in the chat, a second opinion from the other AI,
   opening something and problem reports moved into `chat_do` (532 → 256 tokens on every director step; tokensaver's
   and directorlean's "not done" note). The director's chat guide, the Lab's "3 variations" ask and the looks help
   topic now say `chat_do show`; the hub still gets `chat_show` / `chat_second_opinion` (the dock's icons, the director's
   task state and usage counts are unchanged).
4. **Forge Debug**: spawn's defaults / ranges said once in words instead of schema keywords.
### Opt-in tool sets: same abilities, fewer words
5. **Mood board: 4 tools instead of 7** (`board_vibe`, `board_look`, `board_add`, `board_do`); listing boards,
   arranging and **watching a clip** are `board_do` ops (`list`, `arrange`, `watch`): 785 → 479. The "a vibe, never the
   footage" rule stays in board_vibe and the board's prompt line.
6. **Screens: 3 tools instead of 4** (`capture_shot`, `capture_frames`, `capture_do`): recording is
   `capture_do {op: start | stop | status | pause | resume | mark | tour}` and the newest captures `capture_do list`:
   485 → 325.
7. **App windows: 2 tools instead of 4** (`apps_open`, `apps_do`): an app's page and Meshy are `apps_do` ops (`page`,
   `meshy`, `meshy_status`): 455 → 231. Meshy still shows the cost and asks you before every generation.
8. **Adobe**: one short line; each app's actions come from `adobe_do {help: "photoshop"}` (Photoshop, Illustrator,
   Premiere, Media Encoder, InDesign, After Effects, scripts): 301 → 151. Its own scripts still ask you first.
9. **Publishing**: shorter words, the whole how-to in `deploy_do {help}`: 232 → 172. Every publish still asks you.
10. **Compact schemas**: rarely used optional args leave the schema and are named in the words (the servers pass
    every arg on, listed or not), long enums stay in help (`mcp/common.js leanTools` takes `[words, [args to keep]]`).
11. **One dispatcher helper** (`mcp/common.js dispatch`): a merged tool reaches the hub under its old name with its old
    args (`board_do {op: "watch"}` → `board_watch`), so nothing in Hearth changed behind it; old names still work when
    called directly.
12. **Help for everything that left a list**, answered by the tool server itself (no hub, no tokens until asked):
    `board_do {help: "arrange"}`, `capture_do {help: "tour"}`, `apps_do {help: "meshy"}`, `chat_do {help: "open"}`…
13. **The permission tool** (`access_permission`, listed to Claude with file access): a few words only.
### Opt-in sets sleep until needed
14. **A board, screens, Adobe, publishing or apps tool set is sent only when the AI is likely to need it** (new
    `toolwake.js`): when it used one of those tools in the last 7 days, or the set was switched on in the last 7 days,
    or the message names what it's for (a board / references / Pinterest; a screenshot / recording / frames / footage;
    Photoshop / Premiere / a PSD…; publish / Vercel / a website; Meshy / Suno / Figma…). Otherwise the message carries
    none of it (board + screens: 1,377 → 483 tokens).
15. **Sticky per chat session**: once a set came along in a chat's engine session it stays for the rest of it, so the
    tool list never shrinks under a chat and the prompt cache keeps hitting.
16. A chat's own `/capture-tools on` always sends the screen tools; your switches in ⋯ AI setup are unchanged.
17. Switching a set off and on again later starts a fresh week.
18. Use is counted from the engines' own tool calls (Claude's `mcp__board__…`, Codex's `board · …`), per AI, in
    `data/tool-wake.json` (written at most once an hour per set).
### Words on screen
19. ⋯ AI setup → What it can use: the mood board and screenshots rows say "≈ 500 / ≈ 330 tokens, only on messages that
    need it" (were ≈ 1,000 / ≈ 550 a message); `/board-tools` and Find anything say the same.
### Measuring and guarding
20. `dev/tokens-test.js`: 14 kinds of AI (new: board + screens, Adobe, publishing, a director with the board, Forge
    Debug), a **wire** column (names as the engines list them) and an **asleep** column; every budget lowered to the new
    size (+ ≈ 2 %) and set budgets for all eight hub sets.
21. `mcp/cost.js`: `wire` per set and per AI; Astra's lone chat_open measured as she gets it.
22. New `dev/toolslim-test.js` (unit group, and `sh dev/run-checks.sh toolslim`): every merged op reaches the hub under
    its old name with its old args, help answers, byte-stable lists, the wake rules, and end to end through
    `engines.send` + the fake Claude's real `--mcp-config` (asleep → woken by a word → sticky → a new session asleep).
23. Budgets lowered in `dev/board-mcp-test.js` (< 500 tokens), `dev/capture-mcp-test.js` (< 340), `dev/adobe-mcp-test.js`
    (Adobe < 160, publishing < 180), `dev/director-mcp-test.js` (the director's chat list ≤ 265, the guide says
    `chat_do show`), `dev/apps-unit-test.js`, `dev/eyes-test.js`.

## Files
`mcp/common.js` (`leanTools` keeps chosen args, merges tools into a dispatcher; `dispatch`), `mcp/chat-mcp.js`,
`mcp/board-mcp.js`, `mcp/capture-mcp.js`, `mcp/apps-mcp.js`, `mcp/adobe-mcp.js`, `mcp/deploy-mcp.js`,
`mcp/forge-game-mcp.js`, `mcp/access-mcp.js`, `mcp/cost.js` (wire, chat_open alone), `mcp/hearth-map.js` +
`mcp/three-guide.js` (tool names in the app map / help), new `toolwake.js`, `engines.js` (3 small hooks in `send()` +
the guarded require), tests above, `dev/run-checks.js` (unit list, `toolslim` group).
Small edits outside the lane: `tools/three.js` (the "3 variations" ask says `chat_do show`), `board-cmds.js` /
`board-eyes.js` (hint strings say `board_do list` / `board_do watch`), `options.js` + `appsearch-data.js` +
`board-cmds.js` + `lazy-data.js` META (the cost words of the board / screens rows and `/board-tools`).

## Tested
- `node --check` on every touched file.
- `sh dev/run-checks.sh toolslim`: toolslim-test, tokens-test, cache-test, tokenaudit-test, board-mcp-test,
  capture-mcp-test, adobe-mcp-test, director-mcp-test: 8/8.
- Unit: astra-engine-test, robust-engine-test, access-test, apps-unit-test, devreport-test, concise-test,
  swarmlean-test, connections-test, director-cost, boot-test, directorlean-test, eyes-test, adobe-test, deploy-test,
  liveness-test, routerlearn-test, memorytidy-test, appsearch-test: pass.
- Smoke (fake engines): lazy, tokenaudit, directorlean, director-tools, labdirector, director-dock, eyes-chat,
  board-chat, devreport, access-chat: pass. `reach-open` fails one step ("chat_open outside: allowed once" → "The user
  said no") — **the same step fails on the round 40 base** (`a31bfd9`, run from a clean export), so it isn't from this
  change.

## Not done (on purpose) / risks
- **A sleeping set can miss an unprompted use**: an AI with board tools that wasn't asked about the board and hasn't
  used it for a week won't reach for it by itself. Naming it ("my board", "references", "Pinterest"…) brings it back on
  that very message; using it keeps it awake a week. The words are kept narrow on purpose ("vibe", "song", "frame",
  "TikTok", "app" don't wake anything) so the Three Director doesn't pay for the board on everyday asks.
- **Where its tokens go** (tokenaudit) and the chat's cost split still count an opt-in set at its awake size: they show
  what the set costs when it comes along, not how often it sleeps.
- **The merged tools are reached by op**: a model told an old name (an old saved prompt saying "use board_watch") has
  to find `board_do watch`; the descriptions name every op and help answers by the old names too.
- Rare args moved from schemas into words: models fill them from the description (three_do has worked this way since
  round 25), but a strict client that only allows schema args would drop them. Claude Code and Codex pass them.
- The Lab's own 15 director tools (1,277) are untouched here (directorlean's budget); the director's per-step saving is
  the chat list.
- Connections (the owner's own MCP servers) and claude.ai connectors aren't Hearth's definitions and aren't changed.
- `data/tool-wake.json` syncs like other data (a use on one computer keeps the set awake on the other).

## For the patch notes
- Every message to your AIs carries lighter tool lists: a plain Claude chat ≈ 90 fewer tokens per message, the Three
  Director ≈ 275 fewer on every step, a chat with board and screen tools ≈ 550 fewer (about 30 %).
- Board, screenshot, Adobe, publishing and app tools now come along only when they're likely to be needed: used this
  week, just switched on, or named in your message ("my board", "take a screenshot", "send it to Photoshop"). On other
  messages they cost nothing.
- Once one comes along in a chat it stays for the rest of that chat, so the AI's cache keeps working.
- Nothing to set up and nothing removed: every tool does what it did; your switches in ⋯ AI setup are unchanged.
- The AIs read rare details on demand (one quick help call), so a first use of an unusual option may take one extra step.
- Opening files and pages for you, pictures in the chat and second opinions now go through one "more" tool; they work
  the same.
- A typical week saves ≈ 200,000 tokens before counting tool steps.
