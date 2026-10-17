# A focused quest desk

The current quest and route progress now lead the notebook. Session planning and the idea box sit beside one another; discovery invitations share a row further down. The original SVG desk menu stays, at a smaller height. Existing records, proof, friends, plans, XP, rewards and imported journal backups are preserved.

## Shelf and chat work

The shelf accepts an upload independently of finishing a quest, or a selected message from a Hearth chat. Chat entries retain a text snapshot, source-chat link and up to twelve local media references discovered from the message's `things`, attachments, image paths and Markdown links. Native user messages also retain non-image file paths in the bounded terminal `Attached files` block of their saved engine text; this block is parsed only when its file count matches attachment metadata. Remote URLs and network share paths are excluded. Uploads use the existing copied-proof import path. Neither action sends an AI request.

WAV and other supported audio formats get controls; images/textures render as images; supported video formats get a video player. Text/code files are read as text on demand, capped at 256 KiB; HTML/code is never executed. Missing/unsupported media exposes a source-file action. Removing a shelf entry leaves its source untouched. Linked chat media can stop working if the original file moves; the source chat remains available.

## Tangible treats

Rewards can have an explicit EUR price in addition to their spark cost. A user-chosen monthly envelope defaults to zero. Claiming a priced reward reserves its price in that calendar month and is blocked if it exceeds the remaining envelope. The receipt stores the price at claim time; editing a reward later cannot change that reservation. Returning a receipt restores its original month's amount. These are planning records, not earned cash, bank balances or actual payments.

Personal starting points include a Bandcamp discovery, coffee with Thomas or Ismaël, a sample-pack fund and a Toulouse travel pot. Suggested amounts are editable ideas, not live merchant prices.

## Paris field map

`QuestAtlas` is a dependency-free Web Mercator viewport. Opening the Paris page requests only the visible standard OpenStreetMap tiles; no map requests occur on app startup. Drag and keyboard arrows pan; plus/minus zoom. Double-click places a pin with coordinates. The page also has an accessible place list and coordinate form. Default pins are public Paris landmarks, not invented districts, private addresses or verified venue entrances.

Each pin has a personal mission. Turning it into a route uses the existing three proof-gated outing checkpoints. Repeatedly opening a route cannot add duplicate quests or XP. A manual visit stamp explicitly records the user's own report and awards no completion XP. This release does not use GPS or claim to verify attendance.

Tile errors leave local pins usable and show Retry street map. The map uses the exact HTTPS tile host, visible OpenStreetMap attribution, an application-specific User-Agent in main, and Chromium HTTP caching. There is no bulk download, prefetch or offline map archive. Policy reviewed: https://operations.osmfoundation.org/policies/tiles/ ; attribution: https://www.openstreetmap.org/copyright . The tile service has no availability guarantee.

## Validation

- Existing quest, world/social planning, workstation, proof review, life expedition and mixtape behavior suites pass.
- `dev/quest-focus-test.js` checks old-data migration, coordinate round trips, place routes/proof gates, monthly reservation/refund accounting, receipt immutability, media extraction and malformed backup rejection.
- `dev/checks/quest-focus.js` exercises the compact desk, custom place, visit stamp, proof route, priced reward, chat PNG/WAV collection, narrow layouts and real reload. Actual WAV metadata decodes through the native player; no sound is played and no model is called.
- Map tiles are replaced with explicit offline fixtures in automated UI checks. The harness does not crawl/pan/download real OSM tiles. Live tile service availability remains a user-visible runtime check.
- `dev/checks/quest-shelf-native.js` verifies an actual saved Native user-message attachment shape restores a WAV player, decodes duration and saves the source-linked collection entry.
- `dev/checks/quest-map-tiles.js` verifies no tile requests before opening Paris, bounded visible requests, stale-zoom cleanup, failed-tile hiding and a retry of precisely the current viewport against offline fixtures.

Design judgment: the journal should record a creative life inside Hearth rather than become another dashboard. The next action is now foremost, creations can return from chats to the shelf, and the real map returns an outing to the same evidence/review system. No new points currency or separate artifact store was introduced.
