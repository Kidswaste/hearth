# Hearth on a Mac

## Move it over
1. On Windows: Settings → App → **Pack Hearth for a Mac…** (or Ctrl+K → "Pack Hearth for a Mac"). It saves one zip
   with the app, your chats, sketches, notes, references, memory and settings.
2. Copy the zip to the Mac (AirDrop, a USB stick, iCloud Drive…) and double-click it. Move the `Hearth` folder
   where you want to keep it, e.g. your home folder (`~/Hearth`).
3. Open Terminal and run:

   ```bash
   bash ~/Hearth/mac/setup-mac.sh
   ```

   It downloads Electron (the engine Hearth runs on, from Electron's official releases), makes
   `~/Applications/Hearth.app` with the flame icon and opens it. Drag it to the Dock. Opening it again while
   it runs restarts Hearth, like the desktop shortcut on Windows.

## What you need on the Mac
- **Claude**: the Claude desktop app (signed in) or the `claude` command. Hearth finds it on its own; if not,
  Settings → Engines → Claude program.
- **Astra (ChatGPT / Codex)**: the Codex app or the `codex` command, same idea (Settings → Engines).
- The first message in each chat may ask you to sign in again: that's the engines' own login on this computer.

## What carries over and what doesn't
- Carries over: chats, sketches and their layers / keyframes / looks, notes and their screenshots, references,
  palettes, prompts, memory, settings, themes, your usage data.
- Fixed automatically on first start: saved locations of attachments, references and note screenshots.
- To re-pick on the Mac: songs linked to sketches that lived elsewhere on Windows (load them again in the Lab),
  folders in Settings (Forgeheart, After Effects), and file-access folders in agents' settings.
- Website logins (claude.ai, ChatGPT…) live in the browser profile and don't move: sign in again.
- Engine sessions don't move: chats continue, sending the earlier conversation along once.

## Shortcuts
⌘ works wherever Hearth says Ctrl (⌘K palette, ⌘F find, ⌘/ shortcut list…).
