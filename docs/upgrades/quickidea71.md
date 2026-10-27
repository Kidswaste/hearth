# quickidea71 (round 71): 💡 Quick idea

Quentin gets ideas at random moments. Now there's one place to drop them, from any app, in a few seconds, without Hearth's
main window coming forward. **Tray menu › 💡 Quick idea…** (or **Ctrl+Alt+I** from any app) opens a small window that
stays on top. Type the idea, or hold 🎙 and say it, then click where it goes. Everything you saved is listed in the
**💡 Ideas** inbox. Nothing is uploaded, no AI is asked, and the microphone is only on while you hold the button.

## Upgrades

The small window
1. **💡 Quick idea…** in the tray / menu-bar icon's menu, right under "Show Hearth".
2. **Its own key, Ctrl+Alt+I** (⌃⌥I on a Mac), from any app. You can change it, or clear it to turn it off, in
   Settings › Advanced › Keys › **💡 Quick idea from anywhere**. If another app already uses the key, or it's the
   show / hide key, it stays off: Settings says why, and saving shows a note.
3. **A small window that stays on top** (about 460 × 430), placed on the screen where your mouse is. It opens in front
   of what you're doing. Hearth's main window stays where it was, even when it's hidden in the tray (on a Mac it's a
   floating panel, so the rest of Hearth doesn't jump forward).
4. **A text box, ready to type.** Enter saves. Shift+Enter starts a new line. Esc closes the window and keeps your
   words for next time.
5. **🎙 Hold to record.** The mic opens only while you hold the button (mouse, or Space / Enter on the button). It closes
   as soon as you let go, or if the window loses focus. You get a voice memo, up to 5 minutes, with ▶ to listen and ✕ to
   remove it. A press that's too short says "Hold 🎙 while you talk". A blocked or missing mic says so in plain words.
6. **Voice memos are WAV files on this computer**, in `<Hearth data>/quick-ideas/Idea 2026-10-27 14.05.33.wav`
   (16-bit mono). They're written once the file is complete, and a second one in the same second never overwrites
   the first.
7. **Four big "where it goes" buttons**, each one showing where the idea will end up:
   - **🎵 Music** goes to Sound desk › Sessions.
   - **✦ Quest** goes to Sidequest › Saved ideas.
   - **📁 Project** asks you to pick one of your 6 most recent projects. The idea is added to that project's notes.
   - **💬 Later** goes to the 💡 Ideas inbox.
8. **Enter saves to the place you used last** (shown with "↵ Enter" on that button, and in the hint line). That includes
   the same project.
9. After saving, it says "Saved to ✦ Quest · Sidequest › Saved ideas ✓" and closes. If a save fails, your words and the
   memo stay in the box.
10. **💡 All ideas** at the bottom of the window opens the inbox in Hearth.

Where the ideas end up
11. **✦ Quest**: a saved idea in Sidequest Studio (Life › Find a quest › Saved ideas). The first line becomes its name
    and the second line its small finish line. Its path is picked from the words (music / visual / game, otherwise
    Everyday). It's added quietly, in the background.
12. **📁 Project**: one line in the project's notes, like "💡 boss intro with the drums · 27 Oct", under what was already
    there.
13. **🎵 Music**: a new **💡 Ideas for music** part at the bottom of the Sound desk's **Sessions** panel, with ▶ for
    voice memos, Move to… and Delete.

The 💡 Ideas inbox
14. **💡 Ideas** in the rail's **⋯** menu.
15. **In the ✦ quest tracker**: a "💡 N ideas waiting · Ideas" row while ideas wait in Later, and "💡 Ideas…" in its
    **⋯ More** menu.
16. **Every idea, newest first.** Each one shows where it went (🎵 Music, ✦ Quest, 📁 Clink, 💬 Later) and when, with
    ▶ for a voice memo.
17. **Move to…** on each row: 🎵 Music, ✦ Quest, 📁 a recent project, or 💬 Later. Moving takes the idea out of the old
    place first. It comes out of Sidequest's saved ideas, unless you already made it a quest. It also comes out of the
    project's notes, unless you changed that line by hand.
