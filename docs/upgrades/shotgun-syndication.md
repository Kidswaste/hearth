# Rex, Phantom and Paris-only Madame Loyal

Opening Rex or Phantom on the Paris map now lists real upcoming nights, with calendar dates, published coordinates, ticket links and the existing quest/lineup actions. The requested favourites look ahead 180 days; other feeds keep their three-week limit. Pins stay grouped by venue and labels still wait for close zoom. A Paris-area Madame Loyal event gets a pin at its published location, never a fixed promoter location or an out-of-town substitute.

## Data source

- Shotgun's public OpenAgenda agenda: UID `9969608`.
- [Public events dataset](https://public.opendatasoft.com/explore/dataset/evenements-publics-openagenda/) distributed by Huwise under Licence Ouverte v1.0.
- [Documented Explore API v2.1](https://developer.huwise.com/apis/explore/v2.1/index.html): a public data API for HTTP clients, no account or API key needed for this dataset. This API client is separate from HTML crawling; HTML source readers retain their existing robots checks. No access challenges are bypassed.
- Select only public event fields, then require the Shotgun agenda, target name, explicit scheduled status, valid timing, Paris-area coordinates and a real Shotgun event/festival ticket URL. Unrelated similarly named venues and Madame Loyale theatre listings are excluded.

Card attribution distinguishes our check time from the source's update time. Syndication can lag, coverage is partial, and price/stock are not inferred. A direct ticket-platform result takes precedence when both supply a night.

## Refresh and compatibility

Three built-in syndicated sources replace the three blocked default venue-page readers; explicit user follows and the 14-follow limit remain. New source IDs trigger refresh on existing installations. Followed-only opt-out remains respected.

Refresh on map/show use, normally every 20 hours, at least 10 minutes even when manually requested. Requests are sequential with the existing host throttle; at most three pages of 100 records per target. 401/403/429/503 stop this API host for 24 hours. Redirects are refused. Schema/network failures retain the last good data and original check time; a validated complete empty result clears unpublished/cancelled dates. A truncated result retains older records and reports partial coverage.

No settings, chat data, quest history or live installation files are rewritten by this release. Normal Hearth updater delivery; the new main-process module requires its managed restart.

## Validation, 18 October 2026

Live adapter refresh on a temporary data directory recovered 11 upcoming Rex Club nights and 12 Phantom Paris nights, with both venue pins resolved from published coordinates. Madame Loyal returned Rennes only, correctly excluded per Quentin's Paris-only preference. No future Paris date is claimed. The interface explicitly explains a successful empty Paris result.

The actual captured responses also passed an isolated Electron pin → venue list → event card check. Synthetic fixtures cover a future Paris Madame Loyal festival, out-of-town exclusion, 45-day Phantom lookahead, quest creation, calendar-date labels, changed schemas, cancellation/removal, bounded pagination, cooldown and restart/offline cache retention. Existing ShowSync/programme/show-preparation, boot/lazy and quiet-map regression checks pass.

Commands: `node dev/showsync-syndicated-test.js`; isolated Electron `dev/checks/shotgun-syndicated.js`. All fixture event names are labelled Fixture and never reach the real profile.
