# appcalm (round 49): a calmer app outside the Lab

labcalm (round 48) calmed the Lab screen; this pass does the same for the rest of the app, after rounds 40–48 added
send previews, local answers, usage cards, error details, notes and more. I took screenshots of ten states at
1280×800 and 2560×1440 (the empty start, a chat with a long reply at rest and pointed at, the chat box with two
attachments and a long message, 💡 Answered by Hearth, Astra's chat, the Usage window, Settings, Ctrl/⌘+K, the board,
a burst of six notes and an error with ▸ Details), plus Light, counted every control in sight, and looked for
duplicates, two names for one thing, mixed button styles and things that stay on screen. **Nothing was removed**:
every folded control is one click away in a ⋯ / More menu, and Ctrl/⌘+K finds it.

## Audit: controls in sight, before → after
Counted by `dev/checks/appcalm.js` (new): visible buttons, selects, inputs, summaries, links and roles (the way
simplify2 / chatcalm / labcalm count), pointer away. "Before" is the same check on the base commit (40a5550).

| State | 1280×800 before → after | 2560×1440 before → after |
|---|---|---|
| Empty start (rail + chats list + chat) | 26 → **24** | 26 → 24 |
| A chat with a long reply | 24 → **22** | 24 → 22 |
| … pointing at the reply | 27 → **25** | 27 → 25 |
| The chat box: 2 attachments + a long message | 27 → **25** | 27 → 25 |
| 💡 Answered by Hearth | 27 → **25** | 27 → 25 |
| Astra's chat | 26 → **24** | 26 → 24 |
| The Usage window | **16 → 13** | 17 → 14 |
| Settings (first sight) | 14 → 14 | 18 → 18 |
| Ctrl/⌘+K | 1 → 1 | 1 → 1 |
| The board | 23 → **21** | 23 → 21 |
| A burst of 6 notes + an error: notes on screen | **5 → 3** | 5 → 3 |
| … controls on those notes | **8 → 2** (Details, Show folder) | 8 → 2 |

| Part | Before | After |
|---|---|---|
| The rail | 14 | **12** |
| Rail tools drawn as text glyphs (⌂ Home, ❖ AI setup) | 2 | **0** |
| Names for Find anything on screen | 3 ("Command palette" in the rail ⋯ and the ⌘ button's tooltip, "Find anything" elsewhere) | **1** |
| Names for the Usage window | 3 (Usage, "Token dashboard" in Ctrl/⌘+K, "token dashboard" in the keys sheet) | **1** |
| The meter's tooltip | "Codex account limits and Hearth token traffic" (Claude's card was missing from it) | both AIs |
| Usage: tabs in sight | 8 | **5 + More ▾** |
| Usage: the traffic note | 3 lines, always | **1 line** (the rest on the pointer) |
| Settings: button sizes in rows | 3 (Turn on sync… large, Check this computer… medium, Backups… / Look now small) | **1** |
| 💡 card: button styles | a plain grey Show me beside a ghost button | Show me as the card's main action |
| The empty chat's ✦ link in Light | browser blue, underlined | the chat's own color |

Found and kept on purpose (said here so nobody "fixes" them later):
- The keys button bottom left: you asked for it (round 7).
- The empty chat's "⋯ AI setup" link in Astra's chat and the header ⋯: one is a word in the hint, one the button.
- **Astra tools** (a word button) next to ⋯ in Astra's header is Codex's: left as it is (see Suggestions).
- An AI's suggestion chip can read like a command (the fake engine suggests "/stats"): that is the AI's words.

## Upgrades

### The rail
1. **⛶ Full screen waits in the rail's ⋯** (it was always in the rail). While full screen is on it stays in the rail,
   so leaving is where you'd look. Its key and Ctrl/⌘+K "full screen" work as before; Alt shows it in place.
2. **The board drawer waits in the rail's ⋯** too ("Board drawer · Ctrl+Shift+M"). It had the same icon as the Board
   tool right above it. While the drawer is open its button stays in the rail.
3. **Home and AI setup have drawn icons** (a house, four diamonds) like Claude, Astra, Forgeheart, the Lab and the
   Board; they were the ⌂ and ❖ characters.
4. **One name: Find anything.** The rail ⋯ said "Command palette", the hidden ⌘ button's tooltip too; both now say
   Find anything, like Ctrl/⌘+K itself and the rail's right-click.

### Notes (toasts)
5. **At most 3 notes at once** (was 5); the older plain ones go first. Every note stays in Ctrl/⌘+K › Recent
   notifications. An Undo still stays longest.
6. **× (and ⚑ Report) show when you point at a note** or tab into it; notes leave by themselves anyway. An error
   keeps its fix button (Show folder, Retry…) and ▸ Details in sight. On a touch screen × always shows.

