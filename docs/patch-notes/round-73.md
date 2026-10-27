# Round 73: faster start, steadier chats, Lab tools everywhere, big files in sync
*October 2026*

## 🚀 Faster start, quiet when idle
- **Hearth starts faster with a big history.** It now remembers the chats list between starts instead of reading
  every chat again, so the chats and your chat box are ready about a quarter sooner (here: 1.26 s → 0.96 s with
  1,500 chats).
- **Less to load before the first picture.** The node view, the prompt presets and some rarely used commands load
  right after the window appears instead of before it (about 9 % less code at startup). Everything still works from
  the first moment.
- **Projects Home opens lighter.** It no longer loads every Lab scene's code just to show their names, and its
  suggestions are worked out once the page is calm.
- **The Lab is quieter when you're not touching it.** Its little fps line no longer wakes the whole window every few
  seconds, and nothing runs for it while it's hidden behind a chat.
- **Hidden in the tray, Hearth now sleeps.** It uses about 0.2 % of one CPU across all its parts, with no timers
  ticking for nothing (a hooks clock and a settings check slowed down or stopped).
- Screen readers: the Lab's Layers box says what it is, and the ⋯ More button keeps its name after a hiccup.

## 📁 First project after a restart
- **The first project you open after starting Hearth opens much faster.** Hearth now gets your last project's scene
  ready in the background while you're doing something else, so clicking the project only has to show it.
- **A long project chat now opens at its latest message**, in one go, instead of opening in the middle of older
  messages.
- **Switching projects is a bit quicker**: Hearth no longer takes pictures for a fade nobody sees behind the loading
  card, and no longer re-saves the scene you just left when nothing changed in it.

## 💬 Steadier long chats
- Scrolling up a very long chat no longer jumps: messages appear above what you're reading at their real size,
  pictures and videos included.
- A thinking block or a list of tool steps you opened stays open when you scroll away and come back.
- Clicks are lighter on a profile with months of use: Hearth used to save its whole button-usage record (almost 1 MB)
  a few seconds after every click; now it saves only what changed, once a minute.
- A few small things that ran after every click (working out your most-used buttons) now run only when needed.

## 🧰 Lab tools on any scene
- **Claude and Astra can now do everything in the Lab even when you're looking at another scene**: add and replace 3D
  models, change materials and lights, move the camera, add physics, set keyframes and cues, and grab a frame at any
  time. The result is the same as if the scene were on screen.
- **No more half-finished changes**: if something an AI tries in the Lab fails partway, the scene goes back to exactly
  how it was, and the AI is told.
- **One undo per AI reply**: the ↶ button in the docked chat takes back everything the AI changed in its last reply in
  one click, and ↷ puts it back.
- **Clearer answers**: after each change the AI gets one plain line saying what changed, and it can ask for a small
  picture with any change.
- **Faster in the background**: changes to a scene you're not looking at now come back as soon as they show, instead
  of waiting a fixed time.

## ☁ Big files and what syncs
- Big files no longer hold up your chats: while a render or a long Lab take is going up (or coming down), new
  messages, scenes and settings sync right away beside it.
- Click the sync indicator at the bottom of the left rail: big files on their way are listed with a progress bar each.
- Sync reads big files half as much on the way up, a renamed video is just moved in the cloud, and a copy cut short
  goes on from where it stopped. Half-copied videos no longer appear in your cloud folder.
- In the same panel, "What syncs" lets you turn off a kind on this computer: Chats, Projects & scenes, Lab captures,
  Renders, Music sketches & stems, Photos or Tickets, with the size of each. Turning one off never deletes anything:
  the files stay where they are.
- "Free up space on this computer…" (in What syncs, or the ⋯ menu) lists the big files that are already safe in the
  cloud, then makes your cloud drive's copy online-only with one click. Hearth keeps its own copy and keeps working.
- If your cloud drive can't do that (Google Drive on Windows, for example), the panel says so plainly and changes
  nothing.
- Install this update on both computers.

