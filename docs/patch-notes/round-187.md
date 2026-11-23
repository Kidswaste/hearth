# Round 187: the Forgeheart chat can run on ChatGPT
*November 2026*

## ⚒ Claude or ChatGPT in the Forgeheart window
- The chat in the Forgeheart window has a new button at the left of its strip: **✳ Claude ▾**. Click it and pick
  **✧ ChatGPT (Codex)** to run the same chat on ChatGPT, or Claude to come back. The same choice is in the ✦ menu
  ("Run this chat on").
- It is the same chat with the same game: ChatGPT gets the game's tools (spawn, stage, screenshots, the design
  notes), what the chat knows about Forgeheart, and the live game's state with each message. Your next message hands
  over what was being worked on.
- Coming back to Claude puts it on the model it had (Fable 5.2).
- If ChatGPT is signed out or Codex isn't installed, the button says so instead of switching.
- Hearth calls ChatGPT's engine "Astra" elsewhere: `/director-engine astra` in that chat does the same thing.

## Good to know
- **Files and commands work differently on ChatGPT.** It runs in its own sandbox: on Windows that sandbox can block
  commands, and it has no network, so it can't push to GitHub. "Work without asking" (round 186) is Claude's. If a
  command is blocked, the note in the chat offers "Run without its sandbox…".
