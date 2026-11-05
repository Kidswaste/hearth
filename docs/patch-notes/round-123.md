# Round 123: checks that catch what matters
*November 2026*

## 🧪 Behind the scenes
- Half of Hearth's app checks were run again one by one. Sixteen of them were out of date since chats started living
  in projects (they started chats outside a project, so the "Which project?" question covered what they clicked);
  they are fixed. Nothing in the app had to change for them.
- A set of 20 checks that guard what matters most (chats, projects, sync, access, your data's safety, start-up and
  the Lab opening) now runs before every update, so a breakage like round 116's is caught at once.
- Found and noted for the next rounds: a new chat's row can vanish for about a second after its first message, and
  the chats search no longer offers "Search inside messages".
