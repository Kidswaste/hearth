# Astra chat and account usage

Ordinary Codex chats now get concise conversational instructions. Enabling Lab tools no longer assigns a general chat the Three Director identity. Custom personas and docked directors retain their roles. All existing tool access remains available.

The first text delta bypasses the 40 ms engine batch and 60 ms renderer delay; subsequent chunks still batch for efficient long replies. Existing setup, first-text, paint and total timings remain visible. Server-side reasoning and network delays still determine when text begins; this is not the hosted desktop conversation or its exact tool environment.

The rail says **Usage**. Click it or press Ctrl+Shift+U for live Codex account limits, remaining percentages, window lengths and local reset times. These come from the installed, signed-in Codex app-server `account/rateLimits/read`; they are account-wide, not a Hearth-only estimate. Multiple buckets are shown; unknown limits remain unavailable. No model turn, credit purchase or reset redemption is involved. Requests are coalesced and cached for one minute, and the read-only server closes after five idle minutes. Sign-in errors clear the old snapshot. Claude subscription limits are unavailable.

Below that card, token traffic retains the existing records. Input is repeated for each model call in a tool-running turn; cached input is part of input, not additional tokens. Output includes reasoning and tool-call text. Neither raw traffic nor API list-price estimates measure subscription usage. Badges separate fresh input, cached input and output, with details on hover; the Astra welcome card links to account usage.

New app-server replies store `contextInput`, `contextCached` and `contextWindow` from the final model call. Context meters and compaction decisions use these instead of all inputs across a tool-using turn. A baseline published during resume is subtracted before recording the new turn; duplicate cumulative notifications do not add traffic again. Historical totals are not rewritten because their original counting cannot be reconstructed reliably.

The installed Codex model list on 2026-10-15 reports that `gpt-6-astra` accepts `max`. Hearth now passes that effort through and exposes it in Astra's commands. For this owner's local configuration, use `gpt-6-astra`, `effort: max`, `verbosity: low`, per their preference for maximum depth with concise answers. The tracked config template is not replaced; retain all local access and other-agent settings. Model-specific effort support can vary.

Validation: app-server protocol/adapter tests (12 groups), account limits tests (multi-bucket, missing versus zero, reset units, clamping, concurrent/cached reads, no model turns, unavailable state), existing Astra engine tests (27), streaming render equivalence (9,912 renders), and compaction tests. Relevant commands: `node dev/codex-server-test.js`, `node dev/codex-usage-test.js`, `node dev/astra-engine-test.js`, `node dev/streamrender-test.js`, `node dev/autocompact-test.js`.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## In-app verification on the owner's PC

Integrated without changing the eight other locally modified/untracked files; the only local config differences are Astra's `effort: max` and `verbosity: low`. Backup manifest: `C:/Users/quent/hearth-integration-backups/astra-chat-usage-1792080816195/manifest.json`. Hearth was restarted cleanly and the account card visually checked: 96% remaining, 4% used, 7-day window, reset shown in local time. This is a point-in-time account-wide reading.

Two test replies in the existing streaming-test chat:

| Test | Reused server | Setup | First text received | First text painted | Total |
| --- | --- | --- | --- | --- | --- |
| Integers 1–50 | No | 736 ms | 3,796 ms | 3,797 ms | 5,768 ms |
| Explain token counts, no tools | Yes | 0 ms | 18,456 ms | 18,456 ms | 20,693 ms |

The second reply was three concise paragraphs; 552 output tokens included 454 reasoning tokens. Its 10,915 input tokens included 10,624 cached tokens. Maximum reasoning was accepted by the real server; neither test used tools. Display latency fell from the earlier 216–349 ms to 0–1 ms in these samples. They are not a controlled model-speed benchmark: prompts, effort, cache warmth and network conditions differ. The 18.5-second wait on the second prompt occurred before text reached Hearth.
