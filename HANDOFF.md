You're picking up development of **Agent Hub**, my personal desktop app at `C:\Users\quent\agent-hub` (git repo, Windows 11). I'm talking to you from inside it. You can't see or edit the files from this chat, so when a change is needed, give me exact code edits (file + the code to replace) or a precise prompt I can hand to Claude Code.

## What it is
One window for all my AI agents, with no API keys and no extra cost:
- **Native agents** (Claude, Astra): the hub's own chat UI. Messages go through the official CLIs that ship with my desktop apps, using my subscription logins:
  - Claude Code (`%APPDATA%\Claude\claude-code\<ver>\<hash>\claude.exe`), my Claude Max login.
  - Codex (`%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`), my ChatGPT login.
  - `engines.js` picks the newest binary automatically.
- **Website agents**: real sites in Electron `<webview>`s, each with its own persistent login partition.

## Stack and files
Electron v44.5.1 (unpacked in `electron/`, gitignored), plain JS, no npm, no build step. Launch with `Agent Hub.cmd`.
- `main.js`: window, IPC, webview popup/permission rules, Ctrl shortcuts forwarded from webviews, chat import dialog, `fs.watchFile` hot-reload of config/theme.
- `engines.js`: spawns the CLIs and parses their JSONL into delta, tool, done, error and stopped events. Also builds the system prompt (persona + memory + auto-memory instruction), connector allow/deny lists, zero-cost connector discovery, and logs to `data/engine.log`.
- `store.js`: `data/chats/*.json`, `data/web-history.json`, `data/memory.json` (atomic writes).
- `importer.js`: claude.ai and ChatGPT export importers (zip via `tar.exe`), deduped by hashed id.
- Renderer modules (plain scripts sharing the global `H` state): `renderer.js` (core, rail, surfaces, layout, ask-all), `native.js` (chat UI, streaming, `<remember>` tags, imported-chat context), `panel.js` (chats grouped by agent, search, paging), `manager.js` (add/edit agent dialog, presets, connectors), `memory.js`, `md.js` (safe Markdown), `start.js` (wiring).
- `config.json` holds agents, layout and theme. It's edited in-app and hot-reloads. `theme.css` holds user CSS. `app.css` holds base styles driven by CSS variables.

## Key decisions (keep these)
- **Token frugality is the #1 priority.** Past CLI attempts burned tokens and gave bad results.
  - Claude runs with `--setting-sources project --tools "" --disable-slash-commands --system-prompt <short>` and `--strict-mcp-config` unless connectors are on.
  - Codex runs with `--ignore-user-config --ignore-rules`, about 19 features disabled, and `model_instructions_file`.
  - Measured: plain Claude reply ≈ 764 input tokens. Codex ≈ 4.5k, mostly cached. Gmail read-only query ≈ 19k.
- Every reply shows its token usage. Codex reports cumulative totals, so the hub shows per-turn deltas.
- Connectors are per agent: Off, Read-only or Full. Read-only uses a tool-name regex plus `--disallowedTools`.
- No automating or scraping the websites' answers (terms of service). Ask-all only types into website chat boxes.
- Never handle my passwords. Sign-in opens the CLI's own login window.
- Memory is added to every prompt, so keep it short. Agents save facts via `<remember>…</remember>`, which the hub strips and shows with an Undo.

## Known gaps / not verified
- The Codex "ChatGPT apps" toggle is untested.
- Read-only blocking of write tools hasn't been tested live.
- Real claude.ai/ChatGPT export files haven't been imported yet (only synthetic ones).
- Ask-all into website agents needs logged-in sites and may break when a site's DOM changes (`inputSelector` override exists).
- No plugins/skills yet. Proposed approach: an opt-in per-chat "Workshop" switch that gives Claude file/code tools in a sandbox folder.

## How to test changes
Syntax check: `electron\electron.exe --check <file>` with `ELECTRON_RUN_AS_NODE=1`. For UI checks, launch with `--remote-debugging-port=9333` and drive the page through CDP `Runtime.evaluate`.

Start by asking me what I want to change next.
