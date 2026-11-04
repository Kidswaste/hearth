# Hearth

Hearth is a desktop app (Windows and macOS) for chatting with **Claude** and **Astra** (ChatGPT's Codex) on your own
subscriptions, with no API keys. Your chats live in **projects** and sync between your computers through your cloud
drive. Hearth knows its own code: give a chat access to Hearth's folder and it can add features or fix bugs in the app.
It also has the **Three.js Lab**, a 3D and motion editor that the AIs drive completely.

- **Start:** the "Hearth" shortcut on the desktop or in the Start menu (it restarts a running copy cleanly), or
  `Agent Hub.cmd`. On a Mac, see `mac/README.md`.
- **What it does:** [FEATURES.md](FEATURES.md).
- **How it is built** (for an AI or a developer working on it): [HANDOFF.md](HANDOFF.md).

## The basics
- **Rail (left):** your AIs and chats, then the tools: Projects, the Three.js Lab, the mood board, Commands.
- **Chats** run through the official Claude Code and Codex engines. You can attach files and screenshots, edit or
  retry messages, switch the model per chat, hand a chat to the other AI, and give a chat access to a folder (it asks
  before risky actions, and deletes go to the Trash).
- **The Three Director** sits beside the Lab: describe a scene and it builds it in layers. You then shape it with
  sliders, looks, the timeline and frame sizes, and render it to a video file.
- **Ctrl/⌘+K** finds every chat, command and setting. Type `/` in a chat for commands.

## Where things live
- `data/` (inside Hearth's folder): your chats, projects, scenes, memory, settings (`data/config.json`) and tool data.
  Updates never touch it. Deleted chats wait in `data/trash` for 30 days, and deleted files go to the system Trash.
- Backups: Settings › This computer & sync › Backups.

## Troubleshooting
- An engine isn't working: `/doctor` checks Claude Code and Codex and offers the fix.
- Engine logs: `data/engine.log`.
- Sync: the chip at the bottom of the rail opens the sync panel.
