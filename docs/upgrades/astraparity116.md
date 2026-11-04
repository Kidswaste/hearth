# Round 116 — astraparity116: Astra gets the same Hearth as Claude

The owner: many things don't work as expected because Astra is "incredibly limited" or acts differently from Claude
when asked for the same result, and seems to understand Hearth less well.

The main cause was real: **Hearth's prompt replaced Codex's own base instructions.** Codex's base instructions are what
teach it its tools (shell, `apply_patch`, the plan tool), how to edit files, how to work step by step and how to format
an answer. `codexArgs` sent `-c model_instructions_file=<Hearth prompt>` and the app-server path sent
`thread.baseInstructions: buildPrompt(…)` (and copied the same `-c model_instructions_file` onto its command line too).
Claude's `--system-prompt` also replaces Claude Code's default, but Claude's tool descriptions travel in the tool list, so
it never lost that knowledge; Codex did.

No Codex binary is installed here and Astra can't be signed in, so the comparison is static (both engines' launch
plans built from `engines.js` `_test`), in one check: `dev/astraparity116-test.js`.

## What changed

- **Codex keeps its base instructions.** Hearth's prompt now goes in as developer instructions:
  `-c developer_instructions=<prompt>` for `codex exec`, `thread.developerInstructions` for the app-server (the default
  transport; no `baseInstructions`, so the model's own are used). The prompt is no longer on the app-server command line.
- **Clean fallbacks to the old way** (Hearth's prompt as base instructions): a Codex copy known to be older than 0.60.0
  (an older Codex ignores the key, so the prompt would be lost silently); `codex exec` with a prompt over 20,000
  characters (Windows caps a whole command line at 32,767); an app-server that refuses `developerInstructions`
  (`codex-server.js` retries once with `threadLegacy`); `HEARTH_CODEX_PROMPT=base` (an escape hatch for the owner).
- **Astra's role line says where it is**: "You are Astra, in the user's desktop app (Hearth). Be concise; answer
  directly; Markdown when it helps." (was "a practical collaborator… Use tools for requested work", which never said it
  runs inside Hearth). An undocked Astra with the Lab's tools had no "You are…" line at all; it has one now.
- **Working on Hearth's own code** (a chat's folder holds Hearth's source: `engines.js` + `mcp/hearth-map.js`): both
  engines get one short fixed map of the codebase (prompt part `hearthCode`, ≈ 180 tokens, only then). Chats in the
  owner's other folders get nothing extra; no file is read into the prompt.
- **The chat's own engine decides** in the switcher's chats (a Claude director's chat made for Astra, or the reverse):
  `/director-engine`, `/handoff` in a director, "Ask … instead", the attachment line, the answer-length label and the
  Lab history / undo labels.

## Differences found

Same agent setups (plain chat, Three Director, a chat on Hearth's code), Claude vs Astra.

| # | Claude | Astra (before) | Cause | Now | Why |
|---|---|---|---|---|---|
| 1 | Claude Code's tool knowledge stays (tool list) | Codex's base instructions **replaced** by Hearth's prompt: no shell / `apply_patch` / plan guidance | `model_instructions_file`, `baseInstructions` | **Fixed**: developer instructions, base kept | the main cause of "limited" |
| 2 | — | app-server also got `-c model_instructions_file` on its command line | args copied from `codexArgs` | **Fixed**: prompt only in the thread's fields | one channel, no long command line |
| 3 | "You are X, in the user's desktop app…; Markdown when it helps" | "You are X, a practical collaborator…" (no Hearth, no Markdown) | thinner role line | **Fixed**: says Hearth + Markdown | it didn't know where it ran |
| 4 | undocked with Lab tools: "You are X, the Three Director…" | only "When the user asks for Three.js Lab work, act as their visual director." | `leanDirector` drops the role part | **Fixed**: "You are X in the user's desktop app (Hearth); when…" | no identity at all |
| 5 | no Hearth codebase map | no Hearth codebase map; `project_doc_max_bytes=0` | — | **Added for both**, only on Hearth's code | "knows its own wrapper" |
| 6 | reads no CLAUDE.md (cwd = Hearth's workspace) | reads no AGENTS.md (`project_doc_max_bytes=0`) | — | **Kept** | same on both; the owner's global AGENTS.md stays out |
| 7 | chat tools (chat_ask, chat_do, chat_progress…) on a plain chat | chat_open alone (`openTool`) | chat tools opt-in on Astra | **Kept** (named in the check) | each tool definition rides on every Codex request; /astra-tools turns them on |
| 8 | `<suggest>` next-step buttons on by default | off unless `/astra-suggest on` | comes with the chat tools | **Kept** (named) | follows #7 |
| 9 | `access` MCP server (permission tool asks the owner) | none | Codex can't ask; its sandbox decides | **Kept** (named) | engine limit |
| 10 | file tools Read / Edit / Write / Glob / Grep | shell + `apply_patch` in a sandbox | each engine's own tools | **Kept** (worded per engine) | same meaning, own tools |
| 11 | answer-length line in the prompt | `model_verbosity` flag | Codex has its own knob | **Kept** | no prompt bytes on Astra |
| 12 | no web line | web line when web search is on | Claude has no web tool here | **Kept** | engine feature |
| 13 | Three Director: tools, servers, prompt | identical (with `hubTools`) | — | — | checked byte for byte |
| 14 | hub MCP servers send no instructions | same | guides live in the prompt | — | nothing dropped on either side |
| 15 | `/director-engine claude` in the switcher's Astra chat of a Claude director | answered "already runs on Claude", did nothing | read `d.engine`, not `chat.engine` | **Fixed** (astra.js, director-cmds.js) | that chat switches; the director's other chats stay |
| 16 | "Ask Astra instead" from Claude's busy chat | in the switcher's Astra chat: offered Astra again | `otherOf(agent)` | **Fixed** (offline.js) | the other AI of the chat's engine |
| 17 | attachments: "open them with your Read tool" | told "Read tool" in a switcher Astra chat | `H.agent(id).engine` | **Fixed** (native.js, attachlean.js) | wrong tool named in the prompt |
| 18 | answer-length label, Lab undo / history "by Claude/Astra" | labelled by the director's engine | same | **Fixed** (concise.js, tools/three-history.js, tools/three-txn.js) | the label said the wrong AI |

Not changed: the many `engine === 'codex'` branches that describe an agent itself (settings rows, agent lists, the
Astra tools button, the doctor) — those are about the agent, not a chat. `director-switch.js` already used the chat's
engine.

### Budgets (item 5 of the brief)

Codex's own base instructions are not Hearth's and were never counted (`dev/tokens-test.js` header), so keeping them
changes no budget. The new Astra role line is shorter than the old one (plain Astra 79 prompt tokens in promptdiet),
so no budget moved. The real per-message input to Codex grows by its base instructions, mostly served from its prompt
cache; that is the tool knowledge the owner was missing, and it is not stripped.

## Tests run

- `node dev/astraparity116-test.js` (new, in UNIT): 5 groups — Codex keeps its base instructions on both transports;
  the fallbacks; the same tools, servers, parts and guides except the named list (`set:chatTools`, `set:openTool`,
  `part:suggest`, `server:access`); the Three Director byte-identical; the Hearth-code map only on Hearth's code; the
  chat-engine cases (`switchDirector` and "Ask … instead" run from their own source in a VM, `runAgent`, the rest by line).
- `flock /tmp/hearth-run.lock timeout 1800 node dev/run-checks.js --exact unit:astraparity116-test unit:astra-engine-test
  unit:tokens-test unit:promptdiet-test unit:tokenaudit-test unit:directorlean-test unit:access-test
  unit:robust-engine-test unit:cache-test unit:concise-test unit:attachlean-test unit:offline-test`: 12/12.
- `node dev/codex-server-test.js`: 14 groups (the app-server adapter, after the fallback edit).
- `node dev/boot-test.js`: 3124 checks.
- Updated for the new channel: `dev/astra-engine-test.js` (persona run → developer instructions),
  `dev/fake-codex.js` (reads `developer_instructions`, else the file), `dev/checks/astra-ui.js` (same; not run here).

Not run: Astra live (no Codex here, no sign-in). The 0.60.0 cut-off for `developer_instructions` is conservative; a
Codex that refused the app-server field falls back by itself, and `HEARTH_CODEX_PROMPT=base` restores the old way.

## For the patch notes

- Astra (ChatGPT / Codex) now keeps its own built-in know-how: how to use its tools, edit files and plan its work.
  Before, Hearth's instructions replaced it, which is why Astra often seemed more limited than Claude for the same ask.
- Astra now knows it is running inside Hearth, like Claude.
- When you let an AI work on Hearth's own code, both Claude and Astra get a short map of how Hearth is built.
- In the Three Director, a chat you opened for the other AI with the ◆ switcher now stays that AI: `/director-engine`,
  "Ask … instead" and the history labels follow that chat, not the director's usual AI.

## For Codex

Minimal edits in Codex-owned files, each marked `// (round 116, astraparity116)`:

- `astra.js`: `chatEngine(d)` (exported on `Astra`); `switchDirector` switches a chat that carries `chat.engine` (deleting
  it when it goes back to the director's engine) instead of the director; `handoff()` and the `director-engine`
  command read `chatEngine`.
- `codex-server.js`: `run()` accepts `threadLegacy`; when `thread/start` / `thread/resume` fails naming
  `developerInstructions` (or an unknown field), it retries once with `threadLegacy` (Hearth's prompt as
  `baseInstructions`). Nothing else changed.
- `engines.js` (shared): `codexServerPlan` returns `thread` with `developerInstructions` (no `baseInstructions`) plus
  `threadLegacy`, and strips `developer_instructions` / `model_instructions_file` from the server's `-c` list.
  If you touch thread params, keep `baseInstructions` out of `thread` unless `codexDevOk()` is false.

## Owner try-list

In the Three Director, ask the same thing on Claude, then switch with the **◆ Claude ▾** pill to Astra (Fresh chat on
the same scene) and ask again:

1. "Add a slow orbiting ring of 40 small glowing spheres as a new layer, with sliders for speed and count, then check
   it with a screenshot." — both should build a separate layer with `tweak()` sliders and look before saying done.
2. "What's in this scene right now and what would you improve first?" — both should read the scene (outline / task)
   before answering, and suggest one concrete next step.
3. "Make the camera push in slowly over 8 seconds, keyframed, no music reaction." — both should use keyframes on the
   timeline rather than code that reads the song.
4. In the Astra chat, type `/director-engine claude`: it should say this chat now runs on Claude (it used to say
   "already runs on Claude" and do nothing).
