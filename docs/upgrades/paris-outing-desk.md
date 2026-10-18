# Paris outing desk

Open Sidequest → Paris map → the amber music icon, “Outing desk · events & my lineup.” This adds a compact event notebook alongside the map. It complements Claude's Shotgun/DICE feed, permanent Paris destinations and global quest tracker.

## Nine additions

1. **Official cultural event discovery:** an explicit refresh reads the next 30 days from Ville de Paris's Que faire à Paris open-data API. Two bounded requests cover upcoming and already-running events, at most 200 source records. This includes exhibitions, workshops, games and walks as well as music. It is a selection, not exhaustive coverage. Source tags drive approximate creative lanes.
2. **Twelve programme gateways:** Paris, Philharmonie (including its free-events selection), CENTQUATRE, FGO-Barbara, Le Hasard Ludique, Forum des images, Palais de Tokyo, Paris Musées, La Villette, Agenda Grand Paris and Paris leisure. These open official programmes; Hearth does not scrape these sites or invent scheduled performances.
3. **A quiet discovery grid:** sound/visual/play/learn/wander icons, search, seven/thirty-day windows, free-admission filter and twelve cards at a time. Reservations can still be required for free events. Ongoing exhibitions show their end date rather than masquerading as a single performance.
4. **A personal lineup and link notebook:** save discoveries or keep an HTTPS event link, edit personal events, choose Maybe/Planning to go/Parked, add a friend and fallback, and record when you personally checked the source. Event snapshots survive feed refreshes and outages.
5. **An outing cost planner:** separate ticket/travel/extras estimates and a user-defined total ceiling. Only Planning to go contributes. Blank amounts remain unknown, never free. This neither charges money nor modifies the reward wallet.
6. **Schedule checks and calendar files:** published sessions can seed a personal visit window; manually choose your own window for a long-running exhibition. Overlaps with other planned outings are flagged. Export one or all planned visits as tentative `.ics` events with stable UIDs, UTC timestamps and folded/escaped text. Input uses computer-local time, published sessions display Paris time. Calendar import remains the user's action.
7. **Low-pressure invitation drafts:** choose a nickname from existing friends or type one; preview/edit/copy an invitation. No model call, messaging permission or automatic send is involved.
8. **Event venues on the existing map:** explicitly pin a venue, reusing nearby pins and retaining the current place capacity and geographic bounds. No new tile fetching strategy or geolocation service.
9. **Five take-home creative quests:** a short original demo, palette/texture, tiny Forgeheart prop/interaction, three-shot storyboard or concrete field note. A stable event ID creates one campaign, with a frozen accepted scope. The existing proof, review and XP rules apply; saving, booking or accepting an event gives no XP.

The interface uses existing Sidequest glyphs, hover/focus tooltips, glass surfaces and Forgeheart colors. Primary verbs remain labeled. Nested dialog errors now appear in the topmost dialog.

## Data, sources and limits

The new local KV key is `sidequest-outings-v1`. Only an explicit pin or quest action writes through QuestJournal's serialized, validated journal mutation. There is no schema change to the main journal, no background polling and no subscription. One refresh cannot overlap another, successful refreshes have a 15-minute cooldown, and failed/invalid/timeout responses preserve the prior cache. Cached lists older than 24 hours say refresh recommended. Only metadata is downloaded; remote posters and logos are not fetched.

Public data: [Ville de Paris — Que faire à Paris dataset](https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/), [API](https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records), [ODbL](https://opendatacommons.org/licenses/odbl/). Attribution and the dataset link remain in the discovery view. API fields/schema/license checked on 18 October 2026; a live two-request probe returned 197 usable Paris-area records from 200 records. This is a one-time availability check, not a guarantee of listing completeness, venue hours, ticket availability or future API uptime. The source's date offsets are retained; users should recheck the event page before travel or purchase. Source HTML is never rendered, and unsafe or credential-bearing links are rejected.

The two requests use the existing `hub.fetchText` path to avoid adding a CSP exception or new IPC API. The UI stops waiting after 20 seconds and ignores any late response; the existing transport itself does not expose cancellation. There are no retries. Programme links are not additional automated feed adapters.

## Claude integration contract

Scope is new `tools/outing-core.js`, `tools/outing-desk.js`, `tools/outing-desk.css`; two files and CSS appended to the existing questjournal lazy group; small map entry, quest/pin bridge, nested-dialog error routing and refresh glyph. No audio, tracker, `/shows`, default Paris-place catalogue or Shotgun/DICE files are changed. There are no new rail tools or command registrations, so the lazy metadata remains unchanged.

After loading `questjournal` and mounting Sidequest, `QuestJournal.openOutings()` opens the notebook. To let a show card save into it, call `QuestJournal.keepOuting(event)` on explicit user action. Or use `await OutingDesk.keepEvent(event)` to save without opening, then show your own confirmation. This is an integration hook; this branch does not claim the not-yet-shared show feed has been wired up.

Normalized input: `{id, title, url, venue, address, kind, start, end, sessions:[{start,end}], dateNote, free, price, note, lat, lon, source, updatedAt}`. `id` is a stable provider-prefixed alphanumeric/hyphen/underscore ID (keep under 70 characters to leave room for journal prefixes); `kind` is `music|visual|game|learn|wander`; timestamps include `Z` or an explicit offset; `free` must be a boolean; only label something free when the source explicitly says so. Unavailable optional values can be omitted. Coordinates are optional and only usable within the existing Paris map bounds. Keep the source URL/provenance; do not insert guessed prices or performances. Duplicate IDs reuse an existing saved plan. Repeated quest creation reuses the accepted campaign.

## Validation

- `node dev/outing-test.js`: source filtering/deduplication, date offsets, unsafe URLs, money/unknown costs, overlaps, state round-trip, ICS escaping/UTF-8 folding, five campaign scopes and existing proof/XP gates.
- `dev/checks/outing-desk.js`: 75 checks in isolated Electron, offline map and API fixtures, last-good cache, bounded requests/cooldown, filters/pagination, saved plans, free €0 preservation, topmost-dialog validation, keyboard hints, budgets, invitations, `.ics` save, conflicts, map pin, creative quest, narrow layouts, screenshots and actual reload.
- Existing field/world regressions, all 230 Sidequest icon/dialog UI checks, boot/lazy budgets and full lazy-registration parity.
- The live API probe and an isolated Electron run through the actual IPC transport both returned 197 usable records. The live checks only read public metadata. UI tests use a throwaway profile and never touch the user's journal or contact friends.

Claude retains main merge and normal updater release ownership. No live app restart or main push by this branch.
