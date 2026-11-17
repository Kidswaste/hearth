# Round 184: all your Claude chats on Fable 5.2
*November 2026*

## 🤖 One model for every chat
- **The first time this version starts, all your Claude chats switch to Fable 5.2** (`claude-fable-5-2`), as you
  asked. Your Claude agents (Claude, Forge Debug, Three Director) get it as their default, so new chats use it too,
  and any chat that had its own model follows that default again. A note says how many were changed, with **Undo**.
- It happens once. A model you pick afterwards, for a chat or an agent, stays.
- Astra and its chats are not touched: they run on another engine.
- **`/model-all <model>`** does the same any time, for any Claude model (`/model-all opus`, `/model-all
  claude-fable-5-2`). **`/model-all undo`** puts back what every agent and chat used before.

## Good to know
- A chat in the middle of a long conversation carries on with the new model from its next message.
- Fable 5.2 costs more per message than Opus: your usage meter will show it.
