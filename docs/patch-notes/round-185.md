# Round 185: the Forge chat stops asking for its own game's folder
*November 2026*

## ⚒ Fewer permission cards in Forgeheart
- **Forge Debug no longer asks before reading, editing or running things in your game's folder.** It was only allowed
  a small folder inside Hearth, while Forgeheart lives in your Documents: so almost everything it did there showed a
  card (more than 300 of them in your log).
- The next time Hearth starts, the game's project folder (the one holding `outputs` and `work`) is added to the
  folders Forge Debug may use. A note says so.
- **It still asks before**: pushing to GitHub, deleting something for good, installing software, and reaching the
  network. Those are the cards worth having.
- To change it: ⋯ AI setup › Files on this computer. If you take the folder out there, Hearth does not add it back.
