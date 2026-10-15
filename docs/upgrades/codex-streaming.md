# Persistent Codex streaming

Codex replies now use a private `codex app-server --listen stdio://` process per Hearth chat. Text arrives through `item/agentMessage/delta`, rather than relying on whole-message updates from `codex exec --json`. Claude's transport is unchanged.

The second and subsequent turns reuse the connection and loaded thread. Connections expire after five idle minutes. Each chat keeps its own server because Hearth's MCP tools carry a chat ID, tool permissions and agent identity. Tool/configuration changes rebuild that chat's connection and resume its saved thread. One-off calls close their connection after completing.

Stop sends `turn/interrupt`; the next turn can reuse the connection. Quitting Hearth closes both active and idle servers and their helper processes. A crashed connection fails the current turn and preserves any partial answer. It never automatically repeats work that might have edited files. The next user turn can resume the saved session. A genuinely missing session starts a new one only when Hearth supplied its existing conversation fallback.

## Timing

Codex replies display a small “First text … · total …” label. Hover for connection reuse, setup, first engine activity, first text from the engine, first text received by the chat, first text rendered, and total time. Timing is saved on the message as `timing`; backend timings are also written to `data/engine.log` without prompt text or credentials.

- Backend times are monotonic milliseconds from entry to the app-server adapter. Setup includes process launch, handshake and thread start/resume. On a warm connection it can be zero.
- UI times start at Hearth's existing pending-message timestamp. They include any pre-send work and IPC buffering.
- First rendered text measures completion of the first DOM text update, not the OS compositor. It can be null for a background chat that was not rendered during the turn.
- No text is recorded as null, not as an artificially fast zero. Interrupted and failed turns retain their timing data where there is a saved message/error.

## Configuration and compatibility

Model, effort, prompt, images, web search, enabled Hearth/external MCP tools, file access and the owner's explicit Windows sandbox opt-in are carried through the existing configuration builder. Read-only access stays read-only; workspace writes keep the selected roots and network restriction. Unselected inherited MCP servers are disabled on the thread, including servers added by the desktop configuration. An unexpected native permission request is declined, not auto-approved; existing Hearth `chat_ask`/access tools remain available where enabled.

App-server does not accept exec's `--ignore-user-config` or `--ignore-rules`. Hearth explicitly supplies its prompt and permission/tool settings instead; installed enterprise/exec policy may still impose restrictions. Native app-server approval cards and elicitation forms are not implemented in this change. They are declined with a visible explanation rather than left hanging. In-app Hearth tools continue to own their existing question cards.

The installed `codex-cli 0.162.0-alpha.17.2` was checked using its generated JSON schema and a real signed-in smoke test. Older incompatible versions fail visibly; there is no silent transport fallback. For an explicit rollback, set `codexTransport: "exec"` on the affected agent, or start Hearth with `HEARTH_CODEX_TRANSPORT=exec`. The old transport remains covered by its original test suite.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## Validation on 15 October 2026

- `node dev/codex-server-test.js`: 11 groups covering incremental delivery before completion, UTF-8 boundaries, final-text deduplication, timings, warm reuse, tool events, usage, independent chats, stale notifications, Stop, crashes, resume, missing sessions, permission refusal, invalid JSON, RPC timeouts, duplicate requests, idle cleanup and the actual `engines.send` adapter. A declined tool call remains a visible warning without prematurely ending the UI turn; declined file edits are reported as failed. All fixture data is in temporary directories.
- `node dev/codex-server-smoke.js --live`: real account, three small requests, ephemeral threads, no file tools. The first reply arrived in 59 deltas (first text 2,399 ms; total 3,283 ms). The follow-up reused the process/thread, recalled the preceding answer, and produced first text in 1,604 ms (total 1,650 ms). A third request successfully called a read-only MCP fixture and returned its static note. These are smoke measurements, not a controlled comparison or a promise about task duration.
- `node dev/astra-engine-test.js`: 27 checks passed for the retained exec/Claude paths.
- `node dev/connections-test.js`: 7 checks passed.
- `node dev/streamrender-test.js`: 9,912 live render comparisons passed.
- Syntax and whitespace checks passed for changed JavaScript.

Existing test limitations were also reproduced using the unchanged starting commit `0377f2b`: `access-test.js` fails a prompt-length assertion (296 / 430); `liveness-test.js` expects a killed-process wording that differs on Windows (`Claude Code exited (1)`) and its measurement mode also encountered a temporary-directory cleanup error; `robust-engine-test.js` stalls in its fake update/recheck step (baseline stopped after 20 seconds, branch run stopped after several minutes). None is claimed as a passing suite. The new server-specific tests cover cancellation, crashes and permission preservation independently.

## Handoff

Implemented on `codex/persistent-app-server` in a separate Git worktree. No edits were made to the working files, saved chats, scenes, or config in the original `C:\Users\quent\agent-hub` checkout. The normal Hearth shortcut still runs that original checkout; this branch must be reviewed and merged/cherry-picked there before the normal app uses the new transport. Do not launch a second copy against the same live data while another copy is running.
