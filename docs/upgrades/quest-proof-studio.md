# Sidequest Studio: make, submit, critique, improve

Quentin asked for substantial quests/rewards based on his actual interests, required proof, a candid review scored out of 100, and four additional major features. This pass adds a commission wall, proof review desk and portfolio while preserving the existing journal and Claude's main-branch work.

## Personal commissions and rewards

Five new campaigns contain fifteen authored milestones:

| Campaign | Actual output |
| --- | --- |
| A demo worth pressing play on | Eight-bar hook → 30–60 second arrangement → named final bounce |
| A loop with somewhere to go | Drum/bass groove → a useful variation → reusable loop with BPM/key and seam notes |
| One visual with a pulse | Clear still → 6–12 second motion study → deliberate loop join |
| One game idea, much better | One interaction → stronger feedback → one tested fix |
| Forgeheart: one meaningful upgrade | Reproducible friction point → bounded change → repeatable test and patch note |

The Forgeheart briefs refer to its actual drones, forging, affixes, lattice and rifts. The tool link opens Hearth's existing Forgeheart workspace. Existing five starter campaigns, custom campaigns, skips and daily ideas stay intact.

Six new editable rewards span 8–100 sparks: an uninterrupted album, a game session, sample digging, a plugin experiment, a free-choice creative night and a sample-pack/plugin wishlist fund. They are self-managed rewards; Hearth never purchases, downloads or books anything. Existing rewards and redemption receipts are preserved.

## Required proof and Astra review

New completions require a saved submission and a validated Astra review with `meetsBrief: true`. There is no checkbox-only completion path. Earlier completed quests keep their XP and history; they are not retroactively invalidated. A small start still earns five XP once without pretending the full quest is finished.

Choose up to four local files (80 MB total), select a real message from a Hearth chat, or provide a supported ChatGPT/Claude link plus the pasted actual result. Selecting/preparing evidence does not send anything. **Submit proof & ask Astra** explicitly sends the selected evidence and notes using the configured Astra model and reasoning depth. Normal account usage applies.

Uploaded originals are copied into Hearth's reference store; resized image/frame copies go into attachments. Chat proof keeps an immutable text excerpt and a **Show source chat** control. External links are retained for opening but never fetched automatically; the review clearly identifies the pasted excerpt as unverified against the remote page. Submitted text/code is never run.

| Evidence | What Astra receives and can assess |
| --- | --- |
| Image | Actual still, resized to at most 1600 pixels; composition, palette, visible craft |
| Video, at most five minutes | Three actual sampled frames plus duration/timestamps; no continuous playback, smoothness, audio or sync claim |
| Audio, at most five minutes | Decoded duration, sampled peak/RMS/full-scale counts/seam delta and the user's structure notes/reference images; **technical/documentation review, not listening critique** |
| Text/code/diff | Actual text, capped at 20,000 characters; no execution or independently verified playtest |
| Hearth chat | One selected actual message; other messages and attachments are not silently included |
| External chat | Pasted work plus source link; no claim of remote access |

The reviewer returns four integer rubric components (intent/clarity, execution/craft, brief/delivery, presentation/tests), each out of 25, summing to a score out of 100. It gives a short verdict, the biggest concrete weakness, one finishable next step, exact review coverage and limitations. Scores are subjective and scoped to that coverage. If the evidence cannot support a judgment, it returns **needs-evidence**, no score, and no completion approval. A low-scoring rough result can meet a rough brief; there is no minimum score required for XP.

No local heuristic generates an artistic score. Audio measurements do not establish melody, groove or mix quality. A listening critique still requires an audio-capable review connection; this pass does not pretend the current Codex image/text connection has one.

The review is a separate lean engine turn with no project, shell, MCP, app, web or write tools. Evidence is explicitly untrusted in the reviewer instructions. Malformed responses, errors, timeouts and cancellations preserve saved proof and award no completion XP. The five-minute timeout and **Cancel review** stop the request. Closing the dialog does not lose the request; reopen its review history to cancel or see the result. Retry is explicit, never automatic.

