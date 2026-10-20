# Project Auto-improve

The project toolbar has an always-visible **Auto-improve** button in Desk, Scene,
Sound, Creative board and Moodboard. It uses the existing Keep going scheduler
and the selected project conversation, including secondary chats. Opening or
cancelling its card does not send a prompt. The card exposes the repeating words,
rounds/time and a percentage of remaining account usage (20% by default). Timing, restart
and compaction choices remain under advanced options.

Setup offers Improve, Polish, Fix bugs and Finish prompt shortcuts (editable,
remembered per conversation), plus 10/20/40% budget buttons and custom values.
New percentage setups default to running until their budget or a sensible early
stop; existing duration choices are preserved. Extra timing/token options live
under More controls, whose label always shows the selected duration.

The same button opens a run panel with pause/stop and percentage of budget used.
Exact token counts, cache breakdown and round history are collapsed details.
Starting a new budget is explicit; stopped runs stay
available for inspection. Pause/stop allow an edit already sent to finish and be
accounted normally. Visual feedback helpers are cancelled immediately.
While running, the project toolbar shows budget progress with direct pause,
resume and stop buttons. On completion it offers Review. The run panel surfaces
the last three pass summaries and a Review latest reply action targeting that
project conversation. Expanded accounting history stays open across updates.

The scheduler evaluates local waits (typing, queued messages, deliberate pauses,
settling time) before spawning account readers. A per-run check lock and per-chat
start lock prevent overlapping checks and double starts. Stopping retains the
final in-flight reply until accounting completes, blocking replacement budgets
until then. Restart clears stopped processes without resuming them.

## Visual feedback between edits

In an open Astra project with a scene, enable **Review the scene before each
improvement**. Each pass records 6, 12 or 20 seconds, runs the existing Auto
review (overview plus up to one close-up synthesis), then sends one focused fix
and its cited image sheets to the selected project conversation. Secondary chats
are supported. The scene is shown briefly for recording, then the previous tab
and paused playback position return. Chromium suspends hidden canvas animation,
so recording does not pretend a hidden iframe is still drawing. Empty/one-frame
captures cannot start a review. The mode is optional and uses no Deep reviews.

The reviewer uses that conversation's model and effort, recent chat context,
the owner's standing goal and the preceding review's direction. Every pass takes
new evidence. Resolved or unsupported findings should be dropped. The editor
receives a tentative diagnosis to verify, not an instruction to blindly undo
earlier work. No supported improvement ends the run without an edit. Drafts and
attachments in the composer remain separate from the routine's explicit images.

Each review call and edit is gated by the same run budget. Reported review input
and output enter its totals once; fresh percentage readings happen before each
helper call and again before editing. Missing usage blocks token-budget runs.
As elsewhere, provider readings can lag and one in-flight reply can exceed a
budget. Failures retain partial reviews and pause before an edit. Stop cancels
the review/recording; unknown interrupted usage is labelled incomplete. Switching
projects/chats/scenes, changing the model or changing scene code/conversation
during review invalidates that pass. Reopen the bound project to resume.

The run panel shows its latest feedback and opens the retained evidence. Manual
Feedback results also offer **Auto-improve with feedback**, which opens budget
setup without spending or starting a run. Saved reviews retain the usual 20-entry
history; captures stay on the project's shelf. A finite run's final edit has no
extra paid review after its last permitted round.

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
their age. The token budget covers this chat's replies, routine compaction and
enabled visual reviews; separate paid tools or other model jobs do not share this budget.

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
The Electron fixture also exercises focus/budget shortcuts, toolbar pause/resume/
stop, preserved details expansion, zero account reads during local waits, stopped
reply replacement blocking and duplicate-start blocking. The controls core test
covers local gates and stopped-reply restart/accounting behavior.

`dev/checks/routine-feedback.js` records and decodes a real animated canvas in an
isolated Electron profile and passes real evidence to the selected secondary
conversation through fake engines. Deterministic follow-ups check new recordings,
prior-review context, exact combined token totals, percentage stops between helper
calls and before editing, missing usage, partial failures, cancellation, concurrent
scene changes and early completion. No paid model turn or user project is used.
