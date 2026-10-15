# Astra integrations — round 47

Ownership: Codex owns this Astra integration batch; Claude owns general Hearth, Lab and usage work. Developed in `codex/astra-integrations`, merged with published main before release. No force pushes or replacement of the live checkout. Delivery uses Hearth's Git updater and its rollback record.

Five features: connected-app picker and explicit mentions; active-chat tool/connection inspection; native user-input cards; current-turn steering; live model/reasoning picker. UI loads on demand as `astraconnect`. The app catalog reads installed runtime apps plus their metadata rather than fetching the entire marketplace (the latter timed out in live Windows testing).

Protocol: `app/installed`, `app/read`, `model/list`, `mcpServerStatus/list`, `item/tool/requestUserInput`, `serverRequest/resolved`, `turn/steer`. Based on the installed Codex app-server schema and https://learn.chatgpt.com/docs/app-server. Catalog reads never create a thread or model turn. Thread inspections reuse only that chat's connection; timeouts do not kill its reply. Existing tool permissions remain enforced. Unexpected command/file approvals are still declined.

Questions use random local tokens tied to one running chat and a server request ID. Completed, cancelled and expired questions cannot be answered again. Secret answers remain transient. Steering carries the expected turn ID and is never replayed after an uncertain outcome. Model changes wait for the current reply so its usage cannot be mislabeled.

Validation:
- `node dev/codex-server-test.js`: streaming, reconnection, isolation, stop, usage and the real engine boundary.
- `node dev/codex-capabilities-test.js`: catalog caching/pagination, explicit mentions, callable vs installed, correlated questions, stale steering, soft inspection timeouts and approvals.
- `node dev/codex-usage-test.js`: actual account limit normalization and caching.
- `node dev/astra-connect-smoke.js`: disposable Electron app with deterministic protocol fixture; interactive cards, steering, health and model picker.
- `node dev/lazy-manifest.js`, `node dev/boot-test.js`, `node dev/errorcalm-scan.js`, updater regression checks.

Windows tests set `ELECTRON` to the unpacked Electron executable. The smoke harness uses a separate temporary app and profile, never real data. Windows startup source sizes are normalized to LF to match Linux/macOS. Lazy-manifest recording normalizes CRLF too.

Live read-only catalog checks found seven models and sixteen connected apps. No external app writes were performed by these checks. Model-level native question generation and arbitrary external service operations depend on the selected model and the account's permissions; the deterministic fixture verifies the client protocol/UI.

Combined release checks (15 October): 12 protocol groups, 12 Electron UI checks, 1,283 startup checks, account limits, capability routing, error wording and promptdiet pass on Windows. The concise Astra role replaces the redundant conversation paragraph: measured fixed overhead is 162 tokens for a plain chat and 49 for a helper, within round 46 budgets; reasoning depth stays unchanged. The basic updater regression suite passes on Windows. Claude independently reports all 182 extended updatesafe checks passing on Linux at f1921c8 (before the prompt/platform merge); that suite uses Unix executable fixtures. Local edits are backed up separately and preflighted with a three-way merge before the in-app update.

Additional merged checks: Astra legacy engine 27/27, connections 7/7, platform46 32/32 on Windows. Claude reports access 24/24 and robust-engine 22/22 passing on Linux at 6df8445; their shell fixtures require Unix tools. Platform46's backup fixture now follows host path rules and substitutes a no-bin probe for that case, without changing production backup behavior.
