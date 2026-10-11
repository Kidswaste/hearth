# Boot stream (round 16): a lighter, faster start

Hearth loaded every feature before showing the first screen: 175 scripts (6.5 MB) and 41 stylesheets. Now the first
screen (rail, chats, the open chat) comes first. The big features load right after it, one per idle moment, with the
Lab first because you use it most. Every command, menu line, shortcut, app and tool tab is still listed from the
first moment. Using one before its feature has loaded loads that feature and then runs it.

## Numbers (dev/perf-report.js, same machine, 3 interleaved rounds × 5 reloads, medians)
| What | Before (main) | After | Change |
|---|---:|---:|---:|
| Ready (first screen up) | 668 / 642 / 643 ms | 493 / 438 / 461 ms | **−30 %** |
| Interactive (last long task ≤ 3 s after ready) | 1085 / 1077 / 1074 ms | 502 / 458 / 490 ms | **−55 %** |
| Long tasks during startup | 1 | 0 | none left |
| Scripts / stylesheets in index.html | 175 / 41 | 109 / 29 (73 scripts + 9 sheets load later) | −38 % / −29 % |
| JS read before the first screen | 6.5 MB | 3.7 MB | −43 % |
| JS heap after GC, first screen (groups not loaded yet) | 6.9 MB | 5.2 MB | −25 % |
| JS heap after GC, everything loaded | 6.9 MB | 7.2 MB | +0.3 MB (stand-ins and manifest) |
| DOM listeners / nodes, everything loaded | 305 / 1786 | 282 / 1722 | fewer |

Earlier in the night, under heavy load from other agents, the same comparison read 931 → 457–550 ms. Absolute
numbers swing with machine load, so compare the ratios. Video Review was lazy-loaded too for part of the night (ready
≈ −45 %). On the lead's request it went back to loading at startup, because it's being removed next.

## Upgrades
### Startup
1. **The Three.js Lab loads after the first screen** (32 files, ≈ 2.3 MB). It's the first one to load. Starting on
   the Lab (for example with the Three Director docked) loads it right away, and the director's dock attaches once
   the Lab is in.
2. **The mood board loads after the first screen** (16 files). A message that points at "the board" waits for the
   board, so its vibe still goes along.
3. **The Commands page loads after the first screen** (5 files). Its ☰ tab is there from the start.
4. **The render queue UI loads after the first screen** (3 files).
5. **The Adobe bridges load after the first screen** (3 files).
6. **Publishing (deploy) loads after the first screen** (3 files).
7. **The app adapters (Meshy, Suno, Poly Haven, AI apps, Discover) load after the first screen** (6 files). The
   Apps list and the "App: …" palette lines are there at once.
8. **Discover, the guided tours and "What's new" load after the first screen** (3 files).
9. **Studio pipelines load after the first screen** (2 files).
10. **The CSS of those features loads with them** (9 stylesheets fewer at startup, so the first paint is cheaper).
11. **The ≈ 1000 command flows are built in the first idle moment** instead of before the first screen (≈ 20 ms).
    Anything that needs them earlier builds them first.
12. **Adobe and publishing load in the main process on their first use**: adobemain.js and deploymain.js are required
    on their first call instead of at app launch.

### Nothing disappears while it loads
13. **All 988 commands, 340 aliases and shared `when` names are listed from the start**, in the same order as before:
    the "/" menu, /help, the Commands page, plain-language search and qa-commands see the same list. Running one
    loads its feature, then runs it. Argument suggestions show once the feature is in.
14. **All 1272 Ctrl/⌘+K actions, 509 keys-sheet lines, 49 apps and 5 rail tool tabs are listed from the start.**
    Clicking one of them loads its feature, then does what it says.
15. **Agent tools reach features that haven't loaded yet**: a Claude or Astra tool call (three_…, board_…,
    adobe_…, deploy_…) loads its feature, then answers.
16. **A tool tab opened before its feature is in** shows "Loading …" for a moment, then the tool, its docked chat
    and its normal on-show behaviour.
17. **Safety net**: if something stops startup before the first screen is marked ready, the features still load
    after 6 s.

### For the next streams (dev)
18. **`lazy.js` + `lazy-data.js`**: the groups, `Lazy.load(name)`, `Lazy.when(name, fn)` (hook into a lazy module once
    it's in; used by makes.js, chat-scenes.js, chat-context.js, speed-resume.js), `Lazy.state()`, `Lazy.misses()`
    (globals touched before their group loaded; each one also loads its group).
19. **`node dev/lazy-manifest.js`** records what each group registers, with the files put back in their old places,
    and writes the manifest. It then compares the lazy build with the old order (names, aliases, actions, keys,
    apps, tools, duplicates: all equal now). `--check` fails when the manifest is out of date.
20. **Checks**: `dev/checks/lazy.js` (qa group) holds every group back with `localStorage['lazy.hold'] = '1'` and
    proves that first use works: a command, a palette action, an agent tool, the Commands page, board and Lab tabs,
    a wrapped command (/director), Adobe and deploy IPC. It also checks a Lab-first start with the director docked.
    `dev/boot-test.js` (unit) checks that the lazy main-process channels match and that the groups match index.html.

## Rules for adding files from now on
- A new file for the **Lab, board, Commands page, renders, Adobe, deploy, app adapters, discover/tour or studio**
  goes into its group in `lazy-data.js` (`files`, in load order), **not** into index.html. Then run
  `node dev/lazy-manifest.js`.
- A module that changes what it registers at load (commands, palette actions, keys lines, agent tool prefixes, apps,
  tools) needs a new `node dev/lazy-manifest.js` run. `--check` and `dev/checks/lazy.js` catch a stale manifest.
- An always-loaded module that hooks into a lazy one at load (`X.on(…)`, `X.ext.push(…)`) wraps the hook in
  `window.Lazy ? Lazy.when('group', hook) : hook()`.

## Known limits
- For about 0.3–1 s after the first screen, a menu that checks `typeof ThreeLab` / `typeof Board` (for example the
  attach menu's Board row) doesn't show that row yet. A command or tool tab used in that window loads its feature
  first, then runs.
- Once everything has loaded, memory is about the same as before (+0.3 MB). The saving is at startup and in startup
  time.
