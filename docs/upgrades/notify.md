# Tell me when… (round 44, notify): Hearth tells you the right things while you're in another app

When you're in another app, Hearth now uses the computer's own notifications (Notification Center on the Mac, Windows'
toasts) for the few things worth pulling you back for. Each one has an action that takes you straight there. One
notification per chat at a time, a burst becomes one summary, and your computer's Focus / Do Not Disturb still decides
whether they show. One place chooses what notifies: **Settings › Advanced › Tell me when…**. No new button on screen,
and nothing is added to any message (0 tokens).

Before this round, five modules each made their own browser-style notification (`new Notification(...)` in appui.js,
native.js, access.js and activity.js). Every reply notified, however short. A permission ask notified twice (access.js
and activity's list), the notifications stacked, and only the Mac showed Hearth's name. On Windows the AUMID depended on
a shortcut you might never have made. There was one on/off switch.

New files:
- `notify-core.js`: the pure rules (UMD), used by both sides and tested in Node:
  - which events notify, and the five switches
  - the words and actions of each notification
  - grouping (replace, never stack) and burst summaries
- `notifymain.js`: the main side:
  - Electron's `Notification`
  - is Hearth in front?
  - one notification per group, bursts
  - clicks: reveal the file, or bring the window up and say where to go
  - the Windows Start-menu shortcut with Hearth's app id
  - a recorder for the checks
- `notify.js`: the window's side:
  - the switches
  - the facts (who, which chat)
  - permission and question cards
  - where a click goes
  - an update being ready
  - `/notify-when`, the Ctrl/⌘+K row
- `dev/notify-test.js` (UNIT, 52 checks) and `dev/checks/notify.js` (`sh dev/run-checks.sh notify`).
- Lazy group `notify`, loaded right after the first screen (at `updater.js`, before `activity`). No new script on the
  first screen.

## What notifies (only while you're in another app or Hearth is hidden)
| When | Words | Action (the click does the first) | Switch |
|---|---|---|---|
| A reply finished that took **more than ~20 s** (shorter ones: the Dock / taskbar number only) | "Claude replied" + the gist of the reply, without Markdown | **Open the chat** | Replies |
| A reply failed | "Claude's reply failed" + why | Open the chat | Replies |
| A message that waited went out: **back online**, or a **usage limit reset** ("Send at 18:00") | "Back online: your message went out" / "Usage limit reset: your message went out" | Open the chat | Replies |
| A render, a **batch** (⧉) or **▦ All formats** finished (more than 10 s) | "Render done" + file name · time | **Show in Finder** / **Show in Explorer** (reveals the file without bringing Hearth up) · Open the renders | Renders |
| A render failed | "A render failed" + why | See why (the renders list) | Renders |
| Other long work with a bar (flows, captures, installs; over a minute) | "… finished / failed" | Open Activity | Renders |
| A 🔁 **Keep going** round finished | "🔁 Claude: round 2 of 5 done" + its cost | Open the chat | Keep going |
| The routine **stopped / finished / paused, and why** (the cap, an error twice, a usage limit… not when you stopped it yourself) | "🔁 Keep going stopped in “…”" + why · rounds · tokens | Open the chat | Keep going |
| A **permission card** waits (the AI is blocked on you) | "Claude needs you" + "Wants to delete: old-renders/" | **Allow…**: opens the card | When an AI needs me |
| A **question card** waits | "Astra asks you" + the question | **Answer…**: opens the card | When an AI needs me |
| A plan waits for ▶ Go ahead, a reply looks stuck, sync needs a look | as before (Activity) | See the plan / Open the chat / Look at it | When an AI needs me |
| A **Hearth update is ready** (once per new set of changes) | "A Hearth update is ready" + what's new | See what's new… | Updates |

**"Allow…" never approves anything.** It brings Hearth up on that chat and puts the keyboard focus on the card itself,
not on its Allow button (the card focuses Allow when it appears, so Enter would have allowed). The card's opacity
pulses three times to show where it is. Approving stays a click on the card. When the card is answered (or times
out), its notification leaves the OS's notification centre.

## Upgrades
### Native, with an action
1. Notifications are Electron's own, not the page's: Notification Center on the Mac and Windows' toasts, with Hearth's
   name and icon.
2. A long reply (more than ~20 s) that finishes while you're elsewhere: one notification with the gist and **Open the
   chat**. Shorter replies only put the number on the Dock / taskbar icon.
3. A failed reply says why, with Open the chat.
4. Render, batch and All formats done: **Show in Finder / Show in Explorer** reveals the file without bringing Hearth
   up; Open the renders is the second button.
5. A render that failed: why, and See why opens the renders list.
6. 🔁 Keep going: each round finished ("round 2 of 5 done" + its cost) and the routine's end or pause **with the
   reason** (the cap, an error, a usage limit). Not when you paused or stopped it yourself.
7. **An AI waiting for your permission**: "Claude needs you" with **Allow…**, which opens the card focused on the card,
   never on Allow. Nothing is ever approved from a notification.
8. A question card: "Astra asks you" with **Answer…**, which opens the card.
9. Answering (or the card timing out) removes its notification from the notification centre.
10. Back online, or a usage limit reset: "your message went out", with Open the chat.
11. "A Hearth update is ready", once per new set of changes, with See what's new… (nothing installs without your click).
12. A plan waiting for ▶ Go ahead, a reply that looks stuck, and sync needing a look keep their notifications (from
    ◉ Activity), now with buttons.
13. A click brings Hearth up (restored if minimised, shown from the tray, in front on the Mac) on **the right chat**:
    docked director chats too (the Lab's focus mode steps aside).

### Without nagging
14. **One notification per chat at a time**: a newer one about the same chat replaces it, never stacks.
15. **A burst becomes one summary**: three or more chats or things within 12 s become "Hearth: 4 things while you were
    away" + their titles, which keeps counting (replaced, not stacked) with Open Activity.
16. An AI waiting for you is never folded into the summary, and something else about its chat goes beside it, not over
    it: its "Allow…" stays one click away.
17. Looking at the chat in Hearth removes its notification from the centre; coming back clears the summary.
18. **Quiet hours follow the computer**: Focus on the Mac and Do Not Disturb / Focus assist on Windows hold them. Hearth
    never marks one urgent, never keeps one on screen forever, and leaves the sound to the system.
19. A 🔁 Keep going round's reply notifies once (the round's notification), not twice.
20. A permission or question card notifies once (it notified from two places before).
21. Nothing while Hearth is in front (focused and visible). A window hidden in the tray or minimised counts as away.

### One plain place to choose
22. **Settings › Advanced › Tell me when…**: the old "Desktop notifications while I'm elsewhere" switch (moved here from
    Chats), then five switches: **Replies · Renders · Keep going · When an AI needs me · Updates**. All on by default;
    each explains itself on hover.
23. The fold says where it stands ("All on: replies, renders, keep going, when an AI needs you, updates", "Replies,
    keep going, updates", "Off"), and follows a switch as you flip it.
24. With the main switch off, the five dim and wait.
25. **Ctrl/⌘+K Find anything** knows all six rows ("Settings › Advanced › Tell me when…"), plus a row "Tell me when…"
    that opens the fold.
26. `/notify-when [replies | renders | keepgoing | needs | updates | all] [on | off]` (also `/tell-me-when`; no
    argument: where they stand). `/notify on | off` still works.

### Windows and the Mac
27. Windows: the app id (AppUserModelID "Hearth") is set, and the first notification makes sure the **Start-menu**
    shortcut carries it. It's made if missing (never on the desktop) or given the id if an older one lacks it. Without
    it Windows shows no name / icon and drops the click.
28. The Mac: works with the hidden title bar build (notifications don't depend on the frame), the buttons show on the
    notification, and a click brings Hearth in front of the app you were in (`app.focus({ steal: true })`).

28 upgrades.

## How it's built
- Deciding: the window decides the switches (`NotifyCore.decide` with `H.settings()`: master `settings.notify`, then
  `settings.notifyWhen.{replies, renders, keepgoing, needs, updates}`, a missing key = on, plus the length rules). The
  main process decides "in front?" (`win.isFocused() && isVisible() && !isMinimized()`), the words
  (`NotifyCore.compose` with its own platform: Finder / Explorer), the grouping (`NotifyCore.grouper`) and shows it.
  `notify:send` → `{ shown, why, group }`.
- Clicks: `click` = the first action, `action` (button index) = that action. `{ file }` → `shell.showItemInFolder` in
  main. Anything else: restore / show / focus (+ `app.focus({ steal: true })` on the Mac), then `notify:go` → `Notify.route`
  (chat, card, renders, sync, update, activity). Notifications are kept referenced per group until closed (a collected
  one loses its click).
- Senders (small hooks in other streams' files):
  - `appui.js replyFinished` (now with the reply's `ms`; native.js passes it)
  - `activity.js show()` (plan, stuck, sync, renders incl. batch / All formats via the render queue, long jobs; its old
    20 s gap stays only for the old path)
  - `routines.js` (`tell`: round / pause / stop)
  - `offline.js` (`told` after a waited message went out)
  - `updater.js` (`Notify.update` after a quiet check)
  - permission / question cards through the existing `hearth:needs-you` event (access.js / native.js keep their toast
    and taskbar flash; their old `new Notification` is now only the fallback before notify loads)

## Edits outside my lane (small, additive)
- `main.js`: the `notifymain` register line, and `window:isFocused` honours the checks' "away".
- `preload.js`: `hub.notify`.
- `appui.js`: the Tell me when… fold, the master row moved out of Chats, `replyFinished` → Notify.
- `native.js`: the reply's `ms` to replyFinished; headsUp leaves the desktop notification to Notify.
- `access.js`: headsUp leaves it to Notify.
- `activity.js`: its notifications through Notify, with their facts.
- `routines.js`, `offline.js`, `updater.js`: one hook each.
- `appsearch-data.js`: 'Tell me when…' in ADVANCED, the notify row moved, 5 rows.
- `lazy-data.js`: the group, plus the regenerated manifest.
- `index.html`: one name on the existing lazy-at tag.
- `dev/run-checks.js`: the `notify` group, `notify-test` in UNIT.

## Tests
- `node dev/notify-test.js` (UNIT, 52 checks):
  - Which events notify: lengths, failures, unknown events, nothing in front.
  - Each switch silences exactly its own types; the master silences all; the fold line.
  - The words and actions (Finder / Explorer). A permission's only action is "Allow…" carrying a card id, with no
    approve field anywhere.
  - Grouping: replace per chat, a burst → one summary that keeps counting, the urgent card never folded or covered,
    seen / closed.
  - The main side with a stand-in for Electron's Notification:
    - shown with buttons, never urgent, sound left to the OS
    - the next render replaces the last
    - Show file reveals without bringing Hearth up
    - a click restores / focuses / tells the chat
    - Allow… sends only `{ card, chat }`
    - a burst of 4 → the summary
- `dev/checks/notify.js` (fake engines; the recorder in place of the OS; Hearth played "in the background"), all in the
  real window:
  - A short reply → nothing (`short`).
  - A **21 s fake reply → exactly one notification with Open the chat**, never urgent. Its click from another chat
    opens that chat.
  - **A render done (30 s) → "Show the file" first**, its click reveals that file; a 1 s render → nothing.
  - **A permission card (Access.ask) → "Claude needs you" with one action, Allow….** Clicking it focuses the card
    itself (not a button) and after 0.8 s the card still waits (nothing approved). Deny on the card denies, and its
    notification closes.
  - A burst of 4 chats → one summary.
  - **Each switch off silences its own type** while another type still shows; the master silences all.
  - Settings › Advanced › Tell me when…: the master + five, all on, hover sentences, the line follows a switch, the
    master off dims the five.
  - Find anything's 6 rows with their path; `/notify-when renders off / on`; the Ctrl/⌘+K row opens the fold.
  - PASS.
- Also run: see the final report (nativefeel, routines, offline, settingscalm, appsearch, lazy, unit:boot-test).

## Risks and limits
- Not testable here: a real Mac or Windows PC. On a real Mac or PC, not checked:
  - whether the toasts and their buttons show
  - Focus / Do Not Disturb holding them
  - the Start-menu shortcut gaining the id
  - `app.focus({ steal: true })`
- Windows' buttons: Electron documents notification buttons for the Mac. On Windows Hearth passes them too (shown
  where the Electron version supports them), and **a click on the toast always does the first action**. No custom
  `toastXml` (a wrong one would silently show nothing).
- The installed Mac app keeps Electron's CFBundleIdentifier (mac/install-mac.sh), so macOS files the notification
  permission under that id. The first notification asks for permission there as for any app.
- The first notification on Windows writes `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Hearth.lnk` if it's missing
  (that's how Windows knows the app's name / icon). It's the same shortcut Settings' "Create Start menu & desktop
  shortcuts" makes, without the desktop one.
- The very first second after a start (before the notify group loads) falls back to the old page notifications for
  replies and cards.

## For the patch notes
- **Hearth tells you when it matters, while you're in another app**: a long reply finished, a render done (or failed),
  a 🔁 Keep going round or its stop (and why), an AI waiting for your OK, your waiting message sent after the internet
  or a usage limit came back, an update ready.
- They're your computer's own notifications (Notification Center on the Mac, Windows' notifications) with Hearth's
  name and icon. Focus / Do Not Disturb still decides; Hearth never pushes through it.
- Each one has a button: **Open the chat**, **Show in Finder / Explorer** for a render, **Allow…** for a permission.
  Allow… only opens the card in its chat; you still decide on the card itself.
- No nagging: one notification per chat (a newer one replaces it), a burst becomes one "Hearth: 4 things while you
  were away", short replies only put a number on the icon, and nothing shows while you're looking at Hearth.
- Choose what notifies in **Settings › Advanced › Tell me when…**: Replies, Renders, Keep going, When an AI needs me,
  Updates (all on to start). Ctrl/⌘+K "Tell me when" finds it.
- On Windows Hearth makes sure its Start-menu shortcut exists, which Windows needs to show Hearth's name and route
  the click back.
- What to try: start a long message or a render, switch to another app, wait for the notification, and click it (or
  its button). Turn off Renders in Tell me when… and render again: no notification.
