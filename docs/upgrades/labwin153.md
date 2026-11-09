# Round 153c · labwin153: the Lab in its own lean window

The owner: "a lighter window just for the Lab" (earlier: "opening a Three.js project should unload every other chat and
project and only load that project, ideally in a different electron window … run at full power and framerate even
though it's in the background").

## What existed before

- **The Stage window** (round 22, `main.js` `stage:*`, `stage-preload.js`): only the *preview page*
  (`tools/three-sandbox.html`) in its own window; the editor, timeline and everything else stayed in Hearth's window,
  which kept loading the whole chat app. Unchanged, except that its messages now go back to whichever window opened it
  (Hearth's or the Lab window: `stageOwner`), and `live:start` runs in the window that asked.
- **▶ Play** (gamemode): a game build in its own window. Unchanged.

## What's new

| Piece | File |
| --- | --- |
| The window: created / focused / closed, scene ownership, the director's calls relayed, Hearth hidden or throttled | `labwinmain.js` (new, registered in `main.js`) |
| The page: the Lab's code only | `lab-window.html`, `lab-window-pre.js`, `lab-window.js`, `lab-window.css` (new) |
| Hearth's side: ⧉ open, the "Open in Lab window ↗" card, routing, the drawer's messages, coming back | `tools/three-labwin.js` + `.css` (new, lazy group `lab`) |
| Which lazy groups exist in the Lab window | `lazy.js` (`HearthLabWindow.groups`; `window.HearthFeatures` respected when present) |
| A call for the away scene runs in the Lab window | `bridge.js` (`run` → `LabWinHost.route`) |
| Never a second preview of the away scene; full rate in the Lab window; save now / read back | `tools/three.js` (`run`, `workspace.resume`, `capMsg`, `scenes.saveNow / refreshOne`, two menu rows) |
| Safe open doesn't take the hand-off for a crash | `tools/three-safeopen.js` (`LabSafe.handOff`) |
| The project menu row | `projmenu.js` |
| The bridge | `preload.js` (`hub.labwin`) |

### Where to click

Lab **⋯ › View & help › ⧉ Open in its own window** (and **Hide Hearth while the Lab window is open**); the preview's
right-click / **⋯ › View**; a project's menu **⧉ Open in its own window** (its main scene); Ctrl/⌘+; `labwin`
(`/labwin hide`, `/labwin close`; plain words "open lab window" find it); Ctrl/⌘+K "Lab: ⧉ Open in its own window".
In the Lab window: **⋯ › View & help › ↩ Back to Hearth**, or close it.

## What loads in the Lab window, and what doesn't

- **Eager (20 files):** `jank.js winmac.js ui.js powerwise.js icons.js keys.js progress.js storeack-core.js md.js
  renderer.js tools.js bridge.js commands.js lazy-data.js lazy.js appui.js look.js keys-ui.js` + the three
  `lab-window*` files. Not loaded: `native.js` (the chat view), `panel.js` (chats list), `usage.js` (the usage
  scanner), `meter.js`, `astra.js`, `router*.js`, `missions.js`, `manager.js`, `sync.js`, `chat-*.js`, `offline*.js`,
  `access*.js`, `makes*.js`, `speed-*.js`, `collab-eyes.js`, `start.js`, `splash.js`… (quiet stand-ins in
  `lab-window-pre.js` answer the few calls the Lab's code makes into them).
- **Lazy groups that exist there (58 of 160):** loaded right away: `kit nodes labintent lab cmdbar glrecover keyslines
  dragdrop`; on first use only: the Lab's own feature groups (`gallery packs labvar framebar scenedoctor critique …
  renders gamemode gameready interop remote phoneview`). Every other group (chats, boards, projects, budget, routines,
  memory, notes, capture, assets, sync panels, Astra, flows, hooks, directordock…) has **no stand-in at all** there:
  nothing can pull it in. Measured in the check: 12 groups loaded after the scene opened (`kit nodes labintent lab
  cmdbar glrecover framebar projlook speedcheck perform dragdrop keyslines`).
- No `<webview>`, one surface (the Lab), no chats read (`H.chats = []`), the agents read for their names only;
  **settings are never written from the Lab window** (`config:save` from it is refused in `main.js`).

## How the AI reaches it

The engines and chats stay in Hearth's window (moving the chat UI would mean loading `native.js` and the whole chat
stack again, which is what the window is meant to avoid). So:

- **The director's tool calls** (`three_*`, `three_do`, batches) still arrive in Hearth's window (gamebridge). For the
  scene that is away, `bridge.js` hands them, whole, to the Lab window (`labwin:call` → `HubBridge.call` there): its
  transaction / history wrapping, picture, errors and fps are the Lab window's. Calls for other scenes (backstage) stay
  in Hearth. Measured: the call answers normally, the layer shows in the Lab window at once.
- **The slim drawer**: the Lab's dock (where the docked chat sits in Hearth) holds a small box in the Lab window. What
  you type goes to the scene's chat in Hearth (`labwin:ask` → `Native.send`, to the chat linked to the scene, else the
  Lab's director). The drawer shows "working on it…", the AI's tool steps on that scene, and the first 300 characters of
  the reply; "Show the chat in Hearth ↗" brings Hearth's window forward on it.

## One scene, one editor (no divergence)

- Opening: the scene is saved (`scenes.saveNow`, even one never saved yet), Hearth's Lab lets go of it
  (`workspace.close()`: its preview page released — WebGL, sound, timers) and `LabSafe.handOff` clears its "open
  pending" marker.
- While away, `run()` in Hearth's Lab refuses that scene (and `workspace.resume`), and the card covers its Lab.
- `main.js kv:set` merges the scenes file (and `three-lab-extras / three-thumbs / three-notes / three-refs`, keyed by
  scene) by owner: a save from the Lab window keeps only its scene; one from Hearth's window keeps the Lab window's
  scene as on disk. The check proves a save from Hearth meanwhile doesn't put its old copy back.
- Closing: `scenes.refreshOne` reads the scene, its settings, notes and references back from disk; Hearth's Lab opens
  on it, its preview running again. Hearth's window reloaded meanwhile: it asks and keeps the scene away. The Lab
  window's page crashes: the window closes and the scene comes back to Hearth (Safe open takes it from there).

## Window settings

- Lab window: `contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false`, the same
  `preload.js`, the same CSP as `index.html`, links to the browser, no navigation; **`backgroundThrottling: false`**
  (this window only) and the Lab's Auto fps counts it as "in front" like the Stage window (`capMsg`), so it keeps full
  rate behind other apps. **Lite mode**: if `window.HearthLite` (`on` / `isOn()` / `enabled`) or the `lite` setting
  (`hub.lite` in storage) is on, the normal 30 fps background cap applies (`LabWinHost.lite()`). Minimised, it parks.
- Hearth's window: `backgroundThrottling` stays on (it rests when unseen, as always), its Lab released; hidden when
  "Hide Hearth while the Lab window is open" is on (or "Hide Hearth too" on the toast), shown again on close.

## Measured (`dev/labwin153-measure.js`)

`node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/labwin153-measure.js [--burn 3]`. realscene-lib's
heavy scene (30,000 particles, glTF model, rAF rig, bloom, 124 BPM song) at 960 × 540, 10 s per setup, this box: 4
shared CPUs, **software GL** (the "GPU process" is the CPU drawing the scene; on the RTX 4080 that work is on the card).

Calm box (`--burn 0`), ms of CPU per second (1000 = one core) · MB:

| Setup | All | GPU (scene) | Hearth window | Lab window | Preview page | Main | Memory | Processes | Preview frames drawn / s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| (a) Lab in Hearth's window, playing | 3,427 | 3,321 | 37.9 | — | 51.9 | 11.0 | 1,070 MB | 6 | 75 |
| (a) Lab in Hearth's window, stopped | 3,408 | 3,327 | 15.0 | — | 50.9 | 9.0 | 1,048 MB | 6 | 63 |
| (b) Lab window, Hearth hidden, playing | 3,516 | 3,420 | **0.0** | 28.3 | 55.7 | 6.8 | 1,267 MB | 7 | 73 |
| (b) Lab window, Hearth hidden, stopped | 3,507 | 3,428 | **0.0** | 21.8 | 46.4 | 5.5 | 1,241 MB | 7 | 60 |

Busy box (`--burn 3`) (three CPU burners on 4 CPUs; load 4.9–6.3):

| Setup | All | GPU (scene) | Hearth window | Lab window | Preview page | Main | Memory | Processes | Preview frames drawn / s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| (a) Lab in Hearth's window, playing | 1,729 | 1,635 | 39.9 | — | 39.9 | 10.0 | 1,043 MB | 6 | 40 |
| (a) Lab in Hearth's window, stopped | 1,813 | 1,756 | 14.0 | — | 30.0 | 8.0 | 1,022 MB | 6 | 37 |
| (b) Lab window, Hearth hidden, playing | 1,772 | 1,694 | **0.0** | 25.3 | 41.2 | 7.5 | 1,270 MB | 7 | 37 |
| (b) Lab window, Hearth hidden, stopped | 1,743 | 1,685 | **0.9** | 19.1 | 30.0 | 4.5 | 1,241 MB | 7 | 28 |

(The scene's drawing gets its fair share of the 4 CPUs either way; frames drawn are within noise of each other.)

Time to the first preview frame (from the click / the tab): Lab in Hearth's window **2.55 s** (calm) · Lab window
**3.21 s** (calm: the window and its page 0.22 s, the settings 0.24, the Lab's code 0.43, the scene opened 0.63, its
first run 0.87, its first frame 3.12 s — software GL compiling the scene's shaders, as in Hearth) · busy: Hearth's window **3.54 s** · Lab window **3.99 s** (its first frame 3.87 s after its page started).

What this means:

- **The Lab's own UI work** (the window's main thread around the scene) is ~25–37 % lower in the Lab window while playing
  (calm 37.9 → 28.3 ms/s, busy 39.9 → 25.3) and **Hearth's window drops to 0** (hidden, throttled, its Lab released). The chat side and the 3D
  side no longer share one busy renderer thread: the Lab window's thread does only the Lab.
- **The scene itself costs the same** (GPU process and preview page within noise): the window can't make the scene
  cheaper; what it changes is that nothing else in Hearth competes with it, and that it keeps full rate behind other apps
  (the check: 36–54 fps, cap 60, while Hearth's window has the focus; Hearth's own Lab drops to 30 there).
- **Memory is ~200 MB higher, one more process**: Hearth's window stays loaded (it holds the chats and the AI engines'
  conversation state) while the Lab window adds its own renderer (≈ 190–210 MB). Unloading Hearth's renderer while the
  Lab window is open (and restoring the chats after) would win that back; not done this round (risky: a reply streaming
  into a chat, drafts, the director's calls arrive through it).

## Check

`dev/checks/labwin153.js` (`node dev/run-checks.js --exact labwin153`; group `labwin153`): the ⋯ row and `/labwin`;
the window opens on the scene in its own process and draws; no chat / board / project / usage group or script in it;
Hearth's Lab released, the card, `resume()` runs nothing; an AI call from Hearth lands in the Lab window, a rename there is
on disk at once, a save from Hearth meanwhile keeps it; security prefs equal to Hearth's window, no
`require`/`process`, same CSP, `backgroundThrottling` off only there; drawing at full rate while unfocused (Lite: 30);
the drawer reaches the scene's chat and the reply comes back; close → Hearth's Lab on the scene with the edits;
"Hide Hearth" hides and restores. `dev/smoke.js` gained `{ cdnFor }` (another window's pages get the local three.js copy)
and `pageEval` with `frame: true` (an out-of-process frame, e.g. the Lab window's preview).

Final run: FINAL_RUN

## For Codex

Nothing: no Codex-owned file was touched (`projmenu.js` is not under `projects*`).
