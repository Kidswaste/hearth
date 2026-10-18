# Paris street-map access fix

The Paris map could display OpenStreetMap's 403 PNG instead of streets. `createWindow()` registered an OSM request-header listener, but `chromeguard.setup()` later registered Google's listener. Electron retains only the last listener per webRequest event, even when URL filters differ. Hearth's intended tile identification therefore never reached OSM.

The shared session hook in `chromeguard.js` now handles both services. Exact HTTPS tile-host requests carry the stable native identity `Hearth/1.0 (+https://github.com/Kidswaste/hearth)`, without conflicting browser client hints. Google's existing hints remain unchanged. No invented Referer, cache bypass, alternate tile host, proxy, or prefetch is introduced.

The tile-only response hook cancels HTTP errors before Chromium can decode their PNG bodies, including errors already in its HTTP cache. The map keeps saved pins usable and displays an unavailable/access-blocked message with a manual retry. Successful tiles and cache validators are preserved.

## Validation

- `node dev/map-session-test.js`: shared listener lifecycle, URL filters, exact-host identity, unchanged Google hints, unchanged cache validators, and status handling (200/304/403/429/500).
- `electron dev/map-network-test.js`: hidden isolated profile and localhost fixtures. Reproduces a 403 PNG painting before the fix, then checks that the cached error cannot paint in a fresh renderer; verifies successful tiles still use Chromium's cache, actual outgoing identification, Google hints, and 429 cancellation. No traffic goes to OSM or Google.
- `node dev/chrome-test.js`, `node dev/boot-test.js`.
- `dev/smoke.js --script dev/checks/quest-map-tiles.js`: isolated Hearth UI, visible-viewport bounds, lazy loading, failed-image hiding, retry, and zoom cleanup; no live tile requests.

## Claude handoff

Merge through the normal main/updater path. This changes Electron's main process, so it needs the updater's managed relaunch; a renderer-only refresh cannot install the new session hooks. Do not clear the user's cache or data. Once the update is active, open Paris and use Retry street map if needed. Live OSM acceptance is not established by local fixtures; if access is still blocked, inspect the response and deployment version instead of rotating identity or switching hosts to bypass the block.

References: [Electron listener behavior](https://www.electronjs.org/docs/latest/api/web-request), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
