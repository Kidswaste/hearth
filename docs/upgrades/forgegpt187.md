# forgegpt187: the Forgeheart chat's AI switch, Claude / ChatGPT (round 187)

The owner (23 Nov 2026): "allow my forgeheart tab to also use ChatGPT instead of just Claude".

## What was already there
`/director-engine astra` (director-cmds.js → `Astra.switchDirector`) switches any docked director in place: same chat,
`hubTools: true` so Codex gets the agent's tool sets over MCP (`gameTools` → `forge-game-mcp.js`), the previous
engine's model / effort kept in `otherEngine`, the task state handed over with the next message. The `game`,
`guide:gameTools` and `gamebrief` prompt parts and the compose hook (`[Forgeheart now: …]`) depend on `gameTools`,
not on the engine. Nothing in the Forgeheart window showed it; the Lab's switcher (director-switch.js) is `three` only.

## Shipped
- `director-dock.js`: for `toolId === 'forgeheart'`, a `.dd-engine` button at the left of the strip ("✳ Claude ▾" /
  "✧ ChatGPT ▾") opening a two-item menu; the same items in the ✦ menu ("Run this chat on"). `setEngine(engine)`
  checks `EngineHealth` for Codex first (missing / signed out: a toast with "Sign in", no switch), then runs
  `/director-engine`. `entry.setEngine` / `entry.engNow` are exposed for the check.
- `director.css`: `.dd-engine`.

## Not done
- Access: Codex is sandboxed (engines.js); `agent.noAsk` (round 186) only applies to Hearth's check for Claude.
  `astraNoSandbox` is not turned on by the switch: it stays the owner's warned opt-in.
- Not tried with the real Codex CLI: the check uses the fake engines.

## Checks
- `dev/checks/forgechat183.js`: the button shows Claude; `setEngine('codex')` → the docked agent is on codex with
  `hubTools` and `gameTools`, the button says ChatGPT, a composed message still carries the game's state; back to
  Claude restores the model.
