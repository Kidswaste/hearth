#!/bin/bash
# Installs Hearth on this Mac as a regular app. Quit Hearth, then run it once from Terminal, e.g.:
#   bash ~/Downloads/Hearth/mac/install-mac.sh
# - Moves this Hearth folder (the code and all your data) to ~/Library/Application Support/Hearth, the usual
#   place for an app's own files, so it no longer lives in Downloads.
# - Makes Hearth.app in /Applications: Electron (the engine Hearth runs on) renamed, with the flame icon, set to
#   start that folder. It shows up in Launchpad, Spotlight and the Dock like any other app.
# - Moves the old setup-mac.sh pieces (the ~/Applications launcher, the electron-mac folder) to the Trash.
# Running it again rebuilds the app; your data stays where it is.
set -e

main() {
  local src dest version arch apps app tmp base
  src="$(cd "$(dirname "$0")/.." && pwd)"
  dest="$HOME/Library/Application Support/Hearth"
  version="44.5.1"
  case "$(uname -m)" in arm64) arch=arm64 ;; *) arch=x64 ;; esac

  if [ ! -f "$src/main.js" ] || [ ! -f "$src/store.js" ]; then
    echo "This script has to stay in the mac/ folder inside the Hearth folder."; exit 1
  fi
  if pgrep -f "Hearth.app/Contents/MacOS/Electron" >/dev/null; then
    echo "Hearth is open. Quit it first (⌘Q), then run this again."; exit 1
  fi

  # 1. The Hearth folder (code + data) moves out of Downloads.
  if [ "$src" != "$dest" ]; then
    if [ -e "$dest" ]; then
      echo "There's already a Hearth folder at:"
      echo "  $dest"
      echo "Move it aside (or to the Trash) if it's an old copy, then run this again."; exit 1
    fi
    mkdir -p "$(dirname "$dest")"
    echo "Moving the Hearth folder to $dest…"
    mv "$src" "$dest"
  fi

  # 2. Electron, renamed to Hearth: reuse the one setup-mac.sh downloaded, or download it.
  tmp="$(mktemp -d)"
  if [ -d "$dest/electron-mac/Hearth.app" ]; then
    mv "$dest/electron-mac/Hearth.app" "$tmp/Hearth.app"
  else
    echo "Downloading Electron $version for this Mac ($arch)…"
    curl -fL --progress-bar -o "$tmp/electron.zip" "https://github.com/electron/electron/releases/download/v$version/electron-v$version-darwin-$arch.zip"
    ditto -x -k "$tmp/electron.zip" "$tmp/unzipped"
    mv "$tmp/unzipped/Electron.app" "$tmp/Hearth.app"
  fi
  base="$tmp/Hearth.app/Contents"
  plutil -replace CFBundleName -string "Hearth" "$base/Info.plist"
  plutil -replace CFBundleDisplayName -string "Hearth" "$base/Info.plist" 2>/dev/null || plutil -insert CFBundleDisplayName -string "Hearth" "$base/Info.plist"
  cp "$dest/mac/hearth.icns" "$base/Resources/electron.icns"

  # Electron starts Contents/Resources/app on its own. It only points at the Hearth folder, so saving data and
  # updating the code (git pull) never change the signed app. "agent-hub" keeps the same profile (website
  # logins, local storage) as before.
  rm -f "$base/Resources/default_app.asar"
  mkdir -p "$base/Resources/app"
  printf '{ "name": "agent-hub", "version": "0.1.0", "main": "boot.js", "private": true }\n' > "$base/Resources/app/package.json"
  local js_dest
  js_dest="$(printf '%s' "$dest" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  cat > "$base/Resources/app/boot.js" <<BOOT
// Written by mac/install-mac.sh: Hearth.app runs the Hearth folder (code + your data).
const fs = require('fs');
const path = require('path');
const HEARTH_DIR = "$js_dest";
if (fs.existsSync(path.join(HEARTH_DIR, 'main.js'))) {
  require(path.join(HEARTH_DIR, 'main.js'));
} else {
  const { app, dialog } = require('electron');
  app.whenReady().then(() => {
    dialog.showErrorBox('Hearth', \`Hearth's folder is missing:\\n\${HEARTH_DIR}\\n\\nRun mac/install-mac.sh from wherever the Hearth folder is now.\`);
    app.quit();
  });
}
BOOT

  xattr -dr com.apple.quarantine "$tmp/Hearth.app" 2>/dev/null || true
  codesign --force --deep --sign - "$tmp/Hearth.app" >/dev/null 2>&1 || true

  # 3. Into Applications (your own ~/Applications if the shared one isn't writable). Older copies go to the Trash.
  apps="/Applications"
  [ -w "$apps" ] || { apps="$HOME/Applications"; mkdir -p "$apps"; }
  app="$apps/Hearth.app"
  local n=0
  for old in "$app" "$HOME/Applications/Hearth.app"; do
    if [ -e "$old" ]; then n=$((n + 1)); mv "$old" "$HOME/.Trash/Hearth (old $(date +%Y%m%d-%H%M%S)-$n).app"; fi
  done
  mv "$tmp/Hearth.app" "$app"
  rm -rf "$tmp"
  if [ -d "$dest/electron-mac" ]; then mv "$dest/electron-mac" "$HOME/.Trash/electron-mac (old $(date +%Y%m%d-%H%M%S))"; fi
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" >/dev/null 2>&1 || true

  echo ""
  echo "Hearth is installed: $app"
  echo "Its files (code + your data): $dest"
  echo "If the old Hearth icon is in your Dock, drag it out and keep the new one (right-click → Options → Keep in Dock)."
  if [ -d "$dest/.git" ]; then
    echo "To update later: cd \"$dest\" && git pull   (then restart Hearth)"
  else
    echo "To get updates with git: bash \"$dest/mac/connect-git.sh\""
  fi
  echo "Opening Hearth…"
  open "$app"
}

main "$@"
