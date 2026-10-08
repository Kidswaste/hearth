#!/bin/bash
# Run once inside the Hearth folder that came from the "Hearth for Mac" zip: links it to the GitHub repo so
# `git pull` brings in new versions of the code. Your data/ folder and settings are left as they are.
set -e
cd "$(dirname "$0")/.."
if [ ! -d .git ]; then git init -q; fi
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/Kidswaste/hearth.git
git fetch -q origin main
git reset -q origin/main          # adopt the repo's history; files on disk stay untouched
git branch -M main
git branch -u origin/main main >/dev/null
echo "Connected. From now on, run 'git pull' in this folder to get updates (then restart Hearth)."
git status --short | head -20