18. **Delete** sends an idea to the inbox's own **🗑 Trash**, with **Undo** in the note that pops up. It also comes out of
    Sidequest or the project's notes.
19. **Restore** in the Trash brings an idea back, and back to where it went. Deleted ideas stay in the Trash for 30
    days. **Empty the Trash** (it asks first) moves their voice memos to your computer's Trash. Nothing is deleted for good.
20. **Right-click a row** for the same actions, plus Open (Sidequest / the project / the Sessions panel), Show the voice
    memo file and Copy the words.
21. If an idea couldn't be put in place (for example, Sidequest's idea box is full), its row says why and has
    **Try again**.
22. **Empty state**: it explains where to click.

Also (secondary)
23. Ctrl/⌘+K: "💡 Quick idea…", "💡 Ideas inbox", the Settings row and a "How do I jot down an idea quickly?" answer.
24. The keys sheet (bottom left) lists the key.
25. `/idea` opens the inbox. `/idea quest: …` (or music: / project: / later:) saves an idea. `/idea new` opens the small
    window.

## How it's built
- `quickidea-core.js` (UMD, no DOM, tested in Node) holds the pure logic:
  - the store `{ v, ideas, trash, last }`: `validate` throws if the file is damaged and drops damaged rows;
  - `make` / `add` / `move` / `setPlaced` / `trash` / `restore` / `purge` / `pending`;
  - Sidequest's idea shape (`questIdea`), the notes line (`noteLine` / `addNote` / `removeNote`) and `recentProjects`;
  - the WAV tools `encodeWav` / `checkWav`, plus `sameKey` and `parseWords`.
- `quickideamain.js` is loaded on first use (main.js `lazyIpc` plus one `appshell.onQuickIdea` line). It does three
  things:
  - It's the only process that writes kv `quick-ideas`. It writes one change at a time, through
    `store.getKVStatus` / `setKV`. When the store can't be read, it refuses and writes no memo file.
  - It writes the WAV files and owns the small window. The window closes for good after 10 minutes hidden.
  - It takes `quickidea:op` calls from the main window and `quickidea:win` calls from the small window (the sender is
    checked). It moves files to the Trash the way playnotes does (macpolish / winpolish checks).
- `quickidea-window.html/.js` + `quickidea-preload.js` are the small window: sandboxed, with its own CSP, and following
  your computer's light / dark mode.
- `quickidea.js` + `quickidea.css` are lazy group **`quickidea`** (tier use). They put Quest / Project ideas in place:
  - The main process sends `tray:ideas`, and appui's existing tray listener loads the group.
  - Sidequest ideas go through `QuestHud.write`, which uses the Studio's mutate when the Studio is open.
  - Project notes go through `Projects.setNotes` + `flush`.
  - The same group runs the inbox, the Sessions section, `/idea` and the Ctrl/⌘+K actions.
- Small additive edits (each marked `(round 71, quickidea71)`):
  - `appshell.js`: the tray item and the key in `applySettings`, which returns `quickIdeaKeyOk` / `quickIdeaWhy`.
  - `main.js`: 3 lines. `preload.js`: `hub.quickIdea` and two tray events. `appui.js`: the tray event, and the Settings
    field + save.
  - `simplify.js` (rail ⋯), `questhud.js` (row + menu), `tools/bouncelog.js` (one line in the Sessions panel),
    `keys-ui.js` (keys sheet line), `appsearch-data.js` (row + help).
  - `sync-merge.js`: `quickIdeaKey` stays per computer, like `hotkey`.
  - `lazy-data.js` (group + regenerated META), `lazy-meta.js`, `index.html` (`quickidea` in the lazy-at.js tag),
    `dev/run-checks.js` (UNIT + group).
- First-screen cost is +2 KB (2335 / 2345 KB). The main process requires nothing new at start: it only reads the
  module's source for `lazyIpc`. There are no timers and no idle work.
