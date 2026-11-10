# Round 172 · restyle172: everyday actions restyle only what they change

Round 171 found three ways the page restyled far more than an action changed (a `*` rule inserted after 12 s idle, a
position-dependent selector on the chat list, a MutationObserver reacting to `<title>`). This round hunted the same class
of problem across the whole app outside the Lab, measured each with Chrome's invalidation tracking, and fixed the ones
that fire often. The Lab, Scenes v2, the Lab's CSS and Codex's files were not touched.

Measured on this box as rounds 165–171: 4 shared CPUs, software GL, Xvfb 1480 × 940. A session in a temp data dir: 40
short chats in a project and one of 120 turns open (1,672 elements in the page; a whole-page style pass here is ≈ 660
elements, the rest is skipped by content-visibility), the plain look and Forgeheart. Each action traced with
`disabled-by-default-devtools.timeline.invalidationTracking` (who invalidated which element, and why) through a scratch
script (kept out of the repo); "elements" = the sum of UpdateLayoutTree's `elementCount` over the action.

## 1. Static audit

Rules that reach every element when one thing changes (non-Lab, non-Codex sheets):

- **`*` under a root attribute / class** (the whole page restyles when it comes or goes): `:root[data-blurhush] *`
  (idlecpu.css), `:root[data-away] *` (look.css), `:root[data-motion=off].reveal-alt *` (polish.css), `:root[data-motion=off] *`,
  `html[data-lite] *`, `html[data-skin~=forge|swirl] *`, `:root[data-look~=v2] *` (reduced motion only), `html.cap-clean *`.
- **`:has()` on a high ancestor**: `:root:has(> body.resizing)::after` (features.css; a drag only), `body:has(.dd-over.on)`
  (dragdrop.css; a drag only). Both restyle `<html>` / one pseudo, not the page.
- **Positional selectors on long lists**: `#chat-groups .group > .item:not(.active):nth-child(n+14)` (chatcore.css) and
  `.group.vlist > .item:nth-child(n)` (features.css): a row added restyles every row (≈ 40, rows are rebuilt anyway);
  `.palette-list > .palette-item:nth-child(n+14)`; `:last-child` rules on `.messages > .msg` (only the old / new last child).
