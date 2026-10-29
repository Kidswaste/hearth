# Round 86: long chats stay light, projects switch smoothly
*October 2026*

## 💬 Long chats keep their older part on disk
- **Very long chats are much lighter now.** A chat with thousands of messages keeps only its newest part ready. Older
  messages stay on disk and load the moment you scroll up to them. In a 6,000-message test chat, Hearth's memory for
  that chat dropped from about 60 MB to about 5 MB.
- Finding a word in such a chat, editing an older message of yours, and a change arriving from your other computer no
  longer make the app hitch (they used to freeze it for about 0.15–0.2 s).
- Reacting to, pinning or quoting an old message, jumping to a message number and "Show all" still work: the part you
  need loads first. Exporting, branching or summarizing a very long chat briefly says "Loading the whole chat…".
- Nothing is ever treated as missing. If an older part can't be read at that moment, Hearth says so and changes
  nothing. Saving, sync, export and summaries always use the whole chat.
- You can switch it off in **Settings › Chats › "Keep only the newest part of very long chats in memory"**.

## 📁 Projects open and switch smoothly
- **Switching projects** with the name ▾ is smoother. The loading card appears at once, and the project's chat shows
  about twice as fast (in about a tenth of a second) while its scene is still starting.
- **Importing a project file** and **⧉ Duplicate project** no longer make Hearth stutter for a moment while they add
  the project's scenes.
- **The Lab's first start** and **Hearth's start** are smoother: the Lab now gets ready in several small steps instead
  of one long one.
- The export window's sizes for projects with many files from your other computer are now worked out without pausing
  the app.
- Duplicating a project that holds a very long chat does less work in the background.
- Nothing changes in what you get: the same scenes, chats, Desk and project files.
