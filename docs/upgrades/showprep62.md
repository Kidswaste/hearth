# showprep62 (round 62): show night companion

The owner goes to shows in Paris announced on Shotgun and DICE (showsync61 lists them on Sidequest Studio's Paris map)
and wants real-life quests to work. This stream wraps a show night: getting ready before, keeping the night after, and
following the artists and venues so their next dates come in. No new rows of buttons (everything sits in the show card,
the show quest and the ✦ list), everything works from chat, nothing runs while idle, no AI unless asked.

## Upgrades

Before (Get ready)
1. **Get ready** on any show card (✦ Shows this week → a show, or a venue pin → a show) and on a show quest: one card
   with the day, doors and start (always Paris time), the venue and its address. `/shows prep <show>`
2. **Add to calendar (.ics)**: a calendar file in Paris time with its own Europe/Paris time zone (summer / winter time
   handled, a club night across the October change stays right), lineup, Métro hint and ticket link in the notes, a
   stable UID (adding it twice updates it). Opens in Apple Calendar / Outlook.
3. **Google Calendar ↗** and **Copy calendar link**: a plain "add event" link (no account access).
4. **Getting there**: the three nearest Métro stations with their lines and walking minutes, from a small bundled list
   of ~90 stations (no transit API, nothing fetched).
5. **Live routes · Citymapper ↗** (straight to the venue's coordinates) and **RATP ↗** (the official planner).
6. **Lineup · one listen each**: per artist, the listening page the listing already carries (SoundCloud, Bandcamp,
   Spotify…), else its Shotgun / DICE artist page, else a search link. Streaming sites are never read.
7. **Remind me on the day** (off by default, per show): around 3 h before the start, between 10:00 and 20:00 on the
   show's day (a 1 am start counts as the night before), never in the quiet hours. Shown through Hearth's notifications
   (the computer's Focus / Do Not Disturb holds it; a toast when Hearth is in front). Missed because Hearth was closed?
   It still comes, up to 45 minutes before the start. Each reminder goes once.
8. Showsync's listing now keeps **doors** (schema.org `doorTime`) and the **artist links** a page publishes, merged
   across Shotgun and DICE.

After (How was it?)
9. **How was it?**: tap 1–5 stars, write one moment, add a photo if you like. In the Get ready card, on the show card once
   the show has started, on the show quest, or `/shows went <show>` (opens it) / `/shows went <show>: 4/5 one moment`.
10. **The moment is the show quest's proof**: saved on the quest's next open step as a proof submission (your note +
    the photo), with no AI call. **Ask Astra to check it** (only when you tap it) reviews it step by step and completes
    every step Astra confirms (up to three short reviews: Get your ticket → Go → Bring back one moment).
11. **Shows I went to**: the count, the venues you've been to (✓ badges with visits), artists seen, the average rating
    and every night with its moment. From the ✦ list ("Shows I went to · N") or `/shows log`.
12. **Visited venues on the Paris map**: their pins wear a ✓ badge; a venue you went to that has nothing on this week
    stays on the map and opens your nights there. A venue card says "✓ You went N×" and your last moment.
13. Photos: a copy kept in Hearth's references and a resized JPEG for the proof (≤ 1600 px).

Follow
14. **Follow for their next dates**: after "How was it?", one tap per venue / artist that has a Shotgun or DICE page
    follows it in showsync61 (also as buttons under `/shows went`).

Chat
15. `/shows prep <show>`: times, Métro, routes, listen links, the calendar link, with buttons (Add to calendar,
    Remind me on the day, Open the card). `/shows went …`, `/shows log`; completions for all three.

## How it's built
- `showprep-core.js` (pure, Node + window): Paris time without the computer's zone (EU rule), `.ics` (VTIMEZONE,
  RFC 5545 folding / escaping), the Google link, stations + walking minutes, Citymapper / RATP links, listen links,
  what can be followed, the reminder rule, the log (entry, validate, merge, stats).
- `showprep.js` (window, lazy group `questjournal` right after showsync.js): the cards, the log store (kv
  `show-nights`: careful read — a log that can't be read is never treated as empty or saved over —; every save merged
  with what's on disk; kv writes are atomic), the quest proof, Astra's check on request, follow, `/shows prep|went|log`.
- `showprepmain.js` (main, registered from showsyncmain.js): ONE timer for the next reminder that's switched on, armed
  at start and after each save; no reminder on → no timer. What has gone is kept in `data/showsync/reminded.json`
  (atomic). IPC `shows:remind` ({ op: 'arm' | 'state' | 'fire' (checks only) }) and the `shows:remind` event.
- Idle cost: zero (no polling; the log is read once when the Studio loads).

## Tests
- `node dev/showprep-test.js` (unit, in UNIT): 58 checks — Paris time incl. both DST changes; the `.ics` (time zone,
  wall-clock start/end across the October change, UID, escaping, 75-octet folding, 3 h / 6 h defaults); the Google link;
  nearest stations (Machine → Blanche, Bataclan, Trabendo; nothing far away); routes; listen > page > search; what can
  be followed; the reminder (club night, concert, 1 am start, matinee, off by default, once, missed, quiet hours,
  earliest of several); the log (entries, damaged logs refused, merge: union / newer edit wins / order-free / removals /
  old preps leave, stats); showsync's doors + links (fixture) and their cross-platform merge; the main side's single
  timer (none while off, one to the minute, tells the window once, kept after a restart, a damaged log never rewritten).
- `dev/checks/showprep62.js` (app, showsync61's fixtures through `shows:test`, no network; Astra stubbed): `/shows prep`,
  the card's Get ready, lineup links, the `.ics` saved, the reminder armed only while on / disarmed / delivered through
  Notify once, the show quest's detail, How was it? → log + proof with no AI call, asked → 3 reviews complete the quest,
  follow (showsync now reads the artist page), a photo, `/shows log`, `/shows went <show>: 3/5 …`, ✓ badges on the map
  (incl. a venue not on this week's list), the log dialog, completions, no duplicate commands.
- Group: `sh dev/run-checks.sh showprep62`.
- Results (after merging claude/intelligent-galileo-yaiqem = weekquest62; origin/main had nothing new): showprep62,
  showsync61, questhud61, quest-paris, lazy, unit:boot-test, unit:showsync-test, unit:datasafe-scan, unit:showprep-test,
  unit:notify-test pass. `unit:errorcalm-scan` reports 7 findings in Codex's tools/quest-journal.js / tools/outing-desk.js
  that aren't in its baseline (raw `err.message` in Codex's proof / outing code, not lines from this stream).

## Notes / risks
- The Métro list is hand-made from known station coordinates (rounded to ~10 m): a hint, not a route planner. Live
  routes stay Citymapper / RATP. RATP's planner has no documented deep link, so it opens the planner page.
- Times show in Paris time even when the computer is elsewhere (fixtures written in the computer's zone show shifted
  in a UTC test machine: the checks compute the expected Paris time).
- Show quests need proof + review (Codex's rule). "How was it?" puts the moment on the quest as proof but never calls
  Astra by itself; one explicit tap runs the reviews. A step Astra doesn't confirm stops the run with its words.
- A `.ics` for a time skipped in March reads as summer time; the repeated hour in October reads as the second one.

## For Codex
Touches of Codex files, all additive:
- `tools/quest-journal.js`: a **quest detail hook** registry. `QuestJournal.addDetailHook(fn)`; in `questDetail`, right
  after the expedition note, each hook gets `{ quest, campaign, close, kit }` (kit = dialog, mapIcon, button, p, label, E,
  mutate, questDetail, navigate, notice) and may return a node to append. A hook that throws is skipped. Used for show
  quests (`c-show-*`): an aside "SHOW NIGHT" with Get ready / How was it?.
- Proof for show quests is a normal `QuestCore.submit` of a `type: 'file'` proof (the note as `.md` in attachments, the
  photo's resized JPEG in `images`), through `QuestJournal.mutate` when the Studio is open, else the same
  validate / upgrade / kvSet path showsync61 uses (announced as `hearth:quests` { source: 'showprep' }). Reviews go
  through your `QuestReview.run`, completion through `QuestCore.complete` only after `meetsBrief: true`.
- Not changed: quest-core, quest-review, quest-atlas, outing-*. The ✓ badge is CSS on `.qj-atlas-pin.visited` for
  `show-venue-*` pins only (showprep.css).
- Pre-existing: `dev/errorcalm-scan.js` flags 7 raw-error sinks in quest-journal.js / outing-desk.js (not from this stream).
Other shared files (small, additive): showsync.js (`ShowSync.extend({...})` hooks: card, pins, select, venue, list,
/shows sub-commands), showsync-core.js (doors + artist links), showsyncmain.js (one register line), preload.js
(`hub.shows.remind` / `onRemind`), notify-core.js (`type: 'reminder'`: master switch + "in front" only), notify.js (the
reminder listener), lazy-data.js (+ regenerated META), dev/run-checks.js (unit + group), the shotgun fixture (doorTime,
performer url / sameAs).

## For the patch notes
- New: a show night companion for the Paris shows on your map. On a show, tap **Get ready**: times in Paris time, add it
  to your calendar (Apple / Outlook file or Google link), the nearest Métro stations, live routes in Citymapper or RATP,
  and one listen link per artist.
- **Remind me on the day** (off until you tick it): a heads-up a few hours before, never at night.
- After the show, **How was it?**: stars, one moment, a photo if you like. It goes into **Shows I went to** (venues,
  artists, your nights) and the venues you've been to get a ✓ on the Paris map.
- If the show was a quest, your moment becomes its proof right away; tap **Ask Astra to check it** when you want the
  steps finished (nothing is sent to an AI until you tap).
- One tap to **follow** the artist or the venue, so their next dates show up in your weekly list.
- From any chat: `/shows prep arlo parks`, `/shows went arlo parks: 5/5 the encore`, `/shows log`.
