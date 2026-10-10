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
| Cut (round 6): clip track in Video Review (E): split S, delete / ripple delete, trim with beat snapping, reorder, speed, fades, freeze frames, title cards, auto-cut on bars / drops (as a suggestion), gapless playback, export as the next version / socials / GIF / stills; song trim and /send-clip in the Lab | [cut.md](cut.md) | 93 |
| Live (round 6): director edits no longer blank the Lab (it was pushed behind the window during every call), only changed layers re-run, scene switches and jam rounds stay in the page, new / changed / removed layers fade in place, unavoidable reloads cross-fade from a picture, a "building…" pill | [live.md](live.md) | 26 |
| Declutter (round 7): hold Alt for tucked buttons, Ctrl for key badges, the keys button bottom left, right-click menus with › submenus everywhere, Customise this… (pin / tuck any button), 183 → 138 visible controls | [declutter.md](declutter.md) | 548 |
| Mood board (round 7): ▦ Board, references that give chats a vibe (never the footage), drawer over any chat (Ctrl+Shift+M), `/board-use`, `/ref`, `/vibe`, opt-in board tools for Claude / Astra | [board.md](board.md) | 1,309 |
| Capture (round 7): Hearth screenshots and records itself (◉ Capture in the rail ⋯ menu, `/shot`, `/record`), hands-free scripted tours for an intro video (`/tour`), exact frame reading of any video for you and the chats (`/frames`, contact sheets, scenes, pacing), `/make` GIF / trims / social copies, opt-in capture tools for Claude / Astra | [capture.md](capture.md) | 668 |
| Editor (round 7): the Video Review timeline is a whole video editor for any footage (E / ✂): exact frame stepping (←/→, J/K/L, timecode), video / overlay / text / sound tracks, roll / slip / slide, keyframes with easing, 131 transitions, 197 looks, titles and lower thirds, 70 shapes / motion graphics, 48 templates (social intros), ffmpeg render; chats read and edit it (`video_edit*` tools, `/editor`, `/add-title`, `/transition`…) | [editor.md](editor.md) | 1389 |
| Polish 8 (round 8): the board, the editor and capture in one menu shape (main action → arrange → look → send / export → More… → Delete → Customise this…), the app's SVG icons instead of emoji, the drawer / editor bar tidied behind Alt, right-click on chips and the editor bar, the keys sheet lists the editor and capture (with icons), Forgeheart look on every new surface, the editor's monitor no longer shows over other tools, `/tidy` | [polish8.md](polish8.md) | 244 |
| Video projects (round 8): `/intro` plans your social intro (beats, length, 9:16 · 16:9 · 1:1), then board vibe → Claude ⇄ Astra Lab scenes → capture tours → editor → frame-exact review → every format, one live card, undo per step, redo a beat, 15 s / 6 s cuts | [intro.md](intro.md) | 401 |
| Lab frames (round 8): the Lab timeline frame by frame on video footage with no song (timecode counter, exact steps, J K L), cuts the sketch plays (shared with the editor), sketches read the exact frame, 21 footage layers, reference pacing (`/footage`, `/match-pacing`) | [labframes.md](labframes.md) | 284 |
| QA 8 (round 8): integration fixes between board / editor / capture / declutter, key conflict table, three new end-to-end journeys (board, editor, capture), every key pressed on its surface, ⌘ on a Mac, one check runner | [qa8.md](qa8.md) | 75 |
| Lab sequence (round 8): ▤ Sequence on the Lab timeline (`/sequence`) builds a video from your scenes, chat scenes, looks, footage, titles, overlays and the song; it plays in the preview without reloads, frame-exact, the editor's keys and transitions, finishes in the video editor and comes back, renders frame by frame in every social format; Claude / Astra build it with `three_do sequence` | [sequence.md](sequence.md) | 101 |
| Robust (round 9): your real Claude Code / Codex installs known up front (every copy, the newest working one used, too old / signed out noticed), one calm notice with a one-click fix in a visible Terminal / PowerShell window, runs that heal themselves (too old → newer copy, MCP file, Codex cancelling tools, network), `/doctor` for both engines, the black Lab preview after `/director-engine astra` fixed | [robust.md](robust.md) | 35 |
| Chats at the core (round 9): what a reply makes shows inside it as cards (captures, Lab frames, renders, board items, scenes, sequences, projects; videos play on hover and scrub frame by frame; drag to the board / editor / a chat), ＋ attaches from anywhere (board, captures, Lab, screen, renders; `/attach-…`), a short `/` menu by area (the Lab first in the Lab), a chat remembers its board / scene / sequence / project ("use the board", "render it again" just work, carried over on handoff), tool calls folded, right-click on every message part | [chatcore.md](chatcore.md) | 90 |
| Lab sequence 2 (round 9): each scene (each director chat's scene) owns its sequence and switching chats switches it; ✦ Arrange lays your scenes on the song's sections (cuts on bars, a transition per section change, a new look when a scene comes back; 10 templates, Astra can pick; 15 s / 6 s versions; fill a gap); 10 Lab-only transitions (camera fly-through, morph through shared layers, depth wipe, datamosh, match cut, flash on the beat…) also in the editor; V variations per clip, roll / slide, nested sequences, clipboard across sequences, markers, clip pictures, waveform; clip-relative hits, footage sound in real-time takes, a tested editor export (`/arrange`, `/sequence make`) | [seq2.md](seq2.md) | 93 |
| Motion design kit (round 9): X → Motion / Alt+X in the Lab — Put Hearth on screen (captures or Hearth drawn as 3D screens, laptop / phone / browser frames, parallax, explode, UI elements, a clicking cursor), 33 kinetic-type animations fitted to the safe zone, 23 camera moves (a rig or the whole picture, rack focus, whip pan), flame / anvil logo reveals, brand looks, end cards; each one node, time-driven, in the Lab sequence; `/motion-kit`, `/kinetic`, `/camera-move`, `three_do motion` | [motion.md](motion.md) | 176 |
| The orb (round 10): a new chat's scene is a glowing orb built as node graphs (Backdrop + Orb layers, every knob a slider) in the chat's color, not hooked to music; every scene has one clock — its song, else its own frame-exact timeline (10 s, keyframes already on it); a song loaded on it keeps keyframes / cues at their seconds (✦ snap to bars), taking it out brings the scene's timeline back; scene, timeline and sequence switch together; `/scene-timeline`, `timeline_edit { length, snapToBars }` | [orb.md](orb.md) | 52 |
| Sync (round 10): your Mac and PC share one Hearth through the cloud drive you already use (iCloud Drive, Google Drive, Dropbox, OneDrive): found and turned on in one click, "Use this Hearth" on the second computer; local first and offline-proof; chats, scenes, boards, projects, notes, memory, settings, captures and renders merge (messages from both computers kept, field-level merges, true conflicts keep both); synced trash, resumable big videos, paths fixed between Mac and Windows; a calm dot with a menu, `/sync status` | [sync.md](sync.md) | 75 |
| **Total** | | **9,267** |

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
