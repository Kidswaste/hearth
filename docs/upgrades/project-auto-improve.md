# Project Auto-improve

The project toolbar has an always-visible **Auto-improve** button in Desk, Scene,
Sound, Creative board and Moodboard. It uses the existing Keep going scheduler
and the selected project conversation, including secondary chats. Opening or
cancelling its card does not send a prompt. The card exposes the repeating words,
rounds/time and a percentage of remaining account usage (20% by default). Timing, restart
and compaction choices remain under advanced options.

The same button opens a run panel with pause/stop and percentage of budget used.
Exact token counts, cache breakdown and round history are collapsed details.
Starting a new budget is explicit; stopped runs stay
available for inspection. Pause/stop allow the current reply to finish.

## Percentage budgets

A fresh provider snapshot fixes the allocation when Start is clicked. If 50% of
the account window remains, choosing 20% permits 10 percentage points. Each
reported session/weekly/model window is tracked; the first to use its allocation
ends the run. The allocation never shrinks/rebases after each reply or refills
after a reset. Pause/resume and saved runs keep their original baseline.

Readings are account-wide: other chats and devices count against the allocation,
so this is a conservative account guard, not an exact attribution to Clink.
Provider readings can be rounded/delayed, and checks occur between replies: the
current reply can overshoot. This is not a monetary or instantaneous hard cap.
Missing/stale observations, reset/decreasing usage, engine/model changes or
invalid saved baselines block further replies. No token-to-quota conversion.
An account window reset requires explicitly starting a new budget.

Codex account reads bypass the one-minute cache before each next round. Claude
uses its guarded local `/usage` reader when supported, otherwise recent numeric
rate-limit events from normal replies. An event without a percentage keeps the
original observation timestamp. Unsupported/stale Claude reads cannot start a
percentage run; the UI explains that a fresh reading is needed. No hidden model
call is made to obtain a reading.

## Legacy token budgets

The advanced token option and existing runs retain their limits. Accounting
uses normalized provider input + output. Cached input and reasoning
are subsets, never added twice. Token traffic is not subscription usage or a bill.
Provider-reported API price estimates are labelled separately; prices are not
invented when unavailable. Account percentages cover all chats/devices and show
their age. The token budget covers this chat's replies and routine compaction;
separate paid tools or other model jobs do not share this budget.

Token budgets are checked between replies, using the recent/average round and the last
chat reply before the first round. The current reply can overrun. Missing or
interrupted token usage pauses token-budget rounds and is shown as incomplete.
Percentage budgets use fresh quota readings even if raw traffic was not reported.
Errors with reported usage, the last reply after Stop, and compaction summaries
are counted. Duplicate terminal events are ignored; explicit retries are new
attempts. Offline automatic retries cannot bypass the routine's budget decision.
Restoring an interrupted run requires review, even if restart continuation was
previously enabled. Historical chat data and routine totals are not rewritten.

Validation: routine accounting/core, usage-limit and engine adapter tests;
isolated Electron project fixture exercises the real Native.send fake-engine
path, secondary conversation targeting, all project tabs, custom budget,
duplicate reports, final usage after Stop, missing reports and retry isolation.
No real model run is started during validation.
`dev/routine-allowance-test.js` covers fractional allocation, multiple windows,
freshness, resets, persistence, missing token reports and carried timestamps.
`dev/checks/project-allowance.js` exercises percentage setup, two replies consuming
exactly 20% of a 50%-remaining window, unavailable-start blocking and stale-read
pausing in isolated Electron. Adapter tests verify fresh reads bypass the cache
without creating model turns.