### The Usage window
7. **Five tabs and More ▾**: Overview, Agents, Models, Chats, Budgets & alerts; More ▾ has Tools, Features, Export
   (the button takes the name of the one you're on).
8. **Copy a summary of this range** moved from the ⧉ beside × into More ▾ (the right-click has it too).
9. **The traffic note is one line**: "Hearth's token traffic below: not your plan's allowance or bill ⓘ"; pointing at
   it says the rest.
10. **One name: Usage.** Ctrl/⌘+K says "Usage: what's left, tokens, budgets" (it said Token dashboard), the keys
    sheet "Right-click the Usage window", the meter's tooltip names both AIs' plans.
11. Ctrl/⌘+K finds **Usage › Tools: tokens per tool** and **Copy a usage summary of the last 7 days**.

### Buttons that look alike
12. **Settings: one button size in every row** (Turn on sync…, Check this computer…, What's new…, Backups…, Look now,
    ⋯ AI setup).
13. **💡 Answered by Hearth: Show me looks like the main action** (accent, small), Ask the AI anyway beside it as a
    ghost button.
14. **The empty chat's ✦ What can I do here?** uses the chat's color in every look (browser blue in Light).

**14 upgrades.**

## How it's built
- `declutter.js`: two REVEAL rows (`#full-btn`, `.bd-rail-peek`, `keep: '.on'`), the rail ⋯ rows
  (`Simplify.TUCKED`: Find anything…, Full screen, Board drawer), the ⌘ button's tooltip.
- `simplify.js` (icons of the two new ⋯ rows), `board-drawer.js` (an id on its rail button), `icons.js` (`home`,
  `setup`, `full`; `BY_ID` home / options).
- `ui.js`: 3 notes at once. `meter.js`: `RARE_TABS` behind More ▾, the copy in it, the one-line note, names.
  `keys-ui.js`: one line of words.
- `polish.css` (end, "appcalm"): notes' × on hover / focus, Settings' row buttons, the 💡 card's Show me, the Usage note
  and More ▾, the empty chat's link.

## Edits outside my lane (small)
`dev/checks/smooth46.js` (a burst of 10 notes shows the newest 3, was 5: same strength, new number),
`dev/run-checks.js` (appcalm in `chat` and its own `appcalm` group).

## Tests
- `dev/checks/appcalm.js` (new; in `chat` and its own `appcalm` group): the ten states at 2560×1440 and 1280×800,
  budgets per state at 1280 and per part (rail ≤ 12, chats list ≤ 6, header 1, chat box 4), 3 notes at once in a burst
  with the error's Details kept and × on pointing; the rail ⋯ says Find anything and holds Full screen and the
  Board drawer; no "Command palette" in the rail; a drawn icon on every rail tool; the meter's sentence; Usage 5 tabs +
  More with Tools / Features / Export / the copy, More › Tools opens it, the note one line; Ctrl/⌘+K finds full screen,
  board drawer, usage, token tools, features used, export token usage, copy usage summary, recent notifications,
  find anything. Base commit: 17 failures; after: PASS.
- Targeted runs (`sh dev/run-checks.sh appcalm`, while four other streams loaded the machine): appcalm, settingscalm,
  menucalm, hintcalm, appsearch, sendpreview, localanswers, qa-keys, bigscreen, lazy, `unit:boot-test` pass.
  chatcalm (its chat-box right-click read empty once) and usagelimits (hung 540 s in the group) passed when run again
  alone. a11y's audit passed; it only logged WebGL "context could not be created" under load (as in labcalm's run).
  smooth46 (updated: 3 notes) now shows 3 of 10; it still fails "notes placed for a burst: 2 (budget 1)" and "docked-chat
  searches: 2" — the base commit 40a5550 fails the same two steps (and the 🅰 layer step) in the same run conditions.

## Risks
- A check or habit that expects ⛶ or the board drawer always in the rail: they show only while on (or with Alt).
  `bigscreen` clicks `#full-btn` directly (it's still there, in place).
- 3 notes at once: a fast burst shows fewer at a time; the rest are in Recent notifications.
- The Usage window's Tools / Features / Export tabs are one click deeper; `Meter.dashboard('tools')` still opens them.

## Suggestions for Codex (Astra modules, not changed)
- Astra's header has a word button "Astra tools" next to ⋯; Claude's has only ⋯. Folding it into the header's ⋯
  (or an icon with the same tooltip) would make both headers read alike.

## For the patch notes
- The app is calmer outside the Lab too: the rail lost two buttons, notes come three at a time, and the Usage window
  shows five tabs.
- ⛶ Full screen and the Board drawer moved into the rail's ⋯ (each stays in the rail while it's on; their keys and
  Ctrl/⌘+K still work).
- Home and AI setup in the rail have proper icons now.
- One name everywhere: Find anything (Ctrl/⌘+K) — no more "Command palette" — and Usage (no more "Token dashboard").
- Notes: at most three at once; × shows when you point at one. Errors keep their fix and ▸ Details in sight. Older
  notes are in Ctrl/⌘+K › Recent notifications.
- Usage window: Overview, Agents, Models, Chats, Budgets & alerts in sight; More ▾ has Tools, Features, Export and Copy
  a summary. The long "token traffic" paragraph is one line (point at it for the rest).
- Settings' buttons are one size; 💡 Answered by Hearth's Show me looks like the main action.
- Nothing was removed: everything that moved is in a ⋯ / More menu and found by Ctrl/⌘+K.
