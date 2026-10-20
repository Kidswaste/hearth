# Guided video feedback

Projects now have a Feedback button next to Auto-improve. Video players and their
context menus have the same entry. `/feedback-round` opens it from a chat.

Choose a project recording or a local video, then a plain-language direction (or
write your own). Astra receives the selected clip's actual labelled frames and up
to six recent messages from the project conversation. The overview is 12 evenly
spread frames in two image sheets. A close look is up to 24 consecutive frames,
centred on a chosen time, in four sheets. Both use the existing cross-platform
FrameRead decoder; estimated fallback positions are labelled as such.

**Record current scene** captures a 6, 12 or 20-second take directly from the
current project's scene canvas, even when Feedback was opened from its chat.
The dialog and Hearth UI are excluded. The current canvas size, scene quality,
playback position/speed and manual recording preferences are preserved. The take
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
that moment for another review. Nothing sends or edits automatically: select
findings, edit the prompt, then add it and the image sheets to the original chat's
draft. Existing draft text is appended to, not replaced. The last 20 completed
reviews are retained in `data/kv/visual-feedback.json`.

Each requested review is one normal Astra helper turn using the configured model
and reasoning depth, accounted in Usage. No project tools, shell, connectors or
web access are enabled for the reviewer. Closing/stopping cancels the turn; a
cancelled preparation never starts a model call. Frame images cannot prove audio
quality, continuous playback, game feel or smoothness. The UI and model prompt
state that coverage explicitly. They do not call this a full video playback review.

Tests: pure frame plans/contracts, cancellation and engine events, bounded context,
an isolated Electron flow with real frame extraction and a synthetic model reply,
project routing/draft preservation, plus boot and existing review restrictions.
Direct recording checks cover real animated canvas pixels, duration, automatic
frame preparation/shelf selection, no AI call, cancel/retry, concurrent ownership,
unchanged scene data, plus sandbox cleanup/error contracts.
