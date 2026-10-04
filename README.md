# Agent Hub

Claude, Astra (ChatGPT), Kimi, DeepSeek, and any other AI site, in one window.
No API keys, nothing extra to pay.

**Launch:** double-click `Agent Hub.cmd`.

## Two kinds of agents
- **Native chat**: the hub's own chat screen. Messages go through the official engines that come
  with your desktop apps: Claude Code (Claude desktop app, your **Claude Pro** login) and
  Codex (Codex app, your **ChatGPT Plus** login). Everything is stripped down to plain chat
  (no tools, no project files, no plugins), and every reply shows the tokens it used.
- **Website**: the real site (kimi.com, chat.deepseek.com…) with your normal login, which stays saved.

Switch any agent between the two: right-click its icon → Edit → Mode.

## Chats panel
All conversations, grouped by agent. Native chats are stored in `data/chats/`.
Website conversations show up automatically as you open them.
Right-click a chat to rename or delete it; use the search box to filter.

## Add, edit, remove agents
- **＋** in the left rail: pick a preset (Gemini, Perplexity, Grok, Le Chat, Copilot, Qwen…) or any URL.
- **Right-click an agent icon**: Edit, Move up/down, Remove.

## Shortcuts
| Keys | Action |
|---|---|
| Ctrl+1 … Ctrl+9 | Switch agent |
| Ctrl+N | New native chat |
| Ctrl+\\ | Show/hide chats panel |
| Ctrl+G | All agents side by side |
| Ctrl+Shift+Space | Ask all agents at once |
| Ctrl+B | Show/hide the ask-all bar |
| Ctrl+R | Reload current website |
| Ctrl+, | Open config.json |

## Customize
Changes apply instantly while the app is running.
- **`config.json`**: everything the edit dialog sets, plus layout and theme colors.
  - `"inputSelector"` (website agents): CSS selector for the chat box if ask-all can't find it.
  - `"chatUrlPattern"` (website agents): regex for which page paths count as a conversation.
  - `"askAll": { "pressEnter": false }` fills every chat box without sending, so you can review first.
- **`theme.css`**: any CSS on top of `app.css`.

## Troubleshooting
- Native Claude says it isn't signed in: click **Sign in** in the chat, finish in the window that opens.
- Native chat problems are logged to `data/engine.log`.
