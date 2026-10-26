# invite67 (round 67): 👋 Bring someone

The owner goes to Paris shows found on Shotgun and DICE (showsync61 / showprep62) and does social quests in Sidequest
(confidence, connection, offering someone a drink). This stream makes it easy to invite a friend to a show: a short,
kind invite with an easy way to say no, written on this computer from a template. No AI tokens are needed, and
nothing is ever sent or uploaded by Hearth.

## Upgrades

Where it is (by clicking)
1. **👋 Bring someone** on every upcoming show's card: Sidequest Studio › Map › ✦ Shows this week → a show. The button
   has a visible label and sits next to Make it a quest.
2. The same button on a **venue pin's card** on the Paris map, under the venue's next show.
3. The same button on the **weekend plan's night-out slot** (✦ tracker › 🗓 Plan my weekend, Thursday evening → Sunday).
   The weekend card stays open under the invite card.

The invite card
4. **Tone**: three labelled buttons, Casual · Hyped · Low-pressure.
5. **Language**: Français · English. French (tutoiement) is the default.
6. The invite has the **show's name, the date, the venue and the ticket link**. It says "tonight", "tomorrow night" or
   "Friday night (1am)" in Paris time, whatever the computer's time zone is. Lineup names are added when the title
   doesn't already include them. A sold-out show says "resale".
7. **There is always an easy out.** English invites say "no worries if not". French invites say "aucun souci". The
   hyped tone asks a question instead of giving an order.
8. Missing details are handled: with no lineup, no venue, no date, no ticket link or a date-only listing, the
   sentence still reads naturally. It never shows "undefined" or "Invalid Date".
9. The text can be edited in place before copying.
10. **Copy** puts the invite on the clipboard.
11. **Open in WhatsApp** uses WhatsApp's own share link. The text is filled in, and you pick the chat.
12. **Open in Messages** (Mac only) opens Messages with the text filled in. The button isn't shown on Windows.
13. **Open in Instagram** copies the text, then opens your Instagram messages so you can paste it. Instagram can't fill
    the text in itself.
14. **Nothing is sent for you.** Every "Open in…" button only opens the app. You choose who gets it and press send.
15. **✨ Rewrite with Claude** runs only when you click it. It sends one small, lean message and shows its token count.
    The answer keeps the ticket link and the easy out, and Hearth adds them back if Claude dropped them. If it fails,
    your text stays unchanged.
16. Hearth remembers the tone and language you last picked, on this computer only.

Quests
17. **✓ I sent it** logs "Invited someone" on a matching social quest, and only when you click it. A quest matches
    when its next open step is about an invitation, for example "Before the show · Thomas" (Make the invite easy), a
    plan's "Open the invitation", or a life arc's "Make the invitation easy". The card says which quest before you
    click. When several quests match, a small list lets you pick one. This show's own quest and "Before the show"
    come first.
18. The log is your own proof on that step: a short note with the show and your invite, using Codex's
    `QuestCore.submit`. It makes no AI call, gives no XP and needs no review until you ask for one in the Studio. Who
    you invited and their answer are never recorded.
19. With no matching quest, nothing is logged and the card says so. The drink quest isn't matched, because its steps
    are about talking in person, not inviting.

Chat (secondary)
20. `/shows invite <show>` opens the same card. It autocompletes from this week's shows.

