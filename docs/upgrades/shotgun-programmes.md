# Shotgun nights when its main catalogue cannot load

Hearth also reads the public programmes at [Badaboum](https://badaboum.paris/agenda/), [Mia Mao](https://www.miamao.fr/agenda/) and [Glazart](https://www.glazart.com/agenda-concerts/). A night is included only when its venue page publishes an explicit date/time and an actual Shotgun event link. These are independent venue listings, not a complete Shotgun Paris feed. Prices and live ticket stock are not inferred; the ticket button opens Shotgun to check them.

Upcoming nights use the existing show map layer and quest workflow. The three venues get priority in the bounded, cached address lookup so a busy DICE feed cannot consume their entire geocoding budget. Programme pins have a pink/gold ticket icon when there is no cached venue logo. Event cards link to the source and show when it was checked; the list has a Shotgun-only filter.

The direct Shotgun source now points to its broad Paris city page instead of the concerts-only category. Existing cached concerts are preserved during migration. New sources mark an existing installation's snapshot stale so opening the map can discover them immediately, even if DICE refreshed recently. Followed-only mode excludes the built-in venue programmes as well as the city feeds.

## Fetching and failures

Robots rules, honest identification, 1.5-second spacing per host, ten-minute minimum source refresh gap and daily detail caching remain in place. Only three reviewed hosts and their event paths are fetched. Each host is sequential; independent venue hosts can load concurrently. At most 24 upcoming details per programme are considered, within 21 days. No browser automation, protection bypass, private API, cookies, account or key is needed.

Vercel checkpoint pages are recognized, including HTTP 200 variants. A blocked Shotgun host stays in its cooldown; independent venue websites remain available. Failed detail reads retain their last good event and original check date, with partial-source status. Events without a usable time are skipped. Paris local times are converted with Europe/Paris DST rules, including overnight endings. Existing direct ticket information wins over a programme's unknown availability when duplicates merge.

The source websites can still change. Hearth keeps last good listings, excludes expired shows, and exposes partial coverage rather than presenting those venues as the whole catalogue. First loading can take roughly a minute; later opens use the disk cache. Refresh is read-only and does not book tickets or message anyone.

## Verification

On 18 October 2026, a live isolated probe of the three venue sources recovered 28 upcoming Shotgun-linked shows, 12 within the next seven days, with all three venue coordinates resolved. Shotgun itself was left in cooldown after its 429 Vercel checkpoint; DICE was deliberately excluded from this probe, not diagnosed as unavailable. These counts are a snapshot, not bundled event data.

Focused tests cover current venue markup, explicit/unknown times, Paris DST, overnight dates, source allowlists, ticket attribution, cache restart, 304s, failures, robots refusal, migration and map pins. The isolated Electron flow checks ticket badges, venue-to-night navigation, provenance, a Shotgun ticket button, quest creation and the platform filter. Existing ShowSync and boot/lazy-loading checks remain part of validation.

Shotgun's [official widget documentation](https://support-pro.shotgun.live/hc/en-us/articles/360018503879-Embed-Shotgun-ticketing-on-your-website-with-the-widget) was reviewed. The accessible venue websites used here publish their own programme pages; this implementation does not claim a general fan catalogue API or partner access.
