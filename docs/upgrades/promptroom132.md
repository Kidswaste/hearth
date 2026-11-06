# Prompt room: one line per tool, details in help (round 132, promptroom132)

Every message to the Three Director (and every tool step of its reply) re-sends a fixed part: the system prompt and the
definition of every tool. Rounds 128–131 (aiprep128 `three_brief`, looks129 `looks project`, songmap130 `map_song`,
perform131 `perform`, refmatch131 `references like`) filled the last of the room: the full director was at **9,225 of
9,225** tokens, the lean one at 2,159 of 2,170 and `three_do`'s description at 199 of 200. This stream measured where
the tokens go, cut what was said twice and moved option lists behind help (which the director already reads on demand).
No tool, command or arg is gone; the hub's handlers are untouched.

## Measured
`node dev/promptdiet-measure.js` (tokens ≈ characters / 4; the tool lists as the engines name them):

| Per message | before | after | saved | room under the old budget |
|---|---:|---:|---:|---:|
| **Three Director (full)** | 9,225 | **7,782** | −1,443 (16 %) | 1,443 |
| **Three Director (lean)** | 2,159 | **2,059** | −100 (5 %) | 111 |
| Three Director on Astra | 2,159 | 2,059 | −100 | 111 |
| 🔁 Keep going round | 2,189 | 2,089 | −100 | 111 |
| `three_do` (its definition) | 199 | **185** | −14 | 15 |
| Lab tool list, full (wire) | 4,019 | 2,591 | −1,428 | |
| Lab tool list, lean with three_nodes (wire) | 1,100 | 1,016 | −84 | |

Plain chats, Astra, Forge and mission helpers are unchanged (other servers).

### The full list, per tool (wire tokens: name + description + schema), the 10 fattest before
| Tool | before | after | what moved |
|---|---:|---:|---|
| three_screenshot | 190 | 77 | sizes / region / at / compare / frames / force in a few words (the lean words); `on`, `gap` → help screenshot |
| three_comp | 186 | 73 | op list + args → help comp |
| three_sequence | 178 | 84 | the op list past the common ones → help sequence |
| three_edit_code | 161 | 96 | the lean words; the long version → help edit_code |
| three_references | 156 | 73 | args → REFERENCES (in the guide full mode sends) + help references |
| three_add_layer | 155 | 88 | "alpha: true, no background" said once (the guide's SKETCH line) |
| three_model | 153 | 72 | op list → help model |
| three_motion | 145 | 79 | op list → help motion / help webcam |
| three_footage | 144 | 65 | action list → FOOTAGE + help footage |
| three_timeline_edit | 142 | 77 | the grid / markers / cues syntax → TIMELINE |

Before the change the full director's 9,225 tokens were: prompt 4,955 (the whole guide 4,632, of which the audio topic
927), Lab tools 4,019, chat tools 251. Descriptions were ≈ 60 % of the Lab list, schemas ≈ 40 %.

### Said twice (found and cut)
- **Full mode said everything twice**: it sends the whole guide (LAYERS, KEYFRAMES, TIMELINE, REFERENCES, NOTES, FRAME,
  FOOTAGE…) *and* tool descriptions that repeated those topics' option lists (update_layer's 11 blend modes and every
  setting, timeline_edit's grid / markers / cues syntax, animate's 12 presets, set_frame's sizes next to its enum).
  The descriptions now say what the tool does and name the topic in CAPS.
- **Full mode's everyday tools** had long descriptions that the lean list had already shortened (round 46) with the same
  args named in the words: full mode now sends the lean words for those 13 tools too.
- **Lean**: "Timing, keyframes, looks, notes, frame: three_do" (the core guide) repeated three_do's own groups;
  add_layer's "alpha: true, no background" and set_code's "new elements go in a new layer" repeated the core guide's
  SKETCH / ONE LAYER PER EFFECT lines; three_nodes spelled out a command syntax that help nodes gives in full.

