# Round 177 · engine177: Electron 45.3.0 measured against 44.5.1 — not lighter, so no engine update offer

The owner: "check the new versions and go for something even more lightweight". Hearth runs on Electron (its own copy
of Chrome), the bundled `electron\electron.exe` on Windows and the Hearth.app that `mac/install-mac.sh` builds on the
Mac; Hearth's ⬆ Update (git) never changes it. The newest Electron is **45.3.0** (npm `latest`, Chromium 156); Hearth
runs on **44.5.1** (Chromium 152). This round measured both on Hearth, the same way, alternating, and ran the broad
checks on 45. The plan was an opt-in "Engine update" in Settings if 45 came out lighter or at least not heavier. It
didn't: **45 starts a little faster and draws the Lab a little smoother on this box, but holds more memory in every
everyday state.** So the offer was not shipped (it is built and parked on the local branch `engine177-offer`, see below).
The Lab, Scenes v2, the Lab's CSS and Codex's files were not touched.

## How it was measured

- 45.3.0's official `electron-v45.3.0-linux-x64.zip` from GitHub releases, unpacked to `/opt/hearth-electron-45`
  (`/opt/hearth-electron`, 44.5.1, untouched). The SHA-256 of all four release zips (Windows x64, Mac arm64 / x64,
  Linux x64) computed here and equal to Electron's `SHASUMS256.txt`.
- The harness picks the binary from `ELECTRON` (dev/smoke.js, dev/coldstart-report.js; default
  `/opt/hearth-electron/electron`): every tool ran once per engine, **44 then 45, then again 45 then 44** (two rounds:
  r1, r2), the shared run lock held per run:
  - start: `dev/coldstart-report.js --runs 10` (median of 10 launches after a warm-up)
  - CPU / wake-ups / Lab fps / hidden: `dev/perf151-measure.js` (chat idle, the Lab with realscene-lib's heavy scene
    playing at 960 × 540 and at 256 × 144, paused, Hearth hidden after the Lab)
  - memory: `dev/mem154-measure.js` (working set, private and proportional memory per process; `lab.restMs` 20 s)
  - main process and a streamed reply: `dev/main162-measure.js` (r1)
  - a session (6 long chats opened, scrolled, a reply streamed, Settings, Trim, the command bar, project switches, the
    board, hidden, the same in Forgeheart): `dev/audit166-measure.js` (r1)
- This box: 4 shared CPUs, software GL (SwiftShader: the "GPU process" is the CPU drawing), Linux, Xvfb.

## 44.5.1 vs 45.3.0

Each cell: r1 / r2 where both rounds ran it. MB; ms; "private" and "PSS" are what a process really holds (the working
set counts shared pages in every process).

