# weekquest62 (round 62): a weekly quest rhythm

The owner wants to actually go out and do their quests. This stream gives the quests a weekly rhythm: plan the week
on Sunday evening (or any time), get one gentle nudge on a planned day if you want it, and look back at the week on
Sunday. It is built on Codex's quest journal (Sidequest Studio), questhud61's ✦ tracker, showsync61's shows and
parisquests61's places and personal quests. There is no second store, and nothing runs while idle except the one
nudge timer, which only exists after you turn nudges on.

## What shipped

**Plan my week** (`/quest week`, or right-click the ✦ chip › Plan my week…)
1. A small card beside the rail, in the tracker's own look, with the week's 7 days as a strip. Past days are dimmed
   and today is outlined.
2. It proposes 3–5 quests drawn from what already exists, with at most two of a kind:
   - this week's shows still ahead, from showsync61's cached list (nothing is fetched; a 1 am start counts as the
     night before)
   - a Paris place you haven't visited, close to where you'll be: within 3 km of that night's venue, on the show's
     day ("600 m from La Cigale: before the show"), or near your "near you" spot. The venue itself is never proposed.
   - personal quests still open (AirPods, the drink offer…) and real-life campaigns you've started
   - Make music at the park on the best dry, mild day of the forecast, preferring the weekend
3. The forecast comes from Open-Meteo (free, no key, no account). It is asked only when the card opens, at most once
   every 3 hours, with 5 s to answer. If it doesn't answer, the park session is proposed for a weekend afternoon
   ("No forecast reached Hearth: pick a dry afternoon"). In a wet week it isn't proposed at all.
4. **Accept** puts a quest on its proposed day. **Accept all** does every proposal at once.
5. **Drag** a proposal onto any day to plan it there. Drag a planned quest to another day to move it.
6. Right-click a planned quest for Move to › (a day), Follow it in the ✦ chip now, or Take it off the week (the quest
   itself stays in your journal). Clicking a planned quest makes the chip follow it.
7. Accepting makes a real quest with its owner's own rules: a show becomes showsync61's "Go see X at Y" campaign, a
   place becomes parisquests61's go → do → proof quest (or Codex's own map route), and the park and personal quests
   become parisquests61's. XP still comes only after proof and review.
8. Planning never changes the main quest you track.
9. **Suggest more** (in the card's foot or ⋯) is the only AI call, and only when you click it. It sends one tiny
   question (under 420 characters) to your Claude at a low effort and turns the answer into three more ideas. An
   accepted idea becomes a one-step quest of your own. The card shows how many tokens it used.

**Today's quest on the ✦ chip**
10. On a planned day, the ✦ chip follows that day's quest (the campaign's next step: the ticket before the night, then
    "go" on the night). Its label says "Today's quest:" and the peek says "Today". A quest you pinned yourself still
    comes first.

**One gentle nudge** (off by default)
11. "Nudge me on planned days at [18:00]" is one line in the week card. Tick it to turn nudges on, and pick a time
    from 07:00 to 22:00. Chat: `/quest week nudge on`, `/quest week nudge 18:30`, `/quest week nudge off`.