## Four additional features

1. **Scope contracts:** Sketch (10 min / 30 XP), Studio (25 min / 50 XP) or Showcase (45 min / 75 XP) changes the exact brief before starting. Scope freezes after the first start or submission so earned XP cannot be inflated retroactively.
2. **Revision quests:** turn a completed quest's next action into a bounded 15-minute side quest. One revision quest per review, subject to the existing three-slot limit. Reusing the original artifact is rejected. Re-reviewing a completed original never awards its completion XP twice. Where available, Astra receives the previous review/evidence and one prior reference frame for comparison.
3. **Scored portfolio and version history:** actual proof thumbnails, latest/best scores, retained unsuccessful submissions, source links and per-version coverage. Up to twelve submissions per quest. Scores with different coverage are not presented as a measured quality improvement.
4. **Reward wishlist:** choose one reward to save toward, see the remaining sparks in the notebook and highlight it in the treat machine. Selecting a goal spends nothing; redemption remains explicit and refundable.

The illustrated commission cards use the studio's own SVG objects, paper/tape treatment and hover motion. Scorecards have a circular score dial, rubric meters and readable critique sections. The workbench is compact on browsing pages, full-size in the notebook. The portfolio uses proof previews rather than only numbers. Narrow layouts, keyboard-native controls and existing reduced-motion settings are retained.

## Data and compatibility

Everything remains in the version-1 `quest-journal` record. Optional `studio`, `contracts`, `submissions` and `rewardGoal` fields are validated on load/import. The additive upgrade is idempotent and never resets XP, rewards, ideas or notes; starter additions stop at existing campaign/reward capacity rather than deleting personal items. Restore still writes a recovery copy first. Old imports are upgraded before use.

Submissions retain the exact brief, intent, timestamp, content fingerprint, evidence paths/excerpts, and immutable completed review. Identical evidence with identical intent cannot create another version; a changed explanatory context can accompany the same original. Revision quests require a changed artifact fingerprint. Native files stay local until an explicit review sends their derived images/text/measurements; raw audio/video is not sent to the model.

JSON backup contains paths and chat excerpts, not media bytes. Move the referenced proof and attachment files separately when moving computers. Windows is verified; a real Mac run remains for Claude's integration check.

## Verification and handoff

`node dev/run-checks.js quests` runs core progression, proof/review policy and four renderer journeys using throwaway profiles. Existing progression/backup/recovery, motion, skips, ideas and session-note tests now submit explicit mocked-review fixtures; no real model is called by this group. `dev/checks/quest-proof.js` covers the real file ingestion, image resizing, WAV decoding, video frame sampling, bundles, chat selection/opening, proof gate, score storage, scope, versions, duplicate prevention, engine failure, cancellation after reopening, revisions, wishlist and reload. Screenshots cover desktop/narrow commission and scorecard layouts and the portfolio.

The opt-in `dev/checks/quest-review-live.js` uses one real Astra review of a synthetic image. Run only with `--eval "window.QUEST_LIVE_REVIEW=true"`; otherwise it skips. On Windows the actual `gpt-6-astra` turn returned a valid 88/100 rubric scorecard in about 20 seconds, accurately identified the visible circle/accent/palette, and proposed a concrete composition change. This verifies image transport and the structured review connection, not objective grading accuracy. No user artwork or live journal was used.

Lazy registration parity and startup budget checks pass. The quest implementation is entirely lazy, with no new packages. Startup remains 72 scripts / 2,288 KB and 29 styles / 446 KB on the integrated round-56 base.

Branch: `codex/studio-proof-reviews`, containing the previous PR #8 studio/session changes and main through `12138e4`. Claude owns review, main integration and updater release. Integrate this branch as the complete studio update; PR #8 is included if still unmerged. Shared edits are the generated lazy metadata, quest test group and a small `engines.js` per-review tool-isolation guard. No live app restart, config/data copying, main push or updater action is performed by Codex.
