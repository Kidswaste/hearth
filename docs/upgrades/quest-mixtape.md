# Sidequest Studio: the mixtape

The studio now has thirty authored, finishable one-off quests for Quentin's interests, presented as a crate of illustrated tape sleeves. Open **Sidequest Studio → Deal me in**, also available from the Project crate. It complements the existing campaigns and commission wall.

## What changes

- **Thirty briefs across five worlds:** eight music quests, eight visual studies, five game-feel quests, five Forgeheart tasks and four small resets. Examples include a voice-note demo, one-synth sound family, room-sound drum kit, plugin A/B, reflective composition, Passage echoes, ASCII hierarchy, game feedback, drone readability, affix tradeoffs, lattice cues and factory flow.
- **A three-card deal:** least recently shown cards come first, exhausting unseen matching cards before repeats. The hand and its order survive reopening. Accepted cards leave the suggestion pool; a card creates one stable quest, never another XP source on every deal.
- **World, intention and time filters:** make, remix, polish, explore or reset; up to 5, 15 or 30 minutes, or any length. Empty pools say so and offer a reset, rather than substituting unrelated work. Filters are saved.
- **Saved crate and reversible dismissal:** save a card for later, browse only favorites, or mark it “Not my thing.” Tucked-away cards have an explicit restore control. These actions never start quests or award XP.
- **Thirty optional constraints:** each is written for its specific brief. Preview the exact changed finish line before accepting. The choice freezes into the saved quest and review brief. It adds no XP and cannot change an already accepted quest.
- **Creative passport:** five illustrated stamps count finished mixtape quests in each world. No deadline, streak decay, score bonus or automatic reward spending.
- **Tracklist:** revisit every accepted card, including finished, skipped and parked work. Parked quests can now resume directly from their detail view, respecting the three active side-quest limit.

The native SVG mixtape and Forgeheart anvil, colored sleeves, paper liners and staggered dealing animation follow the studio's existing style. Narrow cards stack; the system reduced-motion preference and studio Motion toggle disable the new motion. All filters, choices and buttons are native keyboard controls. Existing five navigation objects remain intact.

## Rules and data

The optional `deck` object lives inside the existing version-1 `quest-journal`: version, filters, current hand, recency order, saved IDs and hidden IDs. All collections and values are bounded and validated during load/import. The upgrade adds deck metadata to an existing proof studio without resetting submissions, scope contracts, reward goals, ideas, XP or receipts. Existing journal exports remain readable; new backups carry the deck too.

Accepted cards become normal side quests with `deckCard` and `deckTwist` metadata, an immutable copied finish line, a two-minute first step, and 20/35/50 XP for 5/15/30-minute briefs. Three active side quests remain the maximum. Acceptance, favorites, filtering, dealing and passport viewing earn nothing. Completion uses the existing saved-proof and validated-review gate. Low scores do not reduce the fixed finish reward; high scores do not increase it. Reaccepting the same card is idempotent; revisions use the existing review-driven revision quest flow.

Browsing is entirely local. Only explicitly submitting proof starts an Astra review. Review coverage remains unchanged: text/images and sampled video frames; audio receives a technical/documentation review, not a claimed listening critique. No new engine capabilities, dependencies, startup scripts, timers or eager assets are added.

## Validation and release

Run `node dev/run-checks.js quests --out <directory>` with `ELECTRON` pointing to the installed Electron binary. The group now includes `quest-deck-test` and the isolated `quest-deck` Electron journey. The latter exercises navigation, filters, empty states, favorites, hiding/restoring, constraints, proof completion, parked resumption, passport stamping, narrow layout, motion, rejected actions, full side-quest capacity and real reload persistence. Reviews in this journey are explicitly labelled fixtures; it does not spend account usage or assess artistic quality.

`node dev/boot-test.js` checks that initial loading remains unchanged. New data lives in the existing lazy quest group; no manifest regeneration is required for registrations.

Branch: `codex/studio-quest-variety`. Claude owns integration into main and the normal Hearth updater release. This branch does not restart the live app or modify its data. Coordination and final handoff are in GitHub issue #2. Local visual evidence and test logs are under the task outputs in `studio-variety-shots` and `studio-variety-checks`.

Windows validation on 2026-10-17: all eight quest checks passed, including existing journal/studio/session/proof journeys and the new deck journey with reload. Core tests also verify full-deck rotation, old-studio migration with saved proof, strict import validation and fixed XP. Syntax and diff checks passed. Startup remains 72 scripts / 2,288 KB and 29 styles / 446 KB, within the existing budget. Wide and narrow screenshots were inspected. A native Mac run remains for integration; no live account review was needed because this pass does not change the review engine.
