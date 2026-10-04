# Agent Hub

Claude, Astra (ChatGPT), Kimi and DeepSeek in one window, using your normal logins.
No API keys, nothing extra to pay.

**Launch:** double-click `Agent Hub.cmd`.

## Shortcuts
| Keys | Action |
|---|---|
| Ctrl+1 … Ctrl+9 | Switch agent |
| Ctrl+G | All agents side by side |
| Ctrl+Shift+Space | Ask all agents at once |
| Ctrl+B | Show/hide the ask-all bar |
| Ctrl+R | Reload current agent |
| Ctrl+, | Open settings |

## Customize
Edit while the app is running; changes apply on save.

- **`config.json`**: agents (name, url, color, icon letter or image path), order, grid columns, colors, fonts.
  - Add an agent: copy a line, give it a new `id`, `name` and `url`.
  - `"enabled": false` hides an agent; `"askAll": false` leaves it out of ask-all.
  - `"inputSelector"`: CSS selector for a site's chat box, if ask-all can't find it.
  - `"askAll": { "pressEnter": false }` fills every chat box without sending, so you can review first.
- **`theme.css`**: any CSS on top of `app.css`.

Each agent keeps its own login (separate storage), so signing in once is enough.
