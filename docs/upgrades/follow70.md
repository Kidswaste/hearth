# follow70 (round 70): ★ Follow artists and venues

The owner finds Paris shows on Shotgun and DICE. showsync61 lists them, showprep62 keeps "Shows I went to", invite67
helps bring a friend and tickets68 keeps the ticket. This stream lets him **follow the artists and venues he likes**.
When the show sync brings in a new show with one of them, the ✦ quest tracker says so, and that show gets a ★ on the map
and in the list. Following only looks at the shows Hearth already reads, at the sync's usual pace (once a day, when you
look). Nothing extra is fetched, there's no new timer, nothing is uploaded and no AI is used.

## Upgrades

Following, by clicking
1. **★ Follow <artist>** on every show card, one button for each artist in the lineup ("Ben UFO b2b Joy Orbison" gives
   two buttons). Click it again (**★ Following <artist>**, in gold) to unfollow. Find it under Sidequest Studio › Map ›
   ✦ Shows this week → a show, and on a venue pin's next show.
2. **★ Follow <venue>** on the same cards.
3. **★ Following** in the ✦ Shows this week list, next to Shows I went to / What Hearth reads. Its label shows how many
   you follow and how many new shows there are ("★ Following · 4 · 1 new").
4. **The Following list** (that button). It shows who you follow, artist or venue, how many shows are coming up, and the
   next one (click it to open its card), with an **Unfollow** button on each.
5. **Suggestions from Shows I went to.** Artists and venues you went to on **two nights or more** show up with a
   one-click **★ Follow** button ("Floating Points · artist · you went 2×"). They go away once you follow them.
6. **Follow by name**: type any artist or venue, choose Artist or Venue, then click **★ Follow** (or press Enter). A typed
   name takes the listing's spelling when that artist or venue is listed ("cigale" becomes "La Cigale").
7. Following someone already in the list gives a short note ("★ Following Call Super · 1 show already listed"). Those
   shows get their ★ straight away, but they don't count as "new".

When a new show comes in
8. **★ New rows in the ✦ quest tracker**, for example "★ New: Call Super at Petit Bain, Sat 14 Nov". Under the artist
   line you see the show's own title, or "At a venue you follow". Any date ahead counts, as far as the source lists
   it (up to six months for venue programmes).
9. **Make it a quest** on that row creates the usual show quest ("Go see … at …": ticket → go → one moment).
10. **Bring someone** on that row opens invite67's invite card for that show. It only writes a draft and never sends.
11. **Dismiss** on that row hides it. You still follow the artist or venue.
12. **A small ★ on the ✦ chip** in the rail while there are new shows, and its tooltip says "★ 2 new shows from artists /
    venues you follow".
13. More than three new shows: a **★ N more new shows · Following…** row opens the Following list, which also has the new
    shows with the same three buttons.

The ★ badges
14. **★ in the week's list** on every show with someone you follow. Hovering it, or a screen reader, says who.
15. **★ on the Paris map**: a venue pin with a show from someone you follow wears the map's own ★ and stays visible at
    every zoom.

Matching that forgives spelling
16. Case and accents ("ROSALIA" = "Rosalía", "Røyksopp"), "DJ Koze" = "Koze", "The Blaze" = "Blaze", "(DJ set)",
    "(live)", "– Live", "& / and".
17. A lineup line holding several artists is split on b2b, B2B, feat., ft, featuring, x, vs, with, w/, commas, "+" and "/",
    so "Joy Orbison" is found in "Ben UFO b2b Joy Orbison". A band name with "&" still matches as a whole.
18. With no lineup, the title's named parts are used ("Rinse Paris: Sherelle + Nia Archives"). A title that starts with
    the name also counts ("Floating Points all night long").
19. Venues ignore "Le / La / Les / L'", "Paris" and "Club" ("Rex Club" = "Rex", "Le Bataclan" = "BATACLAN"), and a
    shorter listing name still matches ("La Machine" for "La Machine du Moulin Rouge").
20. No false matches. A 3-letter name only matches a whole lineup name. One word in the middle of a title or inside
    another name doesn't count ("Points" never matches "Floating Points"). A venue you follow never matches a lineup.

Chat (secondary)
21. `/shows following` lists who you follow and what's new. `/shows follow <name>` follows an artist or venue by name (a
    Shotgun / DICE link still follows a page, as before). `/shows unfollow <name>` stops it.

