# showsync61 (round 61): this week's Paris shows from Shotgun and DICE, on the quest map

The owner: "sync locations and their logos with Shotgun and DICE's announcement of weekly shows." The owner goes to
shows in Paris announced weekly on Shotgun and DICE and uses Sidequest Studio (Codex's quest journal + Paris map).

**What it does.** Once a day at most (or when asked), Hearth reads this week's Paris shows from Shotgun and DICE on
the owner's own computer, merges the two lists (the same night at the same venue is one show with both ticket links),
puts every venue on Sidequest Studio's Paris map as a pin wearing the venue's own picture, lists the week behind one
✦ icon in the map's existing icon row, and turns any show into a quest in one click: "Go see Arlo Parks at La Cigale
on Thursday" → Get your ticket → Go → Bring back one moment. The quest lives in Codex's quest store, so the
journal (and questhud61's tracker) show it with no extra wiring. Nothing runs while idle: no timer; a refresh happens
only when the Paris map or `/shows` is opened and the list is a day old.

## Upgrades

Shows
1. This week's shows in Paris from Shotgun and DICE, read from the owner's computer: title, date / time, venue name,
   address, coordinates, lineup, price, sold out, ticket links. `/shows`
2. Both platforms merged: the same night + venue + similar title (or a shared artist) is one show listing both
   platforms and both ticket links; a 2 am start counts as the night before.
3. The week day by day: `/shows week`.
4. A venue's coming nights: `/shows venue <name>` (and by clicking its pin).
5. Choose what Hearth reads: the Paris-wide lists plus any venue / artist / event page the owner follows
   (`/shows follow <Shotgun or DICE link>`, `/shows unfollow <name>`, `/shows from paris|followed`; also in the list's
   "What Hearth reads" dialog).
6. Refresh on demand: `/shows refresh` or "Refresh now" in the list (a page is still asked at most every 10 minutes).
7. One plain line when a source breaks (page changed, browser check, offline, robots.txt says no); the last good list
   stays on screen.

Map
8. Venue pins on Sidequest Studio's Paris map (Paris after hours), each wearing the venue's own picture (cached
   locally at 96 px); the owner's own places stay as they were.
9. Coordinates: the platform's own first; otherwise looked up once per address (OpenStreetMap Nominatim) and kept.
10. A venue pin opens that venue's coming nights with their logo, address, times.
11. "Shows this week" (✦) joins the map's existing icon row: the compact week list, grouped by day, logo + time + venue.
12. A show card: lineup, price / sold out, "Tickets on Shotgun / DICE" (opens the browser), "Make it a quest".

Quests
13. A show → a quest in one click ("Make it a quest") or from chat (`/shows quest <artist or show>`): "Go see X at Y
    on Friday" with three steps: Get your ticket → Go → Bring back one moment; the quest opens right away.
14. The same show never makes two quests (asking again resumes it).
15. Works with Sidequest Studio closed (same store, same validation as the journal's own saves; a journal that can't
    be read is never overwritten) and fires `hearth:quests` so trackers can refresh.
16. "Keep in my lineup" on a show card hands it to Codex's Outing desk (its lineup, budget, invitation, .ics) through
    its own `QuestJournal.keepOuting(event)` contract.

## How it fetches (main process, showsyncmain.js)
- robots.txt read once a day per site and obeyed (Hearth's agent or `*`; a 5xx / unreachable robots.txt = don't
  fetch, per RFC 9309); an honest user agent ("Hearth/61 (personal weekly show list; at most once a day per page)").
- `If-None-Match` / `If-Modified-Since` from the last answer; a 304 keeps the list.
- One request at a time per site, 1.5 s apart; at most 16 pages, 8 new geocodes (1.1 s apart) and 12 new logos per
  refresh; pages ≤ 6 MB, pictures ≤ 3 MB.
- A protection page (Cloudflare "Just a moment…", a captcha, 401/403/429/503, `cf-mitigated: challenge`) stops that
  site for a day: no retries, no workaround, no login, no browser automation.
- data/showsync/: cache.json (last good list per page + robots), geo.json, logos.json + logos/*.png, settings.json.
  Careful reads (datasafe-core: an unreadable file is never treated as empty or saved over), atomic writes
  (crashsafe-core).
- Parsing (showsync-core.js, pure, shared with the window): schema.org Event JSON-LD (Event / MusicEvent / DanceEvent
  / Festival… in @graph, ItemList, arrays), a venue page's own Place / Organization picture or og:image as its logo;
  fallback: a generic walk of a Next.js page's `__NEXT_DATA__` for event-shaped objects (title + start + venue).

## Tests
- `node dev/showsync-test.js` (unit, in UNIT): 43 checks on the saved sample responses in dev/fixtures/showsync: links,
  JSON-LD and Next.js parsing, entities, protection page, merge / dedupe across platforms, stable keys, the week,
  pins inside Paris only, robots.txt rules, the sync end to end with a fake fetch (robots once, user agent,
  geocode once, logos once, atomic files, once-a-day, 10-minute floor, conditional requests + 304, caches reused by a
  new instance), breaking sources (changed page, browser check + a day's pause, offline, robots deny), a damaged
  cache never saved over, follow / unfollow / from, and the show campaign accepted by `QuestCore.validate`.
- `dev/checks/showsync61.js` (app, fixtures through the `shows:test` IPC, no network): `/shows`, `/shows week`,
  `/shows venue`, logos cached, geocode, venue pins WITH logos on the Paris map (the owner's places still there),
  the venue dialog, the ✦ list (4 rows, day labels), show → quest by click (journal shows it, active) and by chat,
  no duplicate quest, a changed page → last good list + one line, nothing fetched while idle, completions.
- Group: `sh dev/run-checks.sh showsync61` (showsync61, unit:showsync-test, quest-world, quest-map-tiles,
  quest-field, lazy, unit:boot-test, unit:datasafe-scan, unit:winmac-test).

## For Codex
Touches of Codex files, all additive:
- `tools/quest-journal.js`: a **map layer** registry. `QuestJournal.addMapLayer({ id, icon(kit), pins(), owns(id),
  select(id, kit) })` — a layer's icon joins the world page's head icon row, its pins join `QuestAtlas.mount`'s
  places, a click on a pin it owns goes to `select`. `kit` = { dialog, mapIcon, button, p, label, E, mutate,
  questDetail, navigate, notice }. Also exported: `mutate(fn, message)` (the journal's own validated save) and
  `page` (getter). A layer that throws is skipped with a console warning.
- `tools/quest-atlas.js`: a place may carry `logo` (a local image URL): the pin shows it instead of the glyph
  (class `has-logo`, img `.qj-atlas-logo`; falls back to the glyph if the picture fails).
- Show quests are ordinary campaigns: id `c-show-<12 hex>`, quests `q-show-<key>-ticket|go|proof`, path `life`,
  subtitle 'PARIS / SHOW NIGHT', plus an extra `show` object { key, title, venue, address, start, url, platforms }
  that `validate` ignores (kept for trackers). They need proof + review like other quests.
- `lazy-data.js`: showsync-core.js / showsync.js / showsync.css ride in the `questjournal` group (after
  quest-journal.js), so the layer is registered before the map first renders.
- Your Paris outing desk (merged from main): a show card's "Keep in my lineup" calls `QuestJournal.keepOuting(event)`
  with your normalized shape (id `showsync-<key>`, kind 'music', start/end ISO with Z, free false, price text, lineup
  in note, lat/lon when inside Paris, source "Shotgun + DICE"). The show layer's icon is the `spark` glyph so it isn't
  confused with the desk's amber music icon in the same row.
Other shared files: main.js (one register line), preload.js (`hub.shows`), dev/run-checks.js (unit + group).

## Sources (what each platform allows, and what Hearth uses)
- **Shotgun** (shotgun.live): its Events / Tickets APIs exist but are for organizers (Smartboard → Settings →
  Integrations → Shotgun APIs: an Organizer ID + API token of the owner's *own* events), so they can't list Paris
  shows for a fan. No public RSS / ICS feed for a city was found. The public pages (city listings like
  `/en/concerts/paris`, venue pages `/…/venues/<slug>`, artist and event pages) are what search engines index.
  **Used:** those public pages' schema.org Event data, at most once a day, robots.txt obeyed. (Shotgun support:
  "Find your Organizer id and API token", support-pro.shotgun.live.)
- **DICE** (dice.fm): the embeddable event widget and the partner API need a DICE partner account (Partner ID + API
  key from MIO's Partner Tools) — a venue's or promoter's, not a fan's. Venue pages (`/venue/<slug>`) publish
  JSON-LD events (calendar aggregators such as PlaceCal import DICE venues that way); the Paris browse page is
  `/browse/paris-5b23e8a0e63cc224a4c36a2d`. **Used:** the public browse / venue / artist / event pages' JSON-LD (Next.js
  page data as a fallback), at most once a day, robots.txt obeyed. DICE sits behind Cloudflare: if it asks for a
  browser check, Hearth stops for the day and says so (no bypass, no login).
- **OpenStreetMap Nominatim** (geocoding only when the platform gives no coordinates): its usage policy allows light
  use with a real user agent, ≤ 1 request / s and caching: Hearth asks once per address, 1.1 s apart, keeps the answer.
- Not used: login-only pages (the owner's tickets / "following" on either app), private APIs, scraping services,
  headless browsers. Third-party scrapers (Apify actors etc.) exist for both; they were not used.
- Caveat: this sandbox couldn't reach shotgun.live or dice.fm, so the parser is built on the public schema.org shape
  and URL patterns found by search; the fixtures in dev/fixtures/showsync are hand-built to that shape, not copies of
  live pages. If a platform publishes no JSON-LD on a page, the Next.js fallback is tried, then the plain line
  ("…page changed…") shows and the last good list stays. Following specific venue pages is the most robust setup.

## For the patch notes
- New: this week's Paris shows from Shotgun and DICE, right on Sidequest Studio's Paris map. Each venue is a pin with
  its own logo; click it to see its nights.
- The ✦ (spark) icon next to the map's other icons opens the week's list (day by day, time, venue). Click a show for the
  lineup, price and ticket links.
- "Make it a quest" turns a show into "Go see X at Y on Friday": get your ticket → go → bring back one moment. It shows
  up in your quest journal right away.
- From any chat: `/shows`, `/shows week`, `/shows venue bataclan`, `/shows quest arlo parks`.
- Pick what it reads: the Paris-wide lists, plus the venues or artists you follow (paste a Shotgun or DICE link in
  "What Hearth reads", or `/shows follow <link>`).
- Polite and free: Hearth reads the public pages from your computer at most once a day, only when you look, and
  respects each site's rules. When a site changes or asks for a browser check, you see one line and keep the last
  good list.
