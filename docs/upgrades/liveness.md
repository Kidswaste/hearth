# Liveness (round 21): long tasks that say what they are doing

You said complex tasks seem to freeze chats after a while, don't tell you what they are doing, and that you'd like to
see when they deploy agents (they sometimes should for three.js), where their thinking is, and whether they are bugged.

## Why long tasks looked frozen (root causes, measured)
Measured with the fake engines' new long scenarios (`dev/fake-liveness.js`), before → after on the same machine:

| Cause | Where | Before | After |
|---|---|---:|---:|
| The whole thinking text was written again on every paint (a long think: hundreds of KB laid out ≈ 16× a second). The cost grew with every word, so a long task got slower and slower | `native.js` paint | 1.6–1.9 s of layout in a 4 s task (300 tools, 400 KB thinking) | 0.14–0.39 s |
| A huge tool result (a whole file, a big log) on one JSON line: searched again from its start for every 64 KB piece, copied, then parsed whole | `engines.js` stream reader | main process blocked 722 ms, 4.9 s to get through 24 MB | 47 ms, 0.2 s |
| One IPC message and one renderer handler call per streamed piece | `engines.js` → renderer | 3,480 messages for a 150-tool task | 184 |
| An engine that exited while a program it started (a tool, a helper) still held its output open: the reply never ended | `engines.js` close handling | waited forever (the 50 min idle stop doesn't fire either: the engine was already gone) | ends in 2 s with the engine's error |
| An engine killed from outside (out of memory, force quit) was shown as "stopped", as if you had pressed Stop | `engines.js` | "stopped", no reason | a clear error, the partial reply kept |
| A subagent's own streamed text was mixed into the main reply, and only the first of several parallel tool calls was seen | `engines.js` Claude parser | leaked; 7 of 8 tools | kept apart; every call |

The engines themselves can still go quiet for minutes (a long render, a tool waiting, a model thinking): that is now
shown truthfully instead of looking like a freeze (below).

## Upgrades

### What a running reply shows
1. **A status line that names the phase**: Thinking · Writing · Running *three screenshot* on *frames: 12* · *2 agents working* · Waiting for the next step, with the time, words, steps and agents (under every running reply).
2. **"last news N s ago"** once the engine has been quiet 5 s, and from 15 s **why**: "may still be working on three screenshot · CPU 85%", "process alive but idle", or "the engine process is gone".
3. **No news for 2 min** turns the line amber with **Wait** (asks again in 2 min) · **Stop** · **Stop & retry from here**. No Nudge: Claude Code and Codex read nothing once a run started, so Hearth never pretends to.
4. **Stop & retry from here**: stops, keeps what it wrote, and sends one short line ("Continue from where you stopped (it seemed stuck on three eval: try another way if it hangs again)"). Also `/unstick`.
5. **Pulses from the engine side**: after 15 s without a line, every 10 s Hearth checks the engine process is alive and how busy it and the programs it started are (CPU %, Mac and Linux; alive only on Windows), and which tool it is in.
6. **A dead engine never hangs the chat**: killed → "stopped unexpectedly (SIGKILL)…" with the partial reply kept; exited while a helper held its output → ends in 2 s with the engine's own error.
7. **Activity panel** (folded "Activity · 99 steps · 2 failed" line above the reply): the last 60 steps live, each tool call with its short args, its result and its time; failed ones in red; thinking notes (the first words of each thinking block). It stays open for the next replies once you open it.
8. **Steps from both engines**: Claude's tool results and Codex's tool / command results come back as ✓ / ✕ with a one-line summary.
9. **Short args for every tool call**: the file, pattern, command, layer or code it works on.
10. **The engine's own notes** (Claude's API retries) show in the status line.
11. **Right-click the live status, the activity or the agents**: What is it doing? · Wait · Stop · Stop & retry from here.

### Agents (subagents)
12. **Deployed agents show live as a small tree** under the reply: each agent's description, ◌ running / ✓ done / ✕ failed, its current tool, its time, its step count, and its result when it ends.
13. **Click an agent** for its own last steps (they sit under it, never in the reply's steps).
14. **Claude's Task / Agent subagents** are read from stream-json (`parent_tool_use_id`, newer `task_*` system lines too); parallel calls in one message all count.
15. **Codex's spawned agents** (multi-agent `collab_tool_call` items: spawn / wait states) show the same way.
16. **A subagent's own text never streams into the reply** (it did).
17. **"🤖 Deployed 3 agents · 2 done · 1 failed"** stays on the finished reply; click it for each agent's result and time.
18. **The reply keeps its activity** (steps, failures, agents) for `/activity` and the fold, a few hundred bytes.
19. **`/subagents on|off`**: lets this chat deploy agents (Claude gets its Task tool, Codex its multi-agent feature). Off by default, because it adds a tool to every message of that chat (token frugality).

### Smoother long tasks
20. **Thinking is appended in paragraph blocks**, and blocks out of view skip layout (`content-visibility`): a long think no longer slows the chat down as it grows.
21. **Folded thinking isn't written at all** until you open it.
22. **Words in the status line are counted every 2 s** (the whole reply was scanned twice a second).
23. **Streamed pieces are batched** (40 ms) before they cross to the window: 19× fewer messages on a long task.
24. **Huge tool results don't block Hearth**: lines over 512 KB are read from their ends, not parsed whole.
25. **Characters split between two pieces of output** (accents, emoji, CJK) no longer come out garbled.
26. **An oversized line is skipped cleanly** up to its end, instead of its tail being read as the next line.
27. **Jams, collaborations and quick asks never see the new activity events** (their own channel), so nothing that waited for a reply's end can end early.

### Commands
28. **`/activity`**: what the running reply is doing (phase, last news, agents, last 8 steps), or what the last reply did.
29. **`/subagents [on|off]`** (above).
30. **`/unstick`** (above).

## For testing (no upgrade count)
- `dev/fake-liveness.js`: the fake engines answer `subagents`, `marathon[:N]`, `hugeout[:MB]`, `longthink[:KB]`, `quiet[:S]`, `busyquiet[:S]`, `hang`, `die`, `orphan` with real-shaped stream-json / exec-json lines.
- `node dev/liveness-test.js` (unit, 8 checks; `--engines <old engines.js> --measure` gives the before numbers).
- `dev/checks/liveness-ui.js` (the UI driven like a user, 20 expectations) and `dev/checks/liveness-perf.js` (the numbers above). `sh dev/run-checks.sh liveness`.

Upgrades: 30.
