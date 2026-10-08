# Night build: what changed

Thirteen work streams in two rounds, each tested in a throwaway copy of Hearth before it reached `main`.
Every file here lists its upgrades one per line (some group a family of presets or commands on one line, so the
line count is lower than the number of upgrades).

| Area | File | Numbered lines |
|---|---|---:|
| Chat core: every chat action as a `/command`, message ⋯ menu, pins, bookmarks, richer Markdown, panel filters / tags / folders | [chat.md](chat.md) | 170 (≈304 upgrades) |
| Astra: per-chat model / effort / web / personas, duo · relay · debate · council · handoff with Claude, `/astra-doctor` | [astra.md](astra.md) | 250 |
| Token meter: live strip / pill, dashboard (Ctrl+Shift+U), budgets, reply badges, usability totals | [meter.md](meter.md) | 157 |
| Look: Forgeheart 2 (bold default), chrome / glass / forged materials, 31 looks, Forgeheart Classic | [look.md](look.md) | 263 |
| Three.js Lab reworked around your habits (Save / Shuffle / Tap / Freeze / frame sizes first) | [lab.md](lab.md) | 306 |
| Lab effects: 156 filter layers, 85 templates, 154 looks, 104 palettes, 62 trigger presets, one picker (X) | [fx.md](fx.md) | 653 |
| Node editor + Lab nodes (Code ⇄ Nodes, 127 node types, 29 presets) | [nodes.md](nodes.md) | 104 (≈241 upgrades) |
| Nodes round 2: Shader nodes, Video flows, code-flow view for chat code | [nodes2.md](nodes2.md) | 132 (≈304 upgrades) |
| Video Review reworked: library, frame-accurate player, A/B, safe zones, drawn notes, social exports, Mac AE | [video.md](video.md) | 324 |
| Add-ons: 169-prompt library, 42 personas, notes, memory cost, Kit, Forge Debug, backups / import | [addons.md](addons.md) | 391 |
| Director agents: Three Director ≈67 % fewer tokens per message, faster edit loops, dock strip, undo | [director.md](director.md) | 147 |
| Polish: one design system across all the new UI, materials on your favorite controls | [polish.md](polish.md) | 242 |
| QA: 25 integration bugs fixed, command / key collisions, data-safety fixes | [qa.md](qa.md) | 29 |
| Journeys (round 3): your real workflows end to end; 21 fixes and additions (Lab keys after a click on the picture, sizes that moved under the pointer, Enter in the `/` menu, `/save`, Video Review focus…) | [journey.md](journey.md) | 21 |
| **Total** | | **3,154** |

## Start here
- Type `/` in any chat: **≈570 chat commands**, grouped by area; `/help <word>` filters them. `/do <anything>` runs any Ctrl+K action.
- **Token meter** at the bottom (`/meter pill` tucks it into the rail). **Dashboard**: Ctrl+Shift+U or `/usage`.
- **Looks**: Settings → Appearance, Ctrl+Shift+L, `/appearance`, `/theme <name>`. Back to the old look: `/classic`.
- **Lab**: X = effects picker, Alt+N = Code ⇄ Nodes, F = Freeze (Focus moved to Shift+F), Shift+1…5 = frame sizes, T = Tap.
- **Astra with Claude**: the ⚇ chip in the composer, or `/duo`, `/relay`, `/debate`, `/council`, `/handoff`, `/compare-agents`.

## Behaviour changes worth knowing
- Forgeheart is bolder by default; Forgeheart Classic keeps the previous look (some layout polish applies to both).
- In the Lab, **F freezes** (Focus is Shift+F); right-clicking a timeline marker opens a menu (double-click still deletes).
- `/look` means the Lab's saved looks inside the Lab, the Appearance picker elsewhere; `/appearance` always opens the picker.
- The Three Director's tool guide now lives in its system prompt and rarer tools sit behind one `three_do` tool (lean mode).
  If its quality drops, `/director-mode full` restores the long version (more tokens).
- Opt-ins that cost tokens stay off: `/nodes-director on` (directors edit node graphs), `/director-mode full`,
  Astra's file access / talk-back tools / suggestions, `/astra-tools on`.

## Not verified (nothing here could run them)
Real Claude Code / Codex CLIs (tested with faithful fakes), After Effects and AppleScript on a Mac, real claude.ai /
ChatGPT export files, the real Forgeheart build, and performance of the heavier shaders on a real GPU.