## What moved where
| Detail | was in | now in |
|---|---|---|
| The 26 full-mode-only tools' option lists, examples and rare args | their descriptions / schemas | `three_help <tool>` (the old words, unchanged, + every arg), and the guide topic named in CAPS |
| Full mode's 13 everyday tools' long words | descriptions | the lean words (rare args named); the long words in `three_help <tool>` |
| `region` (screenshot), `to` (read_code), `time` (media_control), `full` (console) in the lean schema | schema | named in the description (the server passes every arg) |
| three_nodes' command syntax | description | help nodes (the app map's NODES topic) |
| three_do: "a cmd's args, guide topic or app", "last edit", "song as one picture" | description | the same commands and args, fewer words; help <cmd> unchanged |

`mcp/three-mcp.js`: a `SHORT` table (full mode) next to the existing `LEAN` table; `help()` still answers from the
original long definitions (`CORE_TOOLS` / `MORE_TOOLS` / `DO_HELP`), so every help text is byte-for-byte what it was.
`mcp/three-guide.js`: two shorter lines in CORE. Byte stability: every list and prompt is still made of constants
(`dev/promptdiet-test.js` measures twice; `dev/cache-test.js`; the new test loads the full list twice and compares).

## New budgets (≈ 2 % above the new size, so any growth shows)
| Where | before | now | measured |
|---|---:|---:|---:|
| `dev/promptdiet-test.js` directorFull | 9,225 | **7,940** | 7,782 |
| `dev/promptdiet-test.js` director / directorAstra | 2,170 | **2,100** | 2,059 |
| `dev/promptdiet-test.js` keepGoing | 2,200 | **2,130** | 2,089 |
| `dev/tokens-test.js` director / directorAstra (with sample memory) | 2,265 | **2,190** | 2,143 |
| `dev/tokens-test.js` directorBoard | 2,845 | **2,770** | 2,712 |
| `dev/director-mcp-test.js` lean list (no nodes) | 990 | **915** | 895 |
| `dev/director-mcp-test.js` three_do | 200 | **190** | 185 |
| `dev/director-mcp-test.js` three_nodes (chars) | 520 | **320** | 311 |
| `dev/promptroom132-test.js` full Lab list / lean Lab list with nodes (wire) | – | **2,900 / 1,040** | 2,591 / 1,016 |

**Headroom now**: the full director has ≈ 160 tokens under its new ceiling (1,443 under the old one); the lean one ≈ 40
(111 under the old one); three_do 5. A new feature that needs words in the fixed part should take them from here on
purpose and say so next to the budget (like aiprep128 did), or go behind `three_do` + help.

## Tests
- New `dev/promptroom132-test.js` (in the unit list): every `help <topic>` named in a tool description (lean, full, crew),
  in a three_do command's help line or in the guide is a real topic (17 found: filters, looks, references, triggers,
  sequence, comp, motion, webcam, model, footage, nodes, loop, react, audio, shader, perf, play), never the "Topics: …"
  fallback; every CAPS topic a full description names is a heading of the guide full mode sends; every full description
  is one line; `help <tool>` gives each tool's whole long description and every arg; the two list ceilings; byte-stable.
- Unit: promptdiet-test, tokens-test, director-mcp-test, directorlean-test, cache-test, tokenaudit-test, boot-test (2,952
  checks) pass; also sequence-test, directorfrugal-test, directorgame-test (they read three-mcp's help).
- Lab checks with the fake engines: labchat92, draft129, takes130, songmap130, critique130, refmatch131, perform131,
  looks129 (`node dev/run-checks.js --exact …`; group `promptroom132` runs them all): all pass. perform131 failed once
  in the batch on its full-screen step (`full: false`, `fps: -1`: the window didn't go full screen while other runs
  shared the machine; nothing to do with tool words) and passed alone right after.

## For the patch notes
- **Cheaper messages to the Lab's AI.** Every message to the Three Director now carries ≈ 100 fewer tokens in its
  everyday mode and ≈ 1,400 fewer (16 %) in "full" mode, at every step of a reply. Its tools say what they do in one
  line; the details are one help call away, and nothing it could do before is gone. This also leaves room for the next
  features without making messages heavier.

## For Codex
No Codex-owned file was touched (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch). Astra as the Three Director gets the same shorter lists automatically (−100 tokens a
message). If you add a Lab tool or three_do command, keep its description to one line and put the details in its help
line (`DO_HELP` / the tool's long entry in `MORE_TOOLS`): `dev/promptroom132-test.js` checks the topics you name exist.
