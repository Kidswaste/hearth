# Agent Hub

Claude, Astra (ChatGPT) and any AI website in one window, plus workspaces for Forgeheart,
Three.js and After Effects. No API keys, nothing extra to pay.

**Launch:** double-click `Agent Hub.cmd` (or Settings → App → create Start menu & desktop shortcuts).
**Everything it does:** see [FEATURES.md](FEATURES.md) (119 features, with what's been tested).

## The basics
- **Rail (left):** your agents, then the tools (⚒ Forgeheart, ◭ Three.js Lab, Ae After Effects). Right-click for options, ＋ to add an agent or site.
- **Native agents** chat through the official Claude Code / Codex engines in your desktop apps, on your subscriptions.
  Attach files and screenshots, edit/retry messages, pin chats, switch model per chat, type `/` for saved prompts.
- **Website agents** are the real sites with your logins, plus a navigation bar.
- **Directors** live inside their tools: **Video Director** in Video Review (describe how the render should look; it watches frames and steers the AE scripts) and **Three Director** in the Three.js Lab (describe a scene; it writes and checks the code). Toggle them with the 💬 button in the tool header.
- **Three.js Lab sliders**: 🎚 Sliders lists every number and color in a sketch; ⚡ ones change instantly, ↻ ones rebuild the scene when you let go. Press **Save to code** to keep them.
- **Visualizers**: load a track with 🎵 (or drop it on the preview), pick 9:16 on the preview for 1080×1920, shape it with the sliders (♪ links a slider to the music, ＋ Save look, 🎲 shuffle) and ⏺ Record to an MP4.
- **Ctrl+K** opens the command palette: every agent, chat, tool and action (`?word` searches inside messages).

## Shortcuts
| Keys | Action |
|---|---|
| Ctrl+K | Command palette |
| Ctrl+1 … 9 | Switch agent |
| Ctrl+Tab | Previous agent/tool |
| Ctrl+N | New native chat |
| Ctrl+F | Find in the current view |
| Ctrl+J | Notes |
| Ctrl+\\ | Chats panel |
| Ctrl+G | All agents side by side |
| Ctrl+Shift+Space | Ask all agents |
| Ctrl + / − / 0 | Text size |
| Ctrl+, | Settings |
| Ctrl+/ | All shortcuts |
| Ctrl+Alt+H | Show/hide the hub from anywhere (changeable) |

## Where things live
- `config.json`: agents, settings, theme (edited in-app; hot-reloads). `theme.css`: your CSS.
- `data/`: chats, notes, tasks, sketches, memory, usage, deleted chats (`data/trash`, 30 days). Back it up from Settings.
- `tools/`: the Forgeheart, Three.js Lab and After Effects workspaces.

## Troubleshooting
- Native Claude not signed in: click **Sign in** in the chat.
- Engine problems: `data/engine.log`.
- A chat deleted by mistake: Ctrl+K → "Recently deleted chats".
