# Project Auto-improve

The project toolbar has an always-visible **Auto-improve** button in Desk, Scene,
Sound, Creative board and Moodboard. It uses the existing Keep going scheduler
and the selected project conversation, including secondary chats. Opening or
cancelling its card does not send a prompt. The card exposes the repeating words,
rounds/time, custom token budget and account-wide usage ceiling. Timing, restart
and compaction choices remain under advanced options.

The same button opens a run panel with pause/stop, exact reported counts, cache
breakdown and round history. Starting a new budget is explicit; stopped runs stay
available for inspection. Pause/stop allow the current reply to finish.

Accounting uses normalized provider input + output. Cached input and reasoning
are subsets, never added twice. Token traffic is not subscription usage or a bill.
Provider-reported API price estimates are labelled separately; prices are not
invented when unavailable. Account percentages cover all chats/devices and show
their age. The token budget covers this chat's replies and routine compaction;
separate paid tools or other model jobs do not share this budget.

Budgets are checked between replies, using the recent/average round and the last
chat reply before the first round. The current reply can overrun. Missing or
interrupted usage pauses further automatic rounds and is shown as incomplete.
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
