# Hearth on a Mac

## Move it over
1. On Windows: Settings → App → **Pack Hearth for a Mac…** (or Ctrl+K → "Pack Hearth for a Mac"). It saves one zip
   with the app, your chats, sketches, notes, references, memory and settings.
2. Copy the zip to the Mac (AirDrop, a USB stick, iCloud Drive…) and double-click it. It unzips to a `Hearth`
   folder (in Downloads if that's where the zip was).
3. Open Terminal and run (adjust the path if the folder is somewhere else):

   ```bash
   bash ~/Downloads/Hearth/mac/install-mac.sh
   ```

   It installs Hearth like a regular app:
   - the `Hearth` folder (code + all your data) moves to `~/Library/Application Support/Hearth`;
   - `/Applications/Hearth.app` is made from Electron (the engine Hearth runs on, from Electron's official
     releases), with the flame icon. It's in Launchpad and Spotlight; drag it to the Dock.

   Run it again any time to rebuild the app; your data stays put. It also replaces an older `setup-mac.sh`
   setup (that launcher and its `electron-mac` folder go to the Trash).

`setup-mac.sh` is the older way: it leaves the folder where it is and makes a small launcher in
`~/Applications`.

## Updates
Once (if the folder isn't linked to GitHub yet): `bash ~/Library/Application\ Support/Hearth/mac/connect-git.sh`.
Then: `cd ~/Library/Application\ Support/Hearth && git pull`, and restart Hearth (Ctrl+K → Restart Hearth).

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
