# Round 119: your data folder locked, a lighter start
*November 2026*

## 🔒 Your data folder is off limits
- When you give a chat access to Hearth's own folder so it can improve Hearth, it can no longer change Hearth's data
  folder (your chats, settings, memory and keys), with Claude or with Astra. Claude can't read it either. The AI is
  told so in one plain line; you get no card to answer, it is simply refused.
- Hearth's code stays editable as before, and your normal project folders are not affected.
- Limits, honestly: Astra can still *read* that folder (its own safety box can't hide one folder), and a program an AI
  runs could still write where it likes: Hearth checks the commands, not what the programs do. If Astra can't make a
  small change to Hearth's code after this update, tell us.

## ⚡ A lighter start
- The token meter's chat commands (/usage, /budget, /stats…) load just after start instead of with it: 21 KB less to
  load before the first screen. The meter itself, /tokens and /context work exactly as before.
