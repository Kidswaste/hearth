# Night build: what changed

Sixteen work streams in three rounds, each tested in a throwaway copy of Hearth before it reached `main`.
Every file here lists its upgrades one per line (some group a family of presets or commands on one line, so the
line count is lower than the number of upgrades).

| Area | File | Numbered lines |
|---|---|---:|
| Chat core: every chat action as a `/command`, message ⋯ menu, pins, bookmarks, richer Markdown, panel filters / tags / folders | [chat.md](chat.md) | 165 |
| Astra: per-chat model / effort / web / personas, duo · relay · debate · council · handoff with Claude, `/astra-doctor` | [astra.md](astra.md) | 250 |
| Token meter: live strip / pill, dashboard (Ctrl+Shift+U), budgets, reply badges, usability totals | [meter.md](meter.md) | 157 |
| Look: Forgeheart 2 (bold default), chrome / glass / forged materials, 31 looks, Forgeheart Classic | [look.md](look.md) | 263 |
| Three.js Lab reworked around your habits (Save / Shuffle / Tap / Freeze / frame sizes first) | [lab.md](lab.md) | 306 |
| Lab effects: 156 filter layers, 85 templates, 154 looks, 104 palettes, 62 trigger presets, one picker (X) | [fx.md](fx.md) | 653 |
| Node editor + Lab nodes (Code ⇄ Nodes, 127 node types, 29 presets) | [nodes.md](nodes.md) | 88 |
| Nodes round 2: Shader nodes, Video flows, code-flow view for chat code | [nodes2.md](nodes2.md) | 118 |
| Video Review reworked: library, frame-accurate player, A/B, safe zones, drawn notes, social exports, Mac AE | [video.md](video.md) | 324 |
| Add-ons: 169-prompt library, 42 personas, notes, memory cost, Kit, Forge Debug, backups / import | [addons.md](addons.md) | 391 |
| Director agents: Three Director ≈67 % fewer tokens per message, faster edit loops, dock strip, undo | [director.md](director.md) | 147 |
| Polish: one design system across all the new UI, materials on your favorite controls | [polish.md](polish.md) | 242 |
| QA: 25 integration bugs fixed, command / key collisions, data-safety fixes | [qa.md](qa.md) | 29 |
| Perf (round 3): ready 45 % sooner, nothing running when idle, lighter streaming, perf budget check | [perf.md](perf.md) | 18 |
| Journeys (round 3): your real workflows end to end; 21 fixes and additions (Lab keys after a click on the picture, sizes that moved under the pointer, Enter in the `/` menu, `/save`, Video Review focus…) | [journey.md](journey.md) | 25 |
| Command bar (round 3): Ctrl/⌘+; over any tool, plain-language search ("make it 9 by 16"), `/help` dialog, history, macros, timers, pipes, clickable commands in replies | [cmdbar.md](cmdbar.md) | 127 |
| Jam (round 4): `/jam`, Claude and Astra take turns making a music visual in the Lab (Astra art-directs from a picture), one card, undo per round, best round kept | [jam.md](jam.md) | 35 |
| Scenes (round 4): each director chat owns its scene, switching chats switches it, a color + mark per chat, directors work on their own scene (backstage when it isn't on screen), `/scene` | [scenes.md](scenes.md) | 33 |
| Simplify (round 4): fewer controls on screen (357 → 180 on the main surfaces), short menus with More…, `/decide` lets Astra choose a look / effect / frame size / app look with Undo | [simplify.md](simplify.md) | 27 |
| Assist (round 5): `/shuffle-pick` (hold 🎲 Shuffle) makes thumbnails, you click one or ✦ Astra picks; looks and sketches named from their colors and song; `/usual` frame; next-step chips after a director reply; `/review-astra` notes in Video Review; costs in `/assist` | [assist.md](assist.md) | 31 |
| Smooth (round 5): Video Review, chats, node editor, Lab sliders / FX thumbnails and the meter measured and made cheaper (playhead on the compositor, auto-scroll that never fights you, wires patched in place, no blur over moving content); before → after numbers | [smooth.md](smooth.md) | 31 |
| Music (round 5): background analysis (tempo, bar 1, kick / snare / hat, sections, drops), Mark kicks for me, tap that learns, colored waveform, ✦ Make it react, live beat lock | [music.md](music.md) | 51 |
| Scenes 2 (round 5): scene stills on chat rows, cross-fade between chat scenes, Jam filmstrip / recap / share, jams survive chat switches | [scenes2.md](scenes2.md) | 34 |
| Brain (round 6): an app map both engines read on demand, a new layer per effect, node graphs by default, time first (music when asked), Claude ⇄ Astra take over each other's task in the same chat and scene (`/task`) | [brain.md](brain.md) | 63 |
| **Total** | | **3,701** |

## Start here
- **Ctrl/⌘+;** opens the command bar over any tool (plain words work: "make it 9 by 16"); F1 = searchable help.
- Type `/` in any chat: **≈595 chat commands**, grouped by area; `/help <word>` filters them. `/do <anything>` runs any Ctrl+K action.
- **Token meter**: the pill in the rail (`/meter strip` for the full strip). **Dashboard**: click the pill, Ctrl+Shift+U or `/usage`.
- **Looks**: Settings → Appearance, Ctrl+Shift+L, `/appearance`, `/theme <name>`. Back to the old look: `/classic`.
- **Lab**: X = effects picker, Alt+N = Code ⇄ Nodes, F = Freeze (Focus moved to Shift+F), Shift+1…5 = frame sizes, T = Tap.
- **Astra with Claude**: the ⚇ chip in the composer, or `/duo`, `/relay`, `/debate`, `/council`, `/handoff`, `/compare-agents`.

## Behaviour changes worth knowing
- Forgeheart is bolder by default; Forgeheart Classic keeps the previous look (some layout polish applies to both).
- In the Lab, **F freezes** (Focus is Shift+F); right-clicking a timeline marker opens a menu (double-click still deletes).
- `/look` means the Lab's saved looks inside the Lab, the Appearance picker elsewhere; `/appearance` always opens the picker.
- The Three Director's tool guide now lives in its system prompt and rarer tools sit behind one `three_do` tool (lean mode).
  If its quality drops, `/director-mode full` restores the long version (more tokens).
- Directors build in node graphs by default since round 6 (you asked for it; `/nodes-director off` drops the ≈ 75
  tokens). Opt-ins that cost tokens stay off: `/director-mode full`, Astra's file access / talk-back tools /
  suggestions, `/astra-tools on`.
- Since round 6 a new effect is a new layer, scenes move on the timeline until you say "make it react", and
  `/director-engine` / `/handoff` in a director chat switch Claude ⇄ Astra in place (same chat and scene, `/task`).

## Not verified (nothing here could run them)
Real Claude Code / Codex CLIs (tested with faithful fakes), After Effects and AppleScript on a Mac, real claude.ai /
ChatGPT export files, the real Forgeheart build, and performance of the heavier shaders on a real GPU.