12. You get one notification on a planned day that still has an open quest ("✦ Today: Go see … · Pick the time you
    leave home"). It goes through Hearth's desktop notifications, so your computer's Focus / Do Not Disturb holds it,
    and the "Desktop notifications" switch turned off means no nudge. When Hearth is in front, it's a small toast
    with a Tracker button instead.
13. Never more than once a day: the day is written into the journal, so a second computer that syncs it stays quiet
    too. If Hearth opens up to 2 h after the time (it was closed or asleep), you still get that day's nudge once.
14. Exactly one timer exists, and only while nudges are on and a planned day is ahead. It isn't re-made when nothing
    changed, and it's cleared when you turn nudges off.

**Sunday evening**
15. On Sunday from 17:00, when Hearth opens or comes back to the front and next week has no plan yet, one quiet offer
    appears: "Plan next week's quests?" with a Plan my week button. It shows once per week, through Hints (so "Don't
    show tips" silences it). It only checks at those two moments, with no timer.

**Week in review** (`/quest review`, or right-click the ✦ chip › Week in review…)
16. Three numbers: quests done, XP earned this week (a small start counts its 5 XP in the week it was made), and the
    streak of weeks in a row with at least one real-life quest done (shows, Paris places, personal quests, outings,
    life expeditions). If this week has none yet, it says the streak is waiting.
17. What got done, each with its day and XP and a ☀ when it was out in the world, plus "Planned: 2 of 4 done".
18. The moments you kept this week: proofs you submitted (their photo when there is one, or the note), files attached
    to finished quests, and things added to your shelf.
19. A one-line reflection prompt (8 gentle ones that rotate by week) with a text box.
20. **Save to journal** keeps the week as a page. It shows in Sidequest Studio › Collection › Week pages, newest
    first, with your reflection. Saving again replaces that week's page and keeps your line.
21. Chat: `/quest review` (the one-line summary plus Save to journal), `/quest review last` (the week before),
    `/quest review save <your line>`.

**More chat words** (all through the tracker's one `/quest`)
22. `/quest week accept` (or `accept 2`) accepts the proposals, `/quest week clear` clears this week's plan,
    `/quest week suggest` asks the AI for more. Typing suggestions list `week` and `review`.

## How it works
- `weekquest-core.js` (no DOM, node-tested): `planWeek` (Sunday plans the coming week, other days plan the rest of
  this week), `candidates` / `propose`, `accept` / `move` / `drop` with makers passed in, `nextNudge`, `review` /
  `saveReview` / `reviewLine`, the "suggest more" prompt and reader, and `checkWeekly` (the shape of `s.weekly`,
  checked before every save).
- Data lives in Codex's journal at `s.weekly = { v: 1, plans: [{ week, at, items: [{ id, kind, title, why, day,
  campaign | quest }] }] (≤ 12 weeks, ≤ 7 items each), reviews: [...] (≤ 104), nudge: { on, time, last } }`.
  `QuestCore.validate` keeps extra fields as they are, and `checkWeekly` guards this one.
- Writes go through `QuestHud.write`: `QuestJournal.mutate` when the Studio is open, otherwise the Studio's own
  read → validate → change → validate → atomic `kvSet`, announced with `hearth:quests`. A read that fails is never
  treated as empty.
- `weekquest-nudge.js` rides in the tracker's lazy group, so it loads after the first screen. It arms the one timer,
  makes the Sunday offer and renders the Studio's week pages. `weekquest.js` + `weekquest.css` (the card and the
  review) are a 'use' lazy group, loaded on first use.
- `weekquestmain.js` handles the forecast (`hub.weekquest.weather`). The window's CSP doesn't allow outside fetches,
  so the forecast is fetched from the main process.

## Tests
- `node dev/weekquest-test.js` (unit, in UNIT, 13 checks; fixtures in `dev/fixtures/weekquest`: shows and a forecast,
  relative to the test's Monday):
  - which week; shows ahead only (past, cancelled and next-week shows left out; 1 am counts as the night before)
  - a place near the venue but not the venue itself; visited places never proposed
  - open personal quests; the park on the best dry day, none in a wet week, the weekend with no forecast
  - 3–5 picks, ≤ 2 per kind
  - accept → real campaigns that pass `QuestCore.validate`, with the main quest kept; move / drop; an AI idea becomes
    a one-step quest
  - the chip follows today's plan, a pinned quest still wins, another day's plan leaves it alone
  - the nudge: off by default, its time, once a day, late within 2 h, 07–22 only
  - the review: XP, a streak across weeks, moments from proofs and artifacts, saved once with the reflection kept
  - the AI prompt and reader; a damaged plan refused
  - the forecast's shape, cache and offline answer
- `dev/checks/weekquest62.js` (app, 30 steps):
  - with nudges off, no timer even after a journal change, and the card's code isn't loaded until used
  - `/quest week`: a card beside the rail, 3–5 proposals (show, place near it, personal, park), the plan in the chat
  - Accept → the show's night, on disk, with the main quest kept; drag a proposal onto a day; drag a chip to another
    day; the journal still valid
  - the ✦ chip says "Today's quest:"
  - nudge switch off → on in the card → exactly one timer, and repeated journal changes don't stack timers; it fires
    once through the notification recorder, never twice a day, and turning it off clears the timer
  - `/quest review`: stats, the plan line, the proof moment, the prompt; Save to journal → a week page on disk → shown
    in Studio › Collection
  - idle afterwards: no timers, and no AI asked
  - Screenshots: `weekquest-card.png` and `weekquest-review.png` in the run's tmp folder.
- Group: `sh dev/run-checks.sh weekquest62` (weekquest62, unit:weekquest-test, unit:questhud-test, questhud61,
  showsync61, quest-paris, lazy, unit:boot-test, unit:winmac-test).
- Results (under `flock /tmp/hearth-run.lock`): weekquest62, questhud61, showsync61, quest-paris, lazy,
  unit:boot-test, unit:winmac-test, unit:weekquest-test, unit:questhud-test, unit:quest-paris-test,
  unit:showsync-test and unit:datasafe-scan all pass. `node dev/lazy-manifest.js` was regenerated.
  unit:errorcalm-scan still lists 7 earlier lines in Codex's tools/quest-journal.js and tools/outing-desk.js; none
  of them are from this stream.

## Changes outside my files
- `questhud-core.js` / `questhud.js` (questhud61):
  - `planned()`: today's plan comes before the main quest, after a pin. The card gets `today`.
  - `week` / `review` added to SUBS and dispatched to `WeekQuest.run`.
  - Two right-click menu items, the chip's "Today's quest" label, typing hints.
  - `QuestHud.write` / `journal()` / `core` exported.
  - Arms the nudge after its first read.
- `tools/quest-journal.js` (Codex): one line in `collection()` appends `WeekNudge.pages(...)` (Week pages). Nothing
  shows without saved reviews.
- `lazy-data.js` (+ regenerated `lazy-meta.js`): `weekquest-core.js` / `weekquest-nudge.js` join the `questhud`
  group, plus the new `weekquest` group. `index.html`: `weekquest` in the lazy-at tag.
- `main.js`: one register line. `preload.js`: `hub.weekquest.weather`. `dev/run-checks.js`: the unit test and the
  group.

## For Codex
- **New journal field `s.weekly`** (see How it works). `validate` passes it through untouched today. If you ever
  make `validate` strict about unknown keys, keep `weekly` (or call `WeekQuestCore.checkWeekly(s.weekly)`). An
  import or restore replaces it with the backup's copy, which is fine.
- Plan items point at campaign ids (`c-show-*`, `c-pp-*`, `c-pq-*`, `c-world-outing-*`, custom `c-*`) or quest ids.
  Renaming or removing a campaign just drops it from "today": nothing breaks, and the item stays until the week rolls
  off (12 weeks kept).
- "Real-life" for the streak means a campaign with path `life`, an id starting `c-show-` / `c-pp-` / `c-pq-` /
  `c-world-outing-`, or `mapPlace` / `parisPlace`. If you add a new outdoor family, `lifeCampaign()` in
  weekquest-core.js is the one place to teach it.
- The review reads `records[].completedAt / startedAt / artifact`, `submissions[qid][].{at, proof.title, proof.images,
  proof.excerpt, intent}` and `collection[].{at, title, proof}`. It never writes them.
- Accepting uses `ShowSyncCore.showCampaign`, `QuestParis.startPlace` / `startPersonal`, `QuestCore.placeQuest` and
  `QuestCore.addCampaign` (for AI ideas), then puts `s.active` back to what it was.
- The Studio hook: `collection()` → `WeekNudge.pages({ E, label, p }, state)` returns a `<details class="qj-fold
  wq-pages">` of `qj-card qj-keepsake` articles, or null.

