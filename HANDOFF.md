You're picking up development of **Agent Hub**, my personal desktop app at `C:\Users\quent\agent-hub` (git repo, Windows 11). I'm talking to you from inside it, and you have file access to that folder: read files before changing them, make focused edits, and list what you changed. You can't run commands, so tell me what to run or check. Changes to renderer files show up after restarting the app; `config.json` and `theme.css` hot-reload. Before a big change, remind me to commit in git so it's easy to undo.

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
- `config.json` holds agents, layout, theme, `settings` (app options) and `tools` (rail order/hidden). It's edited in-app and hot-reloads. `theme.css` holds user CSS. `app.css` + `features.css` hold base styles driven by CSS variables.
- Main-process helpers: `appshell.js` (icon drawn in code, window memory, tray, global hotkey, startup, shortcuts, right-click menus, downloads), `fsapi.js` (list/read/write/search/watch/zip/recycle/diff IPC), `aemain.js` (After Effects: locate, run ExtendScript via `AfterFX.exe -r` in one undo group, install scripts, output templates from prefs, aerender with progress).
- Renderer foundation: `ui.js` (`el()`, toasts, `Modal`, `Tabs`, `DataTable`, `CodeEditor`, `highlight`, `dropZone`, `store` = localStorage), `tools.js` (tool registry; tools mount lazily), `appui.js` (settings, themes, palette, find, zoom, Ctrl+Tab, notifications, downloads, usage, trash), `notes.js` (Notes + Prompts), `kit.js` (color + easing tools).
- Tools: `tools/forge.js` (Forgeheart workspace), `tools/three.js` + `tools/three-data.js` + `tools/three-sandbox.html` (Three.js Lab), `tools/ae.js` + `tools/ae-data.js` (After Effects kit). Full list in `FEATURES.md`.
- Tool data lives in `data/kv/<name>.json` via `hub.kvGet/kvSet` (each save keeps `<name>.prev.json`). Deleted chats go to `data/trash` for 30 days.

## Key decisions (keep these)
- **Token frugality is the #1 priority.** Past CLI attempts burned tokens and gave bad results.
  - Claude runs with `--setting-sources project --tools "" --disable-slash-commands --system-prompt <short>` and `--strict-mcp-config` unless connectors are on.
  - Codex runs with `--ignore-user-config --ignore-rules`, about 19 features disabled, and `model_instructions_file`.
  - Measured: plain Claude reply ≈ 764 input tokens. Codex ≈ 4.5k, mostly cached. Gmail read-only query ≈ 19k.
- Every reply shows its token usage. Codex reports cumulative totals, so the hub shows per-turn deltas.
- Connectors are per agent: Off, Read-only or Full. Read-only uses a tool-name regex plus `--disallowedTools`.
- No automating or scraping the websites' answers (terms of service). Ask-all only types into website chat boxes.
- Never handle my passwords. Sign-in opens the CLI's own login window.
- File access (Claude agents only) is opt-in per agent: a folder picked in the agent editor. It enables Read/Edit/Write/Glob/Grep with `--restricted --add-dir <folder> --permission-mode acceptEdits`, has no command running, and writes outside the folder are blocked (tested). Sessions stay in `data/workspace` so chats still resume after the folder changes.
- Memory is added to every prompt, so keep it short. Agents save facts via `<remember>…</remember>`, which the hub strips and shows with an Undo.
- The Three.js sandbox iframe has `sandbox="allow-scripts"` without same-origin, so sketch code (which can come from chats) can't reach `window.hub`. Perf stats hook `WebGLRenderer.render` through a prototype setter because three assigns `this.render` in its constructor.
- Destructive tool actions go to the Recycle Bin (`shell.trashItem`), never permanent deletes; the Forgeheart project folder is read-mostly.
- aerender can exit 0 after an error, so failures are detected from its log ("aerender Error" lines).
- When editing files from PowerShell, never round-trip through `Get-Content`/`Set-Content` without `-Encoding utf8`: it garbles ×, →, emoji. Use `[IO.File]::ReadAllText/WriteAllText`.

## Known gaps / not verified
- The Codex "ChatGPT apps" toggle is untested.
- Read-only blocking of write tools hasn't been tested live.
- Real claude.ai/ChatGPT export files haven't been imported yet (only synthetic ones).
- Ask-all into website agents needs logged-in sites and may break when a site's DOM changes (`inputSelector` override exists).
- No plugins/skills yet. Proposed approach: an opt-in per-chat "Workshop" switch that gives Claude file/code tools in a sandbox folder.
- Feature pack items marked ○ in `FEATURES.md` (tray, notifications, downloads, running scripts inside AE, a real aerender render, backup clean/restore, CSV save…) were built and code-checked but not exercised live.

## How to test changes
Syntax check: `electron\electron.exe --check <file>` with `ELECTRON_RUN_AS_NODE=1`. For UI checks, launch with `--remote-debugging-port=9333` and drive the page through CDP `Runtime.evaluate` (return `JSON.stringify(...)` so results serialize). Test with throwaway data and clean it up; never edit or delete the user's chats, sketches or Forgeheart files in tests.

Start by asking me what I want to change next.
