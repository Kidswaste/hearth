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

## Memory
🧠 in the rail: notes every native agent keeps in mind ("about you") plus notes per agent.
Agents add to their own notes when you tell them something lasting; each save shows under the
reply with an Undo. Memory is added to every message, so keep it short. Stored in `data/memory.json`.

## Connected apps
Claude agents can use the apps connected to your Claude account (Gmail, Drive, Notion…):
right-click the agent → Edit → Connected apps, and set each one to Off, Read-only or Full.
Every app you switch on adds its tool descriptions to each message, so switch on only what you use.
ChatGPT agents have one switch for the apps connected to your ChatGPT account.

## Past chats
Request your data export (claude.ai: Settings → Privacy → Export data; ChatGPT: Settings →
Data controls → Export data), then use **Import past chats…** at the bottom of the chats panel
with the .zip you get by email. Chats land under the matching agent; sending a message in one
continues it, with the earlier conversation sent along as context.

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
