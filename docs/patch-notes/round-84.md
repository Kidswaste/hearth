# Round 84: a quieter graphics card, smooth giant chats
*October 2026*

## 🎛 A quieter graphics card
- On a fast screen (like a 240 Hz one) several parts of Hearth drew
  up to 240 pictures a second, which can keep the graphics card busy enough to make sound crackle in other apps. They now
  draw only as often as you can see a difference:
  - the shader node editor's live preview: 60 a second (30 when you're in another app, 10 when paused, none when it
    isn't on screen);
  - the moving previews in the Lab's text, visualizer and shape pickers: 30 a second;
  - the Lab's Shader playground and Model viewer: 60 a second;
  - the Easing tool's moving dot: 60 a second, and it stops when you can't see it.
- **Hearth rests while you work in another app.** Five seconds after you switch to your DAW or Spotify, Hearth's
  spinning and pulsing bits freeze where they are. Move the mouse over Hearth or click back into it and they move again
  at once.
- **A minimized game or Stage window rests.** Minimize a game you're playing with ▶ Play, or the Stage window, and it
  stops drawing until you bring it back.
- **Fixed: the Lab's Shader playground and Model viewer were blank.** They show their picture again.

## 💬 Giant chats open without a freeze
- Opening a very long chat (thousands of messages) no longer freezes Hearth for a moment: it now arrives in small pieces,
  the newest messages first, while the app keeps answering your clicks. The older parts of a long chat already stayed
  "asleep" until you scroll up to them; now loading them doesn't stall anything either.
- Exporting a very long chat (to a file or the clipboard, as JSON, Markdown, text or a web page) no longer freezes the
  app. The file is exactly the same as before.
- Bringing back an earlier version of a very long chat (from an automatic copy, a backup or Recently deleted), and
  undoing that, now happens in the background without the app stalling for seconds. As always, the version you had is
  kept first, nothing is ever treated as empty if it can't be read, and deleted chats still go to the Trash.
- Opening Recently deleted or Deleted things with a very long chat in it is instant again.