## Risks
- Shows come from showsync61's cache only. If the owner never opened the map or `/shows` this week, no show is
  proposed (the card says so when there is nothing to propose). Asking the card to refresh would cost a network round
  on every open, which was left out.
- The nudge timer lives in the window. If Hearth is closed at the nudge time and opened more than 2 h later, that
  day's nudge is skipped (on purpose: no catch-up storms).
- Sunday's offer goes through Hints, so "Don't show tips" also hides it. `/quest week` always works.

## For the patch notes
- **Plan your week of quests**: right-click the ✦ quest chip › Plan my week… (or `/quest week`). Hearth proposes 3–5
  quests from this week's shows, Paris places near where you'll be, your open personal quests and a park session on
  a dry day. Accept one, or drag it onto any day.
- On a planned day, the ✦ chip shows that day's quest ("Today's quest").
- **One gentle nudge** if you want it: tick "Nudge me on planned days" in the week card and pick a time. It sends one
  notification on a planned day, never more than once a day, and respects your computer's Focus / Do Not Disturb.
  It's off until you turn it on.
- **Week in review**: right-click the ✦ chip › Week in review… (or `/quest review`). See what you did, the XP, your
  streak of weeks with a real-life quest and the moments you kept, then write one line and save it as a page in
  Sidequest Studio › Collection.
- On Sunday evening Hearth offers once to plan the coming week.
- "Suggest more" in the week card asks your AI for three more ideas. It's the only part that uses tokens, and only
  when you click it.
- The weather comes from a free forecast. If it can't be reached, the park session is simply proposed for the
  weekend.
