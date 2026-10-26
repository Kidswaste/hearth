# Round 70: smoother on a big profile, fixes, follows and a show-night checklist
*October 2026*

## ⚡ Fewer freezes
- **The Sidequest map and the ✦ tracker no longer freeze Hearth for a moment when they read this week's shows.**
  With a big list of shows, each read held the whole app for up to a quarter of a second. Now it takes a few
  hundredths.
- **Opening Sidequest's map is quicker with a long "My Paris" history** (many shows, places and photos): the timeline
  under the map draws several times faster.
- **Sync between your computers is lighter when a lot changes at once** (the first sync, or coming back after a long
  time). It no longer rewrites its own bookkeeping hundreds of times during one sync.
- Behind the scenes: a big test profile (1,500 chats, a full quest journal, shows, photos) now checks that Hearth
  stays smooth at startup, while idle with sync on, and while you click around.

## 🎛 Sound desk fix
- Switching instrument in the Sound desk (for example Vital to Serum 2) now always closes the old instrument's editor.
  Before, if you switched soon after the editor opened by itself (first open, Reset host, or the ASIO switch), the old
  Vital editor could stay stuck on the desk, frozen, next to or under Serum 2's editor.
- On Windows, a plugin editor shown inside Hearth is now taken out of Hearth's window before it closes, so a slow or
  stuck plugin can no longer leave a dead editor window on the desk. This also applies when Hearth itself closes.

## 🗺 Sidequest fixes

- In Life › Find a quest, every single quest can be taken now. Before, most cards answered "Deal or open this card
  before taking it."
- Life › Map has an "Add a place" link again, for pinning your own spot. Double-clicking the map still works too.
- Life › Map › My plans shows how far a trip quest has got ("1/3 done"), and marks plans you let rest as "Resting".

## ⏰ Leave reminders, fixed + 🎒 Before I go
- **New: 🎒 Before I go.** Open a show (Paris map › Shows this week › the show) and click **🎒 Before I go**. You get
  a short list to tick: your ticket, phone charged, earplugs, ID, card / cash, and a jacket when Hearth already has
  a forecast saying rain or cold. The ticket line opens your ticket (or lets you add it).
- **It comes up when it's time to leave for a show.** Click the "Leave in 10 min…" notification, or just look at
  Hearth if it's open, and the list is there with Snooze and Dismiss.
- **Make it yours**: click **Edit my list…** in the list. It's used for every show and kept on this computer. Your
  ticks are kept per show.
- **Fixed: an errand no longer jumps to tomorrow** while you still have time to make it today.
- **Fixed: a dismissed leave reminder stays quiet**, even if you click Snooze on an old notification.
- **Clearer times**: reminders say "tomorrow" when they mean tomorrow, and a reminder missed just before midnight
  says "yesterday".

## ★ Follow
- **Follow the artists and venues you like.** Open a show's card (Sidequest Studio › Map › ✦ Shows this week → a show)
  and click **★ Follow** next to an artist's name or the venue's. Click it again to unfollow.
- **When they announce a new show**, the **✦ quest tracker** says so: "★ New: Call Super at Petit Bain, Sat 14 Nov".
  Click **Make it a quest**, **Bring someone** (an invite you can copy) or **Dismiss**. The ✦ chip in the rail gets a
  small ★ while something is new.
- Shows with someone you follow get a **★ in the week's list** and on their **venue's pin on the map**.
- **★ Following** at the bottom of the week's list shows who you follow, with **Unfollow** buttons. It also suggests
  artists and venues from **Shows I went to** that you've seen twice or more: one click on **★ Follow**. You can also
  type any name there.
- Names are matched loosely: capitals, accents, "DJ", "feat.", "b2b", "(live)" and "Le / La" don't get in the way.
- Nothing extra is downloaded: Hearth checks the shows it already reads, as often as before.