- **Sibling combinators**: `.seg button + button`, `.opt-sec + .opt-sec`… on short lists; harmless.
- **Custom properties written on containers** (inherited by everything inside): `--panel-w` on `<html>` (a panel drag's
  end), the chat's light places on `.messages-wrap` (every resize in Forgeheart), `--companion-w` on a companion host
  (each frame of its split drag), `--dock-w` (a dock drag's end), `--chat-ident` on a chat's view (on open).

JS that toggles state on `<html>` / `<body>` at run time, and how often: idlecpu.js `data-hush` (a minute idle / the first
input after), `data-blurhush` (another app in front 5 s / back); juice.js `data-away` (window hidden / shown); keys-ui.js
`reveal-alt`, `reveal-alt-armed`, `reveal-ctrl` (Alt / Ctrl held); polish8.js `p8-over-media` (a menu opened); offline.js
`net-offline`; capture.js `cap-*`; look.js / renderer.js the look's attributes (a look change); appui.js `--panel-w`;
body `resizing` (drags). MutationObservers on `<html>`: native.js (every chat list's ground judged again on `style` / `class`
/ look attributes: a forced `getComputedStyle` per list, now and 1 s later) and appui-dialogs.js (Settings open only).

## 2. What the traces showed, ranked (how often × how much)

| # | Action | Cause | Before | After |
|---|---|---|---:|---:|
| 1 | Hearth in front again after ≥ 5 s in another app (and the hush going on) | `:root[data-blurhush] *` | 656 / 658 el., 11–23 ms each way | **2 / 2** |
| 2 | The window hidden / shown (minimised, restored) | `:root[data-away] *` | 656 / 657 el., 13–20 ms | **2 / 2** |
| 3 | Forgeheart: the window resized (each resize frame) | the lights' places (`--tint-*`) set on `.messages-wrap` were inherited by every message | 1,432 el. a pass, 2 a step (2,895 el., 54 ms); check: 1,102 el. | **49** (measure) / **184** (check) |
| 4 | Alt held (the tucked buttons) | `:root[data-motion=off].reveal-alt *` (a class change on `<html>` ⇒ every element, motion off or not) | 1,548–1,606 el., 35–40 ms | **857 el., 17–26 ms** |
| 5 | A minute without input (the look's loops rest) and the first input after | `.tabbar button` in idlecpu.css' list ⇒ every button | 151 / 151 el. | **50 / 50** |
| 6 | Alt / Ctrl held, a menu opened | the classes on `<html>` made native.js judge every chat list's ground again (forced style), now and 1 s later | 2 extra passes | none |
| 7 | A panel-edge drag let go | `--panel-w` written on `<html>` | 713 el. (plain), 2,072 el. / 54 ms (Forgeheart), once | left (below) |
| 8 | Pointing at a message / a chat row | the page's `:hover` invalidation set is "every descendant" (Lab rules, below) | rows 52 el., messages 384 | Lab's owner |
| 9 | A row arriving in the chats list | `:nth-child` on the list's rows (and the Lab's bare `> :nth-child(1)`) | ≈ 40 rows | left (rows are rebuilt anyway) |
| 10 | Motion / look changed | the setting itself (`*` rules by design) | whole page | left |

Not offenders (measured): typing 5 letters 8 elements; the first wheel after 13 s idle 102 (round 171's fix holds);
pointing at 10 chat rows 52; a row's menu opened and closed 91; the window losing focus 0; `<title>` changes 0; idle
1.5 s 0; a streaming reply's passes ≤ 172 elements each in Forgeheart (its style ms is the reply itself).

## 3. The fixes (no visible change)

1. **Animations rest by marking what animates** (look.js `Look.rest(why, on)`, look.css `[data-anim-rest]`): when the
   window is hidden (juice.js) or another app has been in front for 5 s (idlecpu.js), every element with a CSS animation
   (`document.getAnimations()`, pseudo-elements by their host) gets `data-anim-rest`, and any animation that starts while
   resting marks its element too (`animationstart`); coming back removes the marks. `animation-play-state: paused` as
   before, on those elements and their `::before` / `::after`, which is what `*, *::before, *::after` paused. `data-away` /
   `data-blurhush` stay on `<html>` as state, with no rule behind them. CSS-driven (not `Animation.pause()`), so other
   play-state rules (the minute's hush) keep working afterwards.
2. **No `.reveal-alt *` rule** (polish.css): with motion off, look.css' `:root[data-motion=off] * { animation: none !important }`
   already stops the tucked buttons' `dc-reveal`; the extra rule only made every Alt hold restyle the page.
3. **The chat's light places stay on its wrap** (chatcore.css `.messages-wrap > * { --tint-*: initial }`): only its
   `::before` / `::after` read them, so a resize restyles the wrap and its direct children, not the whole chat.
4. **The minute's hush names the tabs that loop** (idlecpu.css `.tabbar button.on`: every tab animation is on `.on`).
5. **native.js ignores Alt's / Ctrl's reveal classes, `p8-over-media` and `net-offline` on `<html>`** (they show or move
   controls, never the ground): no forced style pass per chat list on every Alt hold.

## Left, and why

- **`--panel-w` on `<html>`** (once per panel drag, 54 ms in Forgeheart): moving it onto `#panel` would also change what a
  look change does today (applyTheme writes the theme's 250 px on `<html>`, which wins over a dragged width until the
  next start). Worth doing with that decided; a one-line change in appui.js.
- **Alt held still reaches every button, span and titled element**: declutter.js' tucked-button rules end in `button`
  (`.notes-foot > button:nth-of-type(n)`, `.native-head > button:last-of-type`, Forgeheart's `.tabbar > button:nth-child(n+6)`),
  `[title^=…]`, `[data-feature=…]`, `.ghost`, and polish8's `.bdd-foot > span`. A class on those buttons would narrow it.
- **The chats list's `:nth-child(n+14)`**: a row arriving restyles ≈ 40 small rows, which a redraw rebuilds anyway.
- **`--companion-w`** (a companion's split drag, per frame) and **`--dock-w`** (a dock drag's end): rare.

## Check

`dev/checks/restyle172.js` (`node dev/run-checks.js --exact restyle172`; group `restyle172`): each action traced, the
window's restyled elements counted: blur hush and back ≤ 60 each (a busy dot rests while away and runs again; no CSS
animation left running), hidden / shown ≤ 60 each (the dot too), a minute's hush on / off ≤ 100, the first wheel after
13 s ≤ 400 with no pass over half a whole-page pass, 5 letters typed ≤ 150, the pointer over 10 rows ≤ 150, a row's menu
≤ 300, Alt held's biggest pass ≤ 65 % of the old way's, Forgeheart resize ≤ 300. The old way of blur / hidden / hush /
Alt / resize (their rules put back) is measured in the same run and reported. `window.R172_REPORT = 1` reports without
failing. smoke.js' `{ trace: 'stop', window: true }` now also gives `styleEls` (each pass' element count).

CHECKS_PLACEHOLDER

## For the Lab's owner

- **`:hover` invalidates whole subtrees app-wide.** Rules with `:hover` (or `:not(:hover)`) before the last part whose last
  part has no class / id / type make the page's `:hover` set "every descendant", so any element with a hover rule (a
  message, a chat row, the chat box) restyles everything inside it when pointed at: `three-lab.css:330` and
  `polish-lab.css:13` (`.three-preview:is(:hover…) .stage-pill .stage-seg ~ :not(.stage-size)`), `three-regroup.css`'s
  `html[data-lablook="forge"]:not(#rx-none) :is(.three-toolbar:is(:hover…) .tb-group[…] > :not(…), …, .spacer ~ *)`,
  `three-hudstage.css`' `.three-preview.st-on.st-pin:not(:hover) > .three-stats.fb-keep:not(.compact) > :not([hidden])…`
  and `.st-warn:not(.st-fresh):not(:hover) > *`, `three-lab.css`' `.three-preview:not(:hover) > .three-stats.fb-keep >
  :not(:first-child):not(.fb)`. The Lab's sheets load in every session (after the first screen), Lab opened or not.
  Measured with them removed (diagnostic only): pointing at 10 rows 52 → 44 elements, at 6 messages 384 → 293, same
  ms: small today, as the set also holds `button`, `span` and `[title]` from other rules. A type or class in each last
  part (`> button:not(…)`, `~ .stage-btn`) would fix it.
- Round 171's note stands: bare `> :nth-child(n)` last parts (`three-regroup.css`, `three-lab.css`) make the `:nth-child`
  set "every descendant" (seen again on the chats list's rows).

## For Codex

No Codex-owned file was edited. `project-workspace.css`'s `.pw-tool:nth-child(2) svg` is in the `:nth-child` set but
narrow (`svg`).
