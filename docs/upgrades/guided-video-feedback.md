# Guided video feedback

Projects now have a Feedback button next to Auto-improve. Video players and their
context menus have the same entry. `/feedback-round` opens it from a chat.

Choose a project recording or a local video, then a plain-language direction (or
write your own). Astra receives actual labelled frames and up to six recent
messages from the project conversation. All modes use the existing cross-platform
FrameRead decoder; estimated fallback positions are labelled as such.

**Auto** is the default. Its first reply reviews 12–36 frames distributed from
the beginning to the end of the clip and nominates up to two adjacent-frame
intervals worth checking. Hearth reads 24–48 consecutive frames around each
candidate, merges overlapping requests, and asks for one final review with those
close-ups and the original findings' evidence. The final reviewer must confirm,
refine or reject the provisional diagnosis. If no closer check would help, it
finishes after the overview. Maximum: two Astra replies. Sparse coverage elsewhere
is explicit; the app does not claim this examines every frame of a long clip.

**Deep** is opt-in and includes every decoded frame of clips up to 600 frames
(about 20 seconds at 30 fps). Its budget is shown before starting: overview,
48-frame batches overlapping by two frames, then final synthesis; at most 15
replies. The short clip is decoded once locally, off the renderer thread, and
reused by each batch. Every batch reports at most its strongest supported finding;
the final pass merges duplicates and chooses up to three useful directions. Exact
decoder positions are required. Larger clips are refused before an AI turn with
guidance to use Auto or record a shorter take; Deep never silently skips frames.

**Quick** retains the original 12-frame overview (one reply). **Close look** retains
24 consecutive frames centred on a chosen time (one reply). Six labelled cells per
image sheet keep evidence readable. Labels are rebuilt and remapped when combining
passes, so the final prompt refers to its own supplied evidence.

**Record current scene** captures a 6, 12 or 20-second take directly from the
current project's scene canvas, even when Feedback was opened from its chat.
The dialog and Hearth UI are excluded. A paused or frozen scene plays during the
take, then returns to its original position and pause/freeze state. Already playing
scenes continue normally. Canvas size, scene quality, playback speed and manual
recording preferences are preserved. The take
is saved to local captures and the original project's shelf, selected in Feedback,
and its overview frames are prepared automatically. No export or file picker is
needed, and no AI turn runs until **Ask Astra for direction** is pressed.

Closing or stopping cancels only the owned take. Existing recordings/renders and
stale project contexts are refused. The scene recorder has request IDs, a bounded
duration, encoder error handling and track/timer cleanup. Cancelled late results
cannot open the manual Save As dialog. A finished saved take remains available
even if frame preparation is cancelled. Normal manual recordings retain Save As.

The response contains up to three concrete findings with validated evidence
labels, a small change to try, and a way to check it. Uncertain causes are marked.
Click evidence to inspect and step the original clip. “Look closer here” selects
that moment for another review. Manual feedback does not send or edit automatically:
select findings, edit the prompt, then add it and the image sheets to the original chat's
draft. Existing draft text is appended to, not replaced. The last 20 reviews,
including saved partial rounds, are retained in `data/kv/visual-feedback.json`.

**Auto-improve with feedback** opens the project's existing run/budget setup with
visual review enabled. Starting it explicitly records and reviews the scene before
each edit, passes the strongest finding and its images to the bound conversation,
and re-records for the next pass. The same budget covers reviews and edits. See
[Project Auto-improve](project-auto-improve.md) for accounting and stop behavior.

Each pass is a normal Astra helper turn using the configured model and reasoning
depth, individually accounted in Usage. Completed passes are saved as one evolving
review, visibly marked partial until the whole round succeeds. The Coverage drawer
shows pass summaries, unique frames supplied and reply count. Stop/close prevents
later passes; failures retain completed work. The updater refuses to interrupt a
running feedback review/capture. No project tools, shell, connectors or web access
are enabled for the reviewer. A cancelled preparation never starts a model call.
Frame images cannot prove audio
quality, continuous playback, game feel or smoothness. The UI and model prompt
state that coverage explicitly. They do not call this a full video playback review.

Tests: pure frame plans/contracts, cancellation and engine events, bounded context,
an isolated Electron flow with real frame extraction and a synthetic model reply,
project routing/draft preservation, plus boot and existing review restrictions.
Direct recording checks cover real animated canvas pixels, duration, automatic
frame preparation/shelf selection, no AI call, cancel/retry, concurrent ownership,
unchanged scene data, plus sandbox cleanup/error contracts.
Adaptive checks cover bounded plans, all 600 frames in overlapping batches, mapped
citations, rejecting an initial hypothesis, skipping unneeded follow-up calls,
cancellation between passes, decoder/size limits before model calls, partial-history
recovery, and isolated Electron Auto/Deep rounds with real decoding and fake replies.
