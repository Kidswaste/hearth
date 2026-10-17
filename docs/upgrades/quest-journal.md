# Quest journal

**Sidequest Studio** now has its own illustrated notebook button in Hearth's main rail. The first release hid it automatically; this upgrade brings it onto the rail once for existing installs, preserving other tool settings and respecting any later choice to hide it. **Open quest journal**, the persistent **✦ Quest journal** button in the Playground, and `/quests` still work. The workspace loads only when opened.

## The experience

- The journal is **The sidequest studio**, an original illustrated workbench menu: notebook, project crate, modular patch bay, treat machine and keepsake shelf. A moonlit window, desk lamp, drifting dust, blinking equipment lights, floating field kits and turning tape reels bring the room to life. SVG objects lift or open on hover/keyboard focus; captions explain the destinations and the treat machine shows the actual spark balance. Native buttons retain Tab/Enter navigation, clear current-page state and accessible names. **Motion on/off** saves your preference; system reduced motion disables movement. Ambient CSS animations pause while the studio or app is hidden. No animation JavaScript loop, autoplay, remote fonts or external illustration assets.
- Pinned paper holds the next quest; four illustrated field kits reflect visual work, music, games and everyday life. Campaign covers, patch cables between skill nodes, reward slots and keepsake shelves carry the same studio identity. Responsive layouts follow the panel width, including when Hearth's sidebar is open. All existing progression and saved journals remain compatible.
- One tracked main campaign with a clear next milestone, completion criteria, time estimate and reward.
- Five starter campaigns, 21 authored quests: a seamless material, a Passage-style music-reactive loop, a three-sound sample pack, a tiny playable world, and making space for a creative session.
- Personal campaigns: a name, why it matters, a skill path and 1–12 milestones. Campaigns can be paused and resumed without losing anything.
- Three rotating daily suggestions; at most three accepted side quests. Accepted quests persist across midnight. Parked quests can be resumed.
- **Skip for now** moves past a main quest or removes an accepted side quest from the active board. **Not today** declines a daily suggestion. All remain under **Set aside** with **Revisit quest**. Skipping earns no completion XP or campaign badge, preserves an earlier small-start award, and ends that quest's focus timer. Repeated skip/revisit cannot earn duplicate XP. A campaign badge still requires every milestone actually completed.
- **Next time** is a personal idea box: write a quest and small finish line, choose a skill path and 5/15/30 minutes, then save it for another session. Ideas can be edited or removed before use. **Make this my quest** accepts one into a free side-quest slot; accepting is idempotent and earns no XP. The real finish-line flow awards 20/35/50 XP. Pending ideas persist across reload and remain available until chosen, without reminders or auto-starting.
- A two-minute start, a focused finish line and an optional deep dive. The first small start earns 5 XP once. Completion earns the remainder of the quest's award. Deep dives do not reward overwork.
- Lifetime XP, levels and sparks (one spark per five XP). Levels follow `50 × level × (level − 1)` total XP. No decay, missed-day penalties or streak requirements.
- Four mastery paths and 20 skill nodes: Visual Alchemist, Sound Explorer, World Builder and Everyday Adventurer. Milestones unlock at 0/30/90/180/300 path XP. Tools remain available regardless of level.
- A reward chest with personal rewards, editable prices, explicit redemption, receipt history and returns. Spending sparks never spends XP. These are self-managed rewards, not purchases or bookings.
- Campaign badges and a collection of finished quests, reflections and attached files. Local image/audio/video previews; no autoplay. Files stay where the user saved them. Network shares are never automatically previewed.
- Five-minute focus sessions, pause/resume/end, persistence across reload and wall-clock accounting across sleep. A timer never marks work complete.
- Direct links to the actual tile generator, Three.js Lab, samples, effects and game tools. An explicit Astra handoff preserves any existing draft and never sends it.
- Keyboard-native dialogs, visible validation, reduced-motion support and responsive layouts.

## Storage and recovery

