#!/bin/bash
# Sets Hearth up on a Mac. Run it once from Terminal:   bash ~/Hearth/mac/setup-mac.sh
# It downloads the same Electron version Hearth uses on Windows (from Electron's official GitHub releases),
# makes a "Hearth" app with the flame icon in your Applications folder, and opens it.
set -e
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
VERSION="44.5.1"
case "$(uname -m)" in arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
RUNTIME="$APP_DIR/electron-mac"

if [ ! -d "$RUNTIME/Hearth.app" ]; then
  echo "Downloading Electron $VERSION for this Mac ($ARCH)…"
  TMP="$(mktemp -d)"
  curl -fL --progress-bar -o "$TMP/electron.zip" "https://github.com/electron/electron/releases/download/v$VERSION/electron-v$VERSION-darwin-$ARCH.zip"
  mkdir -p "$RUNTIME"
  ditto -x -k "$TMP/electron.zip" "$TMP/unzipped"
  mv "$TMP/unzipped/Electron.app" "$RUNTIME/Hearth.app"
  rm -rf "$TMP"
  # Name and icon in the Dock / menu bar, then re-sign (ad hoc) so macOS accepts the changed bundle.
  PLIST="$RUNTIME/Hearth.app/Contents/Info.plist"
  plutil -replace CFBundleName -string "Hearth" "$PLIST"
  plutil -replace CFBundleDisplayName -string "Hearth" "$PLIST" 2>/dev/null || plutil -insert CFBundleDisplayName -string "Hearth" "$PLIST"
  cp "$APP_DIR/mac/hearth.icns" "$RUNTIME/Hearth.app/Contents/Resources/electron.icns"
  xattr -dr com.apple.quarantine "$RUNTIME/Hearth.app" 2>/dev/null || true
  codesign --force --deep --sign - "$RUNTIME/Hearth.app" >/dev/null 2>&1 || true
fi

# A small launcher in ~/Applications: opens Hearth, or restarts it when it's already open (like the Windows shortcut).
LAUNCHER="$HOME/Applications/Hearth.app"
mkdir -p "$LAUNCHER/Contents/MacOS" "$LAUNCHER/Contents/Resources"
cat > "$LAUNCHER/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Hearth</string><key>CFBundleDisplayName</key><string>Hearth</string>
<key>CFBundleIdentifier</key><string>local.hearth.launcher</string><key>CFBundleExecutable</key><string>hearth</string>
<key>CFBundleIconFile</key><string>hearth</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/>
</dict></plist>
PLIST
cat > "$LAUNCHER/Contents/MacOS/hearth" <<SCRIPT
#!/bin/bash
exec "$RUNTIME/Hearth.app/Contents/MacOS/Electron" "$APP_DIR" --restart "\$@"
SCRIPT
chmod +x "$LAUNCHER/Contents/MacOS/hearth"
cp "$APP_DIR/mac/hearth.icns" "$LAUNCHER/Contents/Resources/hearth.icns"
xattr -dr com.apple.quarantine "$LAUNCHER" 2>/dev/null || true
touch "$LAUNCHER"

echo ""
echo "Hearth is ready: ~/Applications/Hearth.app (drag it to the Dock to keep it there)."
echo "Opening it now…"
open "$LAUNCHER"
