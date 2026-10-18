#!/bin/sh
# (round 64, twocopies64) Hearth-Windows.zip, one fixed recipe (round 60 built it by hand; round 64's incident: the owner
# unzipped it NEXT TO their real Hearth and the new, empty copy looked like "all my chats are gone").
#   sh dev/make-windows-zip.sh [--out Hearth-Windows.zip] [--electron <the Windows electron folder>] [--ref main]
#                              [--depth 50] [--origin https://github.com/kidswaste/hearth.git]
# What's in the zip:
#   README-FIRST.txt   "If you already have Hearth, don't use this — press ⬆ Update in your Hearth instead."
#   Hearth/            a shallow git checkout (the last --depth versions) of --ref, core.autocrlf=false,
#                      core.filemode=false, origin = --origin with its fetch line, and refs/remotes/origin/main set to
#                      the zipped version itself (git update-ref refs/remotes/origin/main HEAD), so the first ⬆ look
#                      never counts an old origin/main below the shallow edge (winfresh60's "island")
#   Hearth/electron/   the Windows Electron runtime, when --electron is given
#   Hearth/Start Hearth.cmd
# Never in it: data/ (anyone's chats and settings), electron-mac/, node_modules/, anything git ignores.
set -eu

here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/Hearth-Windows.zip"; electron=""; ref="HEAD"; depth=50; origin="https://github.com/kidswaste/hearth.git"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --electron) electron="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    --depth) depth="$2"; shift 2 ;;
    --origin) origin="$2"; shift 2 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
done
case "$out" in /*) ;; *) out="$(pwd)/$out" ;; esac

work="$(mktemp -d "${TMPDIR:-/tmp}/hearth-winzip.XXXXXX")"
trap 'rm -rf "$work"' EXIT
rev="$(git -C "$here" rev-parse --verify "$ref^{commit}")"

# 1. a shallow checkout of exactly that version (a clone only has what git tracks: no data/, nothing ignored)
git -C "$here" branch -f hearth-winzip-tmp "$rev" >/dev/null
git clone -q --no-local --depth "$depth" --branch hearth-winzip-tmp "file://$here" "$work/Hearth"
git -C "$here" branch -D hearth-winzip-tmp >/dev/null
cd "$work/Hearth"
git checkout -q -B main
git branch -D hearth-winzip-tmp >/dev/null 2>&1 || true
git config core.autocrlf false
git config core.filemode false
git remote set-url origin "$origin"
git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || git config branch.main.remote origin
git config branch.main.merge refs/heads/main
# (a) origin/main = the zipped version: no island from before the zip below the shallow edge
for r in $(git for-each-ref --format='%(refname)' refs/remotes/origin/); do git update-ref -d "$r"; done
git update-ref refs/remotes/origin/main HEAD
test "$(git rev-parse refs/remotes/origin/main)" = "$(git rev-parse HEAD)"
git reflog expire --expire=now --all >/dev/null 2>&1 || true

# (b) never anyone's data (a clone has none; this is the guard if that ever changes)
rm -rf data electron-mac node_modules
test ! -e data

# 2. the Windows runtime and the start file (CRLF: cmd.exe)
if [ -n "$electron" ]; then
  test -f "$electron/electron.exe" || { echo "no electron.exe in $electron"; exit 1; }
  cp -R "$electron" "$work/Hearth/electron"
fi
printf '@echo off\r\nstart "" "%%~dp0electron\\electron.exe" "%%~dp0."\r\n' > "$work/Hearth/Start Hearth.cmd"
git update-index -q --refresh >/dev/null 2>&1 || true

# (c) the first thing anyone reads
printf '%s\r\n' \
  "Hearth for Windows" \
  "" \
  "If you already have Hearth, don't use this — press ⬆ Update in your Hearth instead." \
  "Your chats and settings live in your own Hearth's data folder (for example C:\\Users\\you\\agent-hub\\data)." \
  "A second copy starts empty and can make it look like your chats are gone (they aren't)." \
  "" \
  "New to Hearth on this computer:" \
  "  1. Move the Hearth folder from this zip to your user folder (C:\\Users\\<you>\\Hearth)." \
  "  2. Double-click \"Start Hearth.cmd\" inside it. Hearth makes its Start menu and Desktop shortcuts." \
  "  3. Updates later: the ⬆ button in Hearth." \
  "" \
  "Version: $(git rev-parse --short HEAD) ($(git log -1 --format=%cd --date=short))" > "$work/README-FIRST.txt"

# 3. the zip (data/ left out once more, in case)
rm -f "$out"
cd "$work"
if command -v zip >/dev/null 2>&1; then
  zip -qr -X "$out" README-FIRST.txt Hearth -x 'Hearth/data/*' 'Hearth/data'
else
  python3 - "$out" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('README-FIRST.txt')
    for root, dirs, files in os.walk('Hearth'):
        if root == 'Hearth' and 'data' in dirs: dirs.remove('data')
        for d in dirs: z.write(os.path.join(root, d))
        for f in files: z.write(os.path.join(root, f))
PY
fi
echo "made $out ($(git -C "$work/Hearth" rev-parse --short HEAD), depth $depth, origin/main = HEAD, no data/)"
