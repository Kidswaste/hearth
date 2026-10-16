# Astra update checks

Hearth checks engine installs at startup, after waking (one minute to settle), and about every 30 minutes while running. The background schedule slows when saving power. Focus triggers a check if the report expired; concurrent checks share one request.

Automatic engine selection prefers the newest working installed version, including alpha version ordering. Windows Codex desktop bundles must contain their tool host, command runner and sandbox setup helpers. Explicit executable pins stay pinned and are reported if incomplete. Existing replies are not interrupted or replayed; subsequent replies use the selected executable.

`/doctor` and `/astra-doctor` show the last check, installed versions, missing helpers and Astra's refreshed model catalog. Agent defaults are checked for model and reasoning support, including hidden catalog models. Catalog upgrade suggestions are shown for review. Individual chats may override agent defaults; `/astra-models` reads the current catalog before applying a choice to that chat. No model or reasoning setting is changed by monitoring.

Checks start no inference turns. A model listing is metadata, not proof of account entitlement or a successful inference. Failed catalog reads are reported as unavailable, never as up to date. Downloadable updates are owned by the Codex / Claude desktop updaters; this monitor checks installed copies, not remote desktop release eligibility, and does not install a different distribution.

Validation: `node dev/engine-watch-test.js`, `node dev/winpolish-test.js`, `node dev/codex-server-test.js`, `node dev/boot-test.js`. Protocol reference: https://learn.chatgpt.com/docs/app-server (model/list).