| | 44.5.1 | 45.3.0 | |
|---|---:|---:|---|
| **Start** (median of 10): Electron ready | 160 / 172 ms | 131 / 147 ms | −27 ms |
| window on screen | 452 / 467 ms | 416 / 438 ms | **−33 ms** |
| first screen up | 522 / 540 ms | 469 / 478 ms | **−58 ms** |
| **Chat open, idle**: all processes' CPU | 3 / 4 ms/s | 5 / 6 ms/s | both ≈ 0.5 % of a core (noise level) |
| window wake-ups · main timers | 0 /s · 2 / min | 0 /s · 2 / min | same |
| **Memory, chat idle**: working set (4 processes) | 627 / 627 | 683 / 686 | +57 |
| PSS · private | 398 / 396 · 307 / 305 | 417 / 420 · 317 / 320 | **+22 · +12** |
| **The Lab playing**: working set (6) | 1,075 / 1,047 | 1,163 / 1,129 | +85 |
| PSS · private | 681 / 648 · 558 / 513 | 704 / 674 · 556 / 530 | +25 · +8 |
| **Back in the chat past the Lab's rest** (5): working set | 787 / 790 | 871 / 863 | +79 |
| PSS · private | 493 / 495 · 388 / 390 | 531 / 523 · 418 / 411 | **+33 · +26** (GPU process +27 private) |
| **Lab window, Hearth hidden, playing** (7): working set | 1,247 / 1,249 | 1,337 / 1,303 | +72 |
| PSS · private | 740 / 741 · 599 / 601 | 755 / 724 · 601 / 572 | −1 · −14 (one round each way) |
| **Hidden after the Lab**: all CPU · window wake-ups | 17 / 14 ms/s · 0.8 / 0.3 /s | 17 / 18 ms/s · 0.3 / 0.8 /s | same |
| **Lab play, heavy fixture 960 × 540**: frames drawn / s | 13.4 / 13.0 | 15.8 / 16.4 | **+22 %** for the same CPU |
| GPU process CPU · Lab window main thread | 3,232 / 3,200 · 66 / 54 ms/s | 3,289 / 3,356 · 57 / 54 ms/s | same |
| at 256 × 144: frames drawn / s | 20.3 / 23.3 | 21.2 / 24.2 | +1 |
| the Lab open · its first frame | 441 / 258 · 2,742 / 2,385 ms | 358 / 379 · 2,409 / 2,566 ms | noise |
| **A streamed reply** (main162, ≈ 100 KB): main CPU · wake-ups | 53.3 ms/s · 1,014 / min | 55.3 ms/s · 1,011 / min | same |
| (audit166, 40 K characters into a 400-turn chat): window task · all CPU | 1,263 ms · 30.6 s | 1,315 ms · 31.7 s | +4 % |
| **Chat scroll**, 40 wheel turns up a 400-turn chat: window task · all CPU | 1,369 ms · 32.4 s | 1,241 ms · 31.0 s | −9 % · −4 % |
| the same in Forgeheart | 1,643 ms · 48.8 s | 1,550 ms · 44.1 s | −6 % · −10 % |
| **Switch projects** ×6: window task · all CPU | 365 ms · 10.3 s | 349 ms · 10.7 s | same |
| 6 long chats opened: window task | 487 ms | 500 ms | same |
| the session's window renderer, private | 96 → 121 MB | 98 → 124 MB | +3 MB throughout |
| the session, all processes (working set) | 592 → 759 MB | 651 → 831 MB | +60–75 MB throughout |
| main process: heap after a GC · modules at the first screen | 11.3 MB · 106 | 11.2 MB · 106 | same |