## How it's built
- `invite-core.js` (pure, Node + window, UMD): Paris time (EU summer-time rule), `when` / `what` / `build` (the
  templates), `links` (wa.me, `sms:&body=` on a Mac only, the Instagram inbox), `rewritePrompt` / `tidyRewrite`,
  `matchQuests(C, s, show)` (Codex's `next` / `available` / `done`) and `proofNote`.
- `invite.js` + `invite.css`: the card, in its own `<dialog>` so it works above the Studio's dialogs and the weekend
  card. Lazy group **`invite`** (tier `use`) loads on the first click. Prefs live in `store` (`invite67:prefs`). The
  quest log goes through `QuestHud.write` and Codex's `QuestCore.submit`. The note file is saved with
  `hub.saveAttachment`.
- `invite-hook.js` (in the `questjournal` lazy group, after showprep): one `ShowSync.extend({ card, subs: ['invite'],
  run, complete })`. This adds the button to every show card and venue card, plus `/shows invite`.
- Small additive edits outside my files:
  - `weekendplan.js`: the night slot's button. The weekend card also ignores clicks and Esc that belong to the open
    invite card.
  - `weekendplan.css`: one rule.
  - `lazy-data.js`: the group, plus the hook file in `questjournal`. The manifest was regenerated.
  - `index.html`: `invite` added to the `lazy-at.js#…` tag.
  - `main.js`: `openExternal` also allows `sms:&body=…` on macOS only.
  - `dev/run-checks.js`: the unit test and an `invite67` group.
- No idle cost: no timer, nothing loads until a click.

## For Codex
No Codex file was edited. This stream only uses your public rules: `QuestCore.next / available / done / submit /
checkProof / validate` (through `QuestHud.write`), and it reads `socialMission` / `subtitle` / `path` on campaigns.
The proof is `{ type: 'file', kind: 'text/markdown', excerpt: <the owner's note>, coverage: "…who it went to and any
reply are not recorded…" }`, with intent `"Invited someone"`, on the step's open submission list. If you rename the
invite steps, keep the word "invit…" in the title or brief so that `InviteCore.INVITE` still matches them.

## Tests
- `node dev/invite67-test.js` (unit, in UNIT): 31 checks. They cover every tone × language (name, venue, date, link
  alone on its line, easy out) and confirm the tones read differently. Fallbacks for an unknown tone or language.
  Missing fields: no lineup, a title that already names the artist, 3+ artists, no title / lineup, no venue, no or bad
  date, no ticket or a non-https link, sold out, an empty show, date only. Time: tonight / tomorrow, a 1 am start,
  summer and winter time (also run under TZ=America/Los_Angeles and Asia/Tokyo). Also the summary line, the links
  (no recipient, Messages only on a Mac), the rewrite prompt and tidy-up, and the quest matches on Codex's real
  QuestCore / QuestParis: none in a fresh journal; "Before the show" ranks first; a plan's invitation only once
  reachable; never a paused quest; never the drink quest. Finally, the proof passes `QuestCore.submit` and leaves the
  step not done.
- `dev/checks/invite67.js` (app, throwaway profile, showsync61's saved sample shows through `shows:test`, computer
  marked offline for the weekend plan, `askOnce` counted, links captured instead of opened). By clicking:
  - the list → a show's card → 👋 Bring someone (the card's code loads on that click)
  - French casual by default, then Hyped, English, Low-pressure
  - Copy; WhatsApp link; no Messages on Linux; Instagram
  - zero AI calls; nothing logged before "I sent it"
  - ✨ Rewrite: one stand-in ask, only on click
  - I sent it → the proof on "Before the show"'s invite step (no review, not done, journal valid)
  - a venue pin's next show
  - the weekend plan's night slot (offline), with the weekend card kept under the invite card
  - `/shows invite`
- Results: invite67, lazy, showsync61, weekendplan66, unit:invite67-test, unit:boot-test, unit:weekendplan-test,
  unit:showsync-test and unit:commandonly-scan pass.
  - showprep62 fails at "timed out: visited pins", the same way on the untouched base commit ffa46a9 (checked on a
    clean copy).
  - unit:datasafe-scan (tools/quest-chat.js), unit:winmac-test (cloud-files.js, sync-engine.js) and
    unit:errorcalm-scan (11 places in offline.js, questguide.js, Codex's quest files) report the same findings on
    the base commit. None are in this stream's files.

## Risks
- WhatsApp's share link opens in the browser first, then hands off to the app (or WhatsApp Web).
- Messages on a Mac: some macOS versions open a new message without filling the body. The text is always copied too,
  and the status line says so.
- The quest match is a word match ("invit…") on the next step. A social step worded without that word won't be offered.

## For the patch notes
- **Bring someone to a show**: open a show's card (Sidequest Studio › Map › ✦ Shows this week → a show, or click a
  venue on the map) and click **👋 Bring someone**. It's also on the night out in **🗓 Plan my weekend**.
- Pick a tone (**Casual**, **Hyped** or **Low-pressure**) and **Français** or **English**. Hearth writes a short invite
  with the show, the date, the venue and the ticket link. It always gives your friend an easy out ("no worries if
  not"). You can edit the text.
- Click **Copy**, or **Open in WhatsApp / Messages / Instagram**. These only open the app with your text ready.
  Hearth never sends anything: you choose who and press send.
- Want it worded differently? **✨ Rewrite with Claude** asks Claude once, only when you click it.
- After sending, click **✓ I sent it** to log "Invited someone" on a matching social quest, like "Before the show".
  The card shows which quest first. Only your own invite is saved, never who it went to or their answer.
