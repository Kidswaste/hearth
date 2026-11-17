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

## 🎯 Every message, not just the long ones
- **Short questions now stay on Fable 5.2 too.** "Smart" (how hard an AI thinks) was sending short or chatty
  messages to a lighter model: you asked the Forge chat "are you Claude Fable?" and Sonnet answered. For your Claude
  AIs, Smart now only chooses how hard to think, never a lighter model. This is applied by itself the next time
  Hearth starts.
- `/keep-model on` or `off` sets this for one AI. `/model-all` turns it on, and its undo turns it off again.

## Good to know
- A chat in the middle of a long conversation carries on with the new model from its next message.
- Fable 5.2 costs more per message than Opus: your usage meter will show it.