- No Codex file was edited. Sidequest ideas use QuestCore's own `saveIdea`.

## Tests
- `node dev/quickidea71-test.js` (unit, in `const UNIT`): 14 checks.
  - Routing and "pending", the last-used place.
  - Move / Delete / Restore / Purge, and the caps.
  - Damaged file vs. damaged rows.
  - Codex's real `QuestCore.saveIdea` + `validate`.
  - Notes lines: add, take out exactly, the 4000-character limit.
  - Recent projects; WAV encode / check, including too long and not a WAV; the key comparison; `/idea` words.
  - `quickideamain.js` on a temporary folder with a fake store: saves with and without a memo; an unreadable store
    refuses and leaves no file; a project that's gone; the Trash moving memos to a test Trash.
- `dev/checks/quickidea71.js` (the app on a throwaway profile, fake mic stubbed in the small window), by clicking:
  - the real tray menu item, with the main window hidden and staying hidden;
  - the four buttons; Enter → Later; ✦ Quest → Sidequest's saved ideas (the journal validates);
  - 🎙 held / released: the mic is asked once and closed on release, and the memo on disk is a WAV; then 🎵 Music;
  - 📁 Project picker → Clink's notes, then Enter → the same project;
  - the rail ⋯ → inbox: Move to… Quest, and Quest → Later (out of the journal again); Delete → Trash (the notes line
    comes out); Restore;
  - the Sessions section; the tracker row and ⋯ More; the Settings field;
  - a key that clashes with show / hide stays off;
  - zero AI calls.
- **Results:** these all pass:
  - quickidea71 (38 steps, 0 AI calls), unit:quickidea71-test, lazy, unit:boot-test;
  - questhud61, bouncelog66;
  - unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:commandonly-scan;
  - the appsearch unit test.

  `appsearch` (the app check) fails one step: "permissions" → Files it can use in the first 4. It fails the same way on
  the base commit 6f69d86, so it was already there and isn't from this stream.
- Fixed while testing:
  - **Move to…** on a row used to open a menu with one more "Move to…" inside. It now lists the places straight away.
  - A move made while another idea was still being put in place could be skipped. The page now runs one more pass.
- The small window was checked by eye from a screenshot: the text box, 🎙, the four buttons, "↵ Enter" on the
  last-used one, and 💡 All ideas.

## Risks
- On a Mac the window is an Electron `panel`, so the main window doesn't come forward. This was checked only on Linux;
  if typing ever fails there, drop `type: 'panel'` in quickideamain.js.
- Ctrl+Alt+I is AltGr+I on Windows. On a keyboard where AltGr+I types a character, change the key in Settings.
- Quest / Project ideas are put in place by Hearth's page. If the page is reloading at that moment, the idea waits.
  Opening the inbox puts it in place.

## For the patch notes
- **💡 Quick idea, from anywhere.** Click the Hearth icon in your tray / menu bar › **💡 Quick idea…**, or press
  **Ctrl+Alt+I** in any app. A small window opens on top. Hearth's main window stays where it is.
- **Type it, or hold 🎙 and say it.** The mic is only on while you hold the button. The voice memo stays on this
  computer.
- **Click where it goes:** **🎵 Music** (Sound desk › Sessions), **✦ Quest** (Sidequest › Find a quest › Saved ideas),
  **📁 Project** (pick a recent one: the idea goes in its notes) or **💬 Later**.
- **Enter saves to the same place as last time.** Esc closes the window and keeps your words.
- **Everything you saved is in 💡 Ideas**: the rail's **⋯** menu, or the ✦ quest tracker (a "💡 N ideas waiting" row,
  and its ⋯ More). Each idea has **Move to…** and **Delete**. Deleted ideas wait in a Trash with **Restore** for
  30 days.
- Music ideas also show at the bottom of the Sound desk's **Sessions** panel, with ▶ to play the memo.
- To change the key, or turn it off: **Settings › Advanced › Keys › 💡 Quick idea from anywhere**. If another app
  already uses the key, Hearth leaves it off and tells you.
