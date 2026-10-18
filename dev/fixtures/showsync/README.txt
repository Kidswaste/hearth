showsync61 fixtures: sample responses for the weekly show sync (no network in tests).
Hand-built to the public shapes the platforms' pages publish (schema.org Event JSON-LD, a Next.js __NEXT_DATA__
page, a Cloudflare challenge page, robots.txt, a Nominatim answer); they are not copies of live pages.
{{D+n HH:MM}} in a file is replaced with today + n days at HH:MM (local time) when a test serves it, so
"this week" always has shows. responses.json maps each URL to its file / status / headers.