`data/kv/quest-journal.json` is separate from the existing Playground notebook. No existing scenes, chat history, projects or notes are migrated or rewritten. Earlier Playground reflections can be read in Collection; the original daily notebook remains under a collapsed section in the Playground.

Writes are serialized and transactional from the renderer's perspective: state and the UI advance only after `kvSet` succeeds. Repeated completion/small-start actions are idempotent. Undo refuses to invalidate later milestones or spend sparks already redeemed; rewards can be returned first. A paused campaign cannot accrue new quest progress. Existing version-1 journals remain readable: `ideas`, `motion` and record `skippedAt` are optional additions, validated on read/import. Backups preserve all three. An idea accepted as a quest cannot be edited retroactively through the idea box.

Journal options exports portable JSON and restores a validated backup after showing its counts. Restore writes the current journal to `quest-journal-before-restore` before replacement, in the same serialized operation. Journal options can export that recovery copy. The JSON contains paths to keepsakes, not their media bytes; move the files separately when switching computers. Unsupported or unreadable journals enter a read-only recovery view and are never replaced by an empty default.

No model calls, external requests, daily notifications, new packages, engine settings or background automation are added.

## Validation

Run `node dev/quest-test.js`, or `node dev/run-checks.js quests` for unit and renderer journeys together. Set `ELECTRON` to the installed executable on Windows.

The 21 unit scenarios cover XP idempotency, partial awards, ordered milestones, undo/dependencies, level and skill boundaries, spending/refunds, paused work, daily rollover and limits, personal scope, artifact storage, malformed backups, restoration and absence of inactivity decay. The added scenarios cover skips without fake campaign completion, revisit after a small start, side-quest slot limits, editable/idempotent ideas, full-board handling and old-journal compatibility.

`node dev/smoke.js --script dev/checks/quest-journal.js --check-timeout 240000 --save-dir <test-exports> --shot <image.png>` uses a throwaway copy/profile. Verified on Windows: 103 UI/IPC assertions, real local file attachment/preview, Playground navigation in both directions, XP/levels/skills, rewards, personal campaigns, focus controls, side-quest parking, explicit unsent Astra draft, backup import/recovery copy, keyboard Escape, narrow layout, reload persistence, unsupported-version preservation and retry. The studio checks also exercise every SVG destination, real Tab/Enter activation, retained menu focus, pointer hover/captions, reduced motion and visible touch targets at narrow panel widths. No page errors. The existing Creative Playground smoke passed all 15 screens and its exports/persistence journey before this quest-only visual revision.

`dev/checks/quest-studio.js` adds 44 checks for the cold main-rail entry, one-time placement migration, respecting a later manual hide, active/hidden/reduced motion, reversible skips and focus cleanup, declining suggestions, saving/editing/accepting/completing a personal idea, and narrow layout. A real reload checks pending ideas, skipped quests, XP and motion preference. `node dev/run-checks.js quests` runs all three suites.

`node dev/lazy-manifest.js` regenerated registration data and confirmed old/lazy registry parity. `node dev/boot-test.js`: startup remains 72 scripts / 2,279 KB and 29 styles / 446 KB, below the existing budget. The quest implementation and styles are entirely lazy; the small notebook icon and placement migration join the existing startup files. Windows verified; a real Mac run remains for integration.

## Claude handoff

Current follow-up branch: `codex/studio-next-quests`, based on released main and rebased onto `a794501` to retain Claude's latest game-performance work. The original `codex/quest-journal` feature is already released. Quentin wants Claude to own integration, main push and Hearth's updater release. No live updater action or main push is part of this change.

This follow-up changes `tools/quest-core.js`, `tools/quest-journal.js`, `tools/quest-journal.css`, quest tests and this guide. Shared edits are the small one-time rail placement in `tools.js`, the notebook icon in `icons.js`, generated `lazy-data.js` tool name/default visibility, and the `quests` test-runner group. No changes to scenes, chats, engines or the updater. Preserve other agents' registry additions and regenerate metadata if needed. Do not copy config or data from a checkout into the live app. After integration, rerun `quests` and boot checks before releasing through the usual updater.