**Reading it.** CPU is the same (within this box's noise) at idle, hidden, streaming, scrolling and switching. 45
starts 35–60 ms sooner and its software GL draws the heavy Lab scene ~20 % more frames for the same CPU (a Chromium
graphics change; on the owner's RTX 4080 the scene is drawn by the card, so this part may not carry over). But every
process is bigger: ≈ +10 MB working set each (network service 75 → 85, audio 69 → 80, window +15), and in what the system
really spends (PSS / private) **+12 to +33 MB in the everyday states** (a chat open; back in the chat after the Lab).
That is "heavier", if only by 3–7 %.

## Compatibility

Electron 45's breaking changes (docs/breaking-changes.md, 45.0), each looked up in Hearth's code:

| Change in 45 | Hearth |
|---|---|
| Sandboxed preloads lose `Buffer`, `setImmediate`, `require('events' / 'timers' / 'url')` | every preload (`preload.js`, `apps-`, `board-pin-`, `game-`, `gamelook-`, `gamequality-`, `quickidea-`, `stage-`, `twocopies-preload.js`, `labplayer/preload.js`) requires only `electron` and uses none of them: **fine** |
| `ipcRenderer` / `process` use a native EventEmitter (no static `events.once` …) | `preload.js` uses `eventNames()` / `listenerCount()` (instance methods, kept): **fine** |
| Screen capture asks `setPermissionRequestHandler` for `display-capture` (was `media`) | `main.js` ALLOWED_PERMISSIONS already holds `display-capture`; capture goes through `setDisplayMediaRequestHandler` (unchanged): **fine** |
| `chromeMediaSource: 'desktop'` refuses WebContents ids | not used (`labplayermain.js`'s `getMediaSourceId()` only places a window): **fine** |
| `window.open()` children of unsandboxed windows get their own process | every Hearth window is sandboxed: **fine** |
| `contentTracing` writes Perfetto only; `enableHeapProfiling` removed | not used (the measurement tools trace through CDP): **fine** |
| Files inside ASAR | Hearth isn't packed as ASAR: **fine** |
| `document.requestStorageAccessFor` off | not used: **fine** |
| **Deprecated:** synchronous `safeStorage` (`isEncryptionAvailable` / `encryptString` / `decryptString`), **removed in 46** | used by `appsmain.js` (app keys), `remotemain.js` and `interopmain.js` (`safe()`): works on 45; **must move to the async methods before Hearth goes to 46** (next round's to-do) |

Checks run on 45.3.0 (`ELECTRON=/opt/hearth-electron-45/electron`, `HEARTH_THREE_DIR` set):

CHECKS-45

## The decision

**Stay on 44.5.1; no engine update offer this round.** The rule was: offer 45 only if it is lighter, or at least not
heavier, and fully compatible. It is compatible, starts a little faster and plays the Lab a little smoother here, but
it holds ≈ 12–33 MB more in the states the owner spends his day in (≈ 55–85 MB more working set), which is the opposite
of what he asked for. 46 has to come anyway (sync safeStorage goes); it should be measured the same way when it is out.

**Parked, not shipped:** the whole opt-in offer is built and tested, on the local branch **`engine177-offer`** (commits
`673e3c5`, `1c38f40`, `90f05c6`; this branch has them and their revert `0db517e`), ready for a later engine that does
come out lighter:
- `engine.json` (pinned version, per-platform URL + size + SHA-256, only Electron's own GitHub release URLs accepted),
  `engineup-core.js` (manifest, checksum, layout, the Windows folder steps), `engineupmain.js` (click-only download with
  progress / Stop, SHA-256 check, unpack beside the app as `electron-next\`, restart), `engineup.js` (the Settings line
  and its one button, lazy group `engineup`)
- `Agent Hub.cmd`: swaps `electron-next\` in at the next start, keeps `electron-old\` for one start, marks the trial
  (`electron\.hearth-trial`); Hearth removes the mark at its first screen and the old engine one start later (the only
  deletion); a first start that never reaches its first screen rolls back (the new one kept as `electron-failed\`).
  Windows line ends (`.gitattributes` `*.cmd text eol=crlf`)
- `mac/install-mac.sh`: `HEARTH_ELECTRON_ZIP` / `_SHA256` (checked again) / `_VERSION` / `HEARTH_WAIT_QUIT`
- `dev/checks/engine177.js`: manifest refusals, checksum on a pretend zip, swap / confirm / tidy / rollback in a temp
  folder (never a real engine folder), the Mac plan, the .cmd's steps in order — **38 / 39** on its last run (the one
  miss was the check's own text search, fixed after). To ship it later: merge that branch, point `engine.json` at the
  new version with its checksums, and run the check on Windows once (the .cmd can't run here).

## For the Lab's owner

- Nothing in the Lab changed. On 45 the Lab's checks (playfix, smooth142, play149, labwin153, lite153) ran as listed
  above; the software-GL fixture drew ≈ 20 % more frames on 45.
- **three.js 0.187.0 is out** (the Lab pins 0.186.1): not changed here; worth a look by the Lab's owner.

## For Codex

No Codex-owned file was edited. Nothing in Codex's files uses an API Electron 45 removed or changed (checked: no
`safeStorage`, `contentTracing` or `chromeMediaSource`; their `Buffer` / `setImmediate` use is in the main process,
where Node is whole).
