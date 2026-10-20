# Prepare a project for offline work

Open a project's **… → Prepare for offline**, or run `/offline prepare` in an open
project. It checks this computer's saved scenes, linked chats, timeline media and
moodboard files, and offers to download the Three.js module graph.

Scene libraries now use a versioned local cache shared with exports. First use
downloads missing modules; subsequent opens read disk, including after a restart.
The secure `hearth-three://library/<version>/...` handler only serves supported
Three.js JS paths, with bounded downloads and atomic writes. Exported players still
use their own relative library folder. No model, plug-in or account setting changes.

The check reports missing files and cloud placeholders instead of claiming the Mac
is ready because the PC is ready. It does not hydrate all cloud files, alter project
links, verify plug-in licenses or make cloud AI work offline. External URLs in scene
code are flagged for manual checking. Dynamic URLs and plug-in-internal assets still
require a real offline playback test.

Validation:

- `node dev/offline-library-test.js`: recursive module graph, cold restart without
  network, missing dependencies, atomic failure, path bounds, missing chats/scenes,
  and standalone export rewriting.
- `node dev/offline-test.js`: existing queue and reconnect behavior.
- `node dev/boot-test.js`: startup and lazy-module budgets.
- `dev/checks/offline-project.js` in isolated Electron: downloads 24 modules, shows
  the preparation dialog, then starts a fresh sandbox and renders a 3D scene with
  an addon while renderer networking is disabled. Fake engines, no paid replies.

Windows Electron checked locally. Mac code paths are shared, but actual Mac
playback, cloud download status and audio plug-in availability need a Mac check.
