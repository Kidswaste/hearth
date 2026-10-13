# Connections (round 26, connections): give the AIs more access to your stuff

You asked to give the AIs "more access to stuff". In **⋯ AI setup → What it can use**, under Hearth's own tools and
Claude's connected apps, there is now **Your connections (MCP servers)**: any MCP server you have, plus a short list of
free well-known ones you add in one click. Each one is Off / Read only / Full (or Off / On) **per AI**, works for
**Claude and Astra** alike, and has a **Test** button.

Where: ⋯ in a chat's header (or ⚙ AI setup in the rail) → What it can use → **＋ Add a connection**. Right-click a
connection row: Test, Edit…, Remove (double-click its name also edits). The app's API: `/connections` (list, `add
<ready-made>`, `test <name>`, `on <name>`, `off <name>`); you never need it.

Files: `connections.js` + `connections.css` (the rows and the Add dialog, lazy group `connections`, loaded when AI setup
shows it), `connectionsmain.js` (main side: Test, and what each engine gets). Small hooks: `options.js` (3 lines: the
section under What it can use), `engines.js` (8 lines: the servers join Claude's `--mcp-config` file and Codex's
`-c mcp_servers…` overrides; the "you have no tools" line knows about them; the shown command line masks your
values), `main.js` (1 line), `preload.js` (1 line), `lazy-data.js` (the group + its manifest), `dev/fake-common.js`
(1 line: the fake engines reach a connection's server), `dev/run-checks.js` (unit list + `connections` group).

## How it works
- Saved in config.json: `connections` (the servers: a command + args, or an address; settings; the tool list from the
  last Test and its token cost) and, on each AI, `connections: { id: 'read' | 'full' }`.
- Claude: the servers go into the same per-run `--mcp-config` file as Hearth's own tools (deleted when the run ends).
  Codex: `-c mcp_servers.<name>.command / args / env` or `.url / .http_headers` overrides (your `~/.codex/config.toml`
  is never touched).
- Permissions: Hearth adds no prompts of its own. **Full** pre-approves that server for that AI (like Claude's
  connected apps set to Full, and like Hearth's own tool sets: `codex exec` can't show a prompt and cancels
  anything it would have to ask about). **Read only** pre-approves only the tools that just look (the server's own
  `readOnlyHint`, otherwise the name: get / list / read / search…) and blocks the rest (Claude: `--disallowedTools`;
  Codex: `enabled_tools`). A chat with file access on still routes anything not approved through Claude Code's own
  permission tool (Hearth's approval card).
- Nothing is added to the system prompt (token frugality): the tool definitions describe themselves. They do ride
  along with every message of an AI that has the connection on, so each row says roughly how many tokens.

## Upgrades
### Adding
1. **＋ Add a connection** in ⋯ AI setup → What it can use (one button, no new rows elsewhere).
2. Ready-made, free, no account: **Files in a folder** (you pick the folder; Read only = look, Full = also edit).
3. Ready-made: **Read web pages** (fetch).
4. Ready-made: **Git repository** (you pick the folder).
5. Ready-made: **SQLite database** (you give the .db file).
6. Ready-made: **Web browser** (Playwright: open pages, click, type, snapshots).
7. Ready-made: **Knowledge graph memory**.
8. Ready-made: **Time and time zones**.
9. Ready-made: **Step-by-step thinking**.
10. Each ready-made card says **needs Node** or **needs Python**, and "(not found)" when npx / uvx isn't on this computer
    (with how to install it in the tooltip).
11. One click adds it, **tests it and switches it on for the AI you're setting up** (Read only when the server has both
    looking and changing tools, so nothing changes by surprise).
12. **Your own MCP server**: paste the command line that starts it (quotes for paths with spaces are understood).
13. Or the **address of a remote (HTTP) MCP server** (https://…/mcp; an older …/sse one works for Claude).
14. Optional **settings** per server: `NAME=value` lines (environment values) or `Header: value` lines for an address
    (e.g. `Authorization: Bearer …`).
15. A name is guessed from the command or address when you leave it empty.

### Using
16. Per AI **Off / Read only / Full** when the server has both kinds of tools; **Off / On** when it doesn't.
17. Works for **Astra (Codex)** too, not only Claude.
18. **Read only** really blocks the changing tools (Claude: disallowed; Codex: only the looking tools are enabled).
19. Second opinions and other one-off calls never get your connections.
20. Server names never clash with Hearth's own tools (a "three" connection becomes my_three; duplicates get _2).
21. Programs are found even when Hearth starts from the Dock / Finder / Start menu (Homebrew, ~/.local/bin, npm, Volta,
    Bun, cargo… are searched), and the server gets a PATH that finds Node / Python next to npx / uvx.
22. Windows: `npx.cmd` / `.bat` servers are started through cmd.exe the way both CLIs need.
23. A first npx / uvx start may download the package: the engines wait up to 60 s for it to start.
24. The "you have no tools" line in the prompt is left out when a connection is on.

### Test
25. **Test** on each row starts the server, asks for its tools and stops it again.
26. Lists its tools under the row (✓ server name: N tools (…)).
27. Learns which tools only look (for Read only), saved with the connection.
28. Measures its **token cost** (≈ tokens a message, from its tool list), shown on the row; before a Test the
    ready-made ones show a guess, marked as one.
29. Clear errors: "isn't on this computer" + "needs Node.js / uv / Python / Docker" with where to get it.
30. "It stopped before answering (exit N)" with the last lines it printed (a missing folder, a bad argument…).
31. "No answer in 90 s" (with a hint: a first start downloads the package).
32. For an address: "It needs a sign-in (HTTP 401)" with what to add, "Nothing answers at that address", HTTP errors.
33. Remote servers that answer as event streams or keep a session are understood.
34. A connection that doesn't start is added but left off, and says why.
35. Right-click a row: **Test · Edit… · Remove**; double-click the name to edit.
36. **Remove** asks first, then takes it away from every AI.

### Privacy
37. Settings you type (keys, tokens) stay in Hearth's config on this computer like your other settings and go **only
    to that server**: never to the AI, never into a prompt; the Add dialog and the section say so, and warn never to
    type a password there.
38. The shown engine command line (`/astra-flags`) masks them as ••••.

## Tested
- `node dev/connections-test.js` (unit, 7 groups of asserts): server names; nothing on = the same flags and prompt as
  before; Claude's `--mcp-config` entries (stdio and http) and allowed / disallowed tools for Full and Read only; Codex's
  `-c` overrides (`enabled_tools`, approval, startup timeout, URL + headers); the secret never in the prompt or on
  Claude's command line, masked in the shown one; Test against `dev/fake-mcp-server.js` (works, crashes, never answers,
  not installed, needs Node) and a local HTTP MCP server (JSON + event-stream, session id, 401, nobody there); real runs
  of the fake Claude and fake Codex calling the connection's tools (the token reached the server). ✓ 7 / 7.
- `node dev/smoke.js --fake-engines --script dev/checks/connections.js`: the panel, the dialog (8 cards with needs /
  cost, the secrets note), your own server through the form → tested → Read only for Claude, the row's result and
  cost, a crashing server says why, fake Claude (Full) and fake Astra (Read only) call it, `/connections test / off`,
  Remove. ✓ ok, no page errors. `sh dev/run-checks.sh connections` runs both.

## Not done / risks
- The ready-made servers were not started for real here (no network): their package names are the well-known ones
  (@modelcontextprotocol/server-filesystem, -memory, -sequential-thinking, @playwright/mcp; mcp-server-fetch / -git /
  -sqlite / -time via uvx); the cost on their cards is a guess until Test measures it.
- Codex keeps settings on its command line (`-c …env={…}`), like Hearth's own tool sets: other programs on this
  computer that list processes could see them while a reply runs. Claude's are in a temp file instead.
- Full pre-approves the server (see Permissions above); servers that need an OAuth sign-in in a browser aren't handled
  (a header with a key works).
