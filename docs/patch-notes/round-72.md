# Round 72: projects, sync, the Lab, framerate and lighter long chats
*October 2026*

## 💬 Long chats stay light
- Very long chats stay light now: only the latest messages are drawn, older ones "rest" and come back as you scroll up
  to them. Nothing in the chat itself changes.
- Scrolling all the way up a 900-message chat used to leave about 43,000 elements on the page until you closed it; now
  it peaks around 4,000 and goes back down when you return to the end.
- The scrollbar now shows the whole chat, not just the last 40 messages.
- What you're reading stays still while older messages appear above it.
- A quiet line, "Earlier messages are resting · Show all", draws everything if you prefer (also `/jump all`).
- Find in a chat (Alt+F, and now Ctrl/⌘+F on a chat) finds resting messages too and takes you there; jumps to a
  message, pins and search results work the same.
- Older replies' formatted text is freed from memory while they rest and rebuilt when you come back.

## ☁ PC ↔ Mac sync you can trust
- Sync between your PC and your Mac got a lot more careful: messages written in the same chat on both computers, scene
  edits, and notes edited on both all stay. Nothing quietly disappears when iCloud or OneDrive is slow.
- No more "logo 2.png" / "theme 2.css" style copies appearing in your folders, and a chat you delete stays deleted.
- A video still downloading never shows up half-finished, and renaming "Photo.png" to "photo.png" no longer leaves sync
  waiting forever.
- Look at the bottom of the left rail: the sync indicator now says it in a word (✓ Synced, ↻ 12 waiting, ⚠ 1 conflict,
  ○ Offline).
- Click it for the sync panel: what's waiting and why, the last problem in plain words, and Sync now.
- When something was changed on both computers, the panel shows both versions side by side. Click Keep PC, Keep Mac or
  Keep both; the one you don't keep waits in Deleted files for 30 days.
- Keep both now works for Lab scenes and boards too: you get both, one named "(from Mac)".
- Sync is lighter: a big Lab scene file arriving from the other computer no longer makes the app stutter.
- Install this update on both computers.

## 📁 Projects
- **Switching projects is quicker.** Picking another project from the project's name ▾ no longer starts the preview
  from scratch: the next project's scene starts in the one already open, and its chat and moodboard get ready at the
  same time.
- **Deleted projects can come back.** Projects › ⋯ › Recently deleted projects keeps the last 30, with their notes and
  links: click one to bring it back. (Deleting a project never touched its chats, scenes or files.)
- **Project notes no longer lose what you type past their 4,000-character limit**, and typing in them no longer
  stutters on a big profile.
- **A project whose scene or chat hasn't come over from your other computer yet** says so calmly ("It may still be on
  its way…") and keeps its links; Hearth no longer moves that project to the top each time you try it.
- **A project's chat stays where you are** when you move between the project's tabs (Desk, Scene…) (it used to jump
  back into older messages and load 60 more of them each time, so long sessions got slower).
- **Opening a project for the first time each day no longer freezes for half a second** when its chat is very long.
- **Leaving a project no longer re-saves its scene when you didn't change it**, so your two computers have less to sync
  and the scene doesn't jump to the top of your recent scenes.
- Prepare for offline checks what you just added to the project, too.

## 🔗 Chats and the Lab
- **Claude and Astra chats now always work on the right Lab scene.** A chat that isn't the Three Director used to change
  whatever scene happened to be open (or the Director's scene). Now each chat works on its own linked scene, even when
  you're looking at another one, and two chats can work on the same scene together.
- **See which scene a chat works on.** Chats linked to a scene show "🔗 Scene: name" just above the message box. Click
  it to open the scene, switch to another scene, start a fresh one, or unlink.
- **Link a chat in one click.** If a chat with Lab tools has no scene yet, it shows "🔗 Link this chat to a scene", and
  if its AI tries to use the Lab, a note with the same button appears instead of changes landing somewhere random.
- **Files you give a chat reach its scene.** Pictures, 3D models and videos you drop in a chat go into that chat's
  scene, and Astra can now use the pictures you attach in the Lab too.
- **Fewer stuck moments.** If the Lab preview restarts while an AI is using it, the AI is told right away and tries
  again, instead of waiting.

## 🎮 Framerate
- ▶ Play has a new **Quality: auto** setting, on by default. When your game can't keep up with your screen, it draws a
  little fewer pixels (down to two thirds) and goes back to full when there's room. If fewer pixels don't make it
  faster, it goes straight back to full. Switch it to **Full** from ▶ Play's right-click menu or the F stats chip.
- In the Lab, point at the preview: the stats line now shows **Quality: auto**. Click it to choose Auto or Full. When
  the preview is drawing lighter to stay smooth, it says so, for example "Quality: auto · 70 %".
- While a dialog or the ⌘K search is open over the Lab, the preview slows to 30 frames a second, so the graphics card
  isn't working flat out behind it.
- Scenes with several big pictures open without one long freeze: the pictures go to the graphics card one at a time.
- If your graphics card resets while a heavy scene is playing, the Lab now rebuilds the scene where it is. Before, a
  slow recovery made the whole preview reload, which was the heaviest thing it could do right after a reset.

## ⏳ Hearth left open for days
- **Hearth stays light when it's left open for days.** Every time you opened Settings, and every time the ✦ tracker
  showed a missed reminder, a hidden copy of it stayed in memory until you quit. Over a long session that added up
  and made Hearth slower to tidy its memory, a likely part of the hiccups that got worse the longer it was open.
  Closed windows now really go away. In a test of three compressed days, Hearth's memory stopped climbing.
- **Sidequest's map no longer collects old copies of its search bar** while it redraws in place.
- Behind the scenes: a long-run test now plays a whole day on a big profile (chats, the Lab, the Sound desk, the map,
  Settings, sync, reminders, the tray, sleep and wake) and checks every minute that nothing builds up.