## How it's built
- `follow-core.js` (pure UMD, Node + window):
  - `norm` / `parts` / `venueKey` for names
  - `hits(store, show)` (who matched), `cardArtists(show)` (the card's buttons)
  - `follow` (shows already listed are marked known, so they're not "new"), `unfollow`
  - `detect` (after a sync: unknown shows with a hit become news), `pending`, `mark` (dismiss / quest)
  - `suggest(wentLog, store)` (two nights or more)
  - `dateWords` (Paris time, whatever the computer's zone)
  - `validate` (a damaged store throws and is never read as empty) and `merge` (per follow and per news row, the newer
    change wins; an unfollow is a change)
- `follow.js` + `follow.css`: lazy group **`follow`** (tier use).
  - The store is kv **`show-follows`** { v, follows, known, news }. It's read with `{ status: true }`, and every save is
    merged with what's on disk; a store that can't be read is never saved over.
  - `detect` first does a dry run on a copy, so it writes only when something is new.
  - The ★ New buttons: Make it a quest loads `questjournal` and calls `ShowSync.makeQuest`; Bring someone calls
    `Invite.open(show, { from: 'follow' })`.
  - The Following dialog.
  - Every change is announced on `document` as `hearth:follows` { pending, follows }.
- `follow-hook.js` (in the `questjournal` group, after tickets-hook; `questjournal` now has `after: ['questcore',
  'follow']`). It makes one `ShowSync.extend({ card, row, pins, list, shows, subs, quiet, run, complete })`.
- Small additive edits to other files:
  - `showsync.js` gets three extension points, so no other module changes it:
    - `each('shows', snap)` after its own load / refresh: the only trigger for ★ New
    - `each('row', kit, show, button)` on each list row
    - `x.quiet` hides internal sub-commands from completion
  - `showsync.js` also hands `/shows follow <name>` (not a link) and `/shows unfollow <name>` (not a followed page) to
    follow70, and adds one HELP line.
  - `questhud.js`: `loadFollows()` does one small kv read at start, when the panel opens and after `hearth:follows`. It
    adds the ★ New rows (`followRows`) and the chip's ★ mark and tooltip line.
  - `questhud.css`: the chip's ★ (one rule).
  - `lazy-data.js`: the `follow` group, the hook in `questjournal`, and the regenerated META.
  - `index.html`: `follow` added to the `lazy-at.js#…` tag.
  - `dev/run-checks.js`: the unit test and a `follow70` group.
- First-screen cost: nothing new loads before the first frame except the lazy-data.js lines. The first screen is
  **2345 KB of its 2345 KB budget**; the base was already at 2345.2 KB, so the next stream that touches lazy-data.js
  will need room. No idle cost: no timer, no polling, no watcher.

## For Codex
- **No Codex file was edited.**
- The ★ on venue pins uses your atlas's existing `favorite` field on a layer pin (quest-atlas.js draws `.qj-pin-star`;
  quest-mapfirst.js already keeps favorites visible). The flag is set only on showsync's layer pins, never on your
  `state.atlas.places`, so the map's "Favorites" filter is unchanged.
- Show quests made from a ★ New row are showsync61's ordinary `c-show-<key>` campaigns, created through its own
  `makeQuest`: `QuestJournal.mutate` when the Studio is open, your validate → save steps otherwise.

## Tests
- `node dev/follow70-test.js` (unit, in UNIT): 19 checks. It also passes under TZ=America/Los_Angeles and Asia/Tokyo.
  - names, the split separators, venue keys
  - lineup matches in every spelling, title-only listings, false friends, venues
  - the card's buttons
  - shows already listed are not "new"; a later sync's show is news, at any date
  - past / cancelled / dismissed / made-a-quest shows
  - unfollow and follow again
  - a damaged store is refused, and `merge` keeps the newer change
  - suggestions (removed nights not counted)
  - Paris dates (summer time, a 00:30 start)
  - showsync61's own fixture listings
- `dev/checks/follow70.js` (app, throwaway profile, offline): showsync61's saved sample shows through `shows:test`, a
  seeded Shows I went to log, and one new fixture, `dev/fixtures/showsync/follow70-dice-paris.html`: the DICE page as a
  later sync sees it, with two new shows. By clicking:
  - the follow code isn't loaded at first
  - the shows list's ★ Following → the suggestions (Floating Points and Petit Bain, not the one-night ones) → ★ Follow ×2 →
    Follow by name ("cigale" saved as "La Cigale", 1 coming up); nothing counts as new
  - a show card's three labelled buttons → "★ Following Call Super" (pressed) and the note
  - the ★ on the right rows only; the venue pins with ★ (La Machine, La Cigale; not Bataclan / Trabendo), drawn on the
    map; following fetched nothing (the sync's page count is unchanged)
  - **Refresh now** with the new fixture page → two news rows: Call Super in a b2b 18 days ahead, and a new night at La
    Cigale, worded "Call Super at Petit Bain, Sat 14 Nov"
  - the ✦ tracker's two ★ New rows with their three buttons, the chip's ★ and tooltip
  - Dismiss; Bring someone (the invite card with the venue and the ticket link); Make it a quest (the journal validates);
    no rows left, and the chip's ★ goes
  - Unfollow in the list; the card's button unfollows too
  - chat follow / following / unfollow
  - zero AI calls
  - Screenshots were checked by eye: the card, the Following list, the tracker.
- **Results:** follow70, unit:follow70-test, showsync61, invite67, tickets68, lazy, unit:boot-test, showprep62,
  weekendplan66, questhud61, unit:showsync-test, unit:showprep-test, unit:questhud-test, unit:datasafe-scan,
  unit:winmac-test, unit:errorcalm-scan and unit:commandonly-scan all pass.

## Risks
- **Matching is by name only.** Two different artists with the same name both match. A one-word venue you follow can
  match a longer venue name that contains it. Unfollow fixes either case.
- **"New" means new to Hearth's list.** A show the sources listed before you followed someone counts as already known
  (it gets its ★ but no tracker row). How far ahead you hear about shows depends on the source: about three weeks for
  the city lists, up to six months for venue programmes.

## For the patch notes
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
