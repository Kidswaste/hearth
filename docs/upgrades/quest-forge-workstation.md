# Sidequest Studio: the Forgeheart workstation

Quentin asked for more personal rewards and skill progression, with the existing desk presented as part of Hearth's Forgeheart computer. This pass builds on the mixtape branch and keeps the update inside the lazy quest module.

## Personal progression

The Patch matrix adds eight specializations, paired within the existing four paths:

| Path | Specializations | Work that counts |
| --- | --- | --- |
| Sound Explorer | Demo alchemist / Pocket engineer | Short demos and song transitions / grooves, samples and plugin experiments |
| Visual Alchemist | Passage pilot / Surface shaper | Central subjects, motion, ASCII and loop seams / materials, palettes and covers |
| World Builder | Feel mechanic / Forgeheart smith | Readable interactions and feedback / drones, affixes, lattice, rifts and factory flow |
| Everyday Adventurer | Return specialist / Finish-line collector | Reviewed small resets / reviewed finishes across every path |

Each specialization awards three titles at 1, 3 and 5 different completed, reviewed quests. It is a record of finished work, not a certification of ability. Small starts, unreviewed historical completions and revision quests do not inflate these counts. Historical XP remains intact. A completion with an approved review continues to count while a later version awaits review; undoing the completion removes its eligibility.

Each route shows its exact supporting work and opens the original review. Pin a route to the notebook, or start its next available practice. The picker respects campaign order, pauses, skipped/parked quests, hidden mixtape cards and the three-side-quest limit. Taking practice itself adds no XP. It can accept a matching mixtape card without changing the user's saved deck filters.

Earned titles can be equipped on the workstation nameplate, together with a small SVG keepsake: an anvil, prism, controller, tape, patch cartridge, material sample, cup or cabinet. Higher ranks change the title. These are cosmetic; tools and practice remain available without unlocking them. Original path XP milestones remain in an expandable section with all thresholds and progress unchanged.

The completion celebration names newly earned specialization titles and offers **See titles** to open the Patch matrix. Equipping remains an explicit choice; a new title never replaces the user's current one automatically.

## Reward bay

Ten optional reward blueprints cover a private demo listen, sample hunt, forgotten-plugin date, chosen game night, Passage screening, Forgeheart victory lap, free-choice creative evening, tiny-release celebration, sample-pack wishlist and album/desk reset. Customize the exact name, cost and ritual before adding one. Adding the same blueprint again edits the existing version instead of duplicating it. Existing rewards are never replaced by the upgrade.

The normal reward editor now supports a personal note, such as the chosen album, game or real-money budget. Claiming snapshots that ritual into an **enjoy later** queue. Mark a reward enjoyed with an optional note; the reward log keeps the moment. Enjoyment changes neither XP nor sparks. Undo an accidental enjoyment mark before returning the reward; returns refund exactly once. No purchase, booking, playback or download is performed. Rest and leisure are not gated by the points system.

## Forgeheart presentation

The studio now uses black/charcoal chassis and neutral gray panels, with Forgeheart-style orange, violet, gold and pink accents. The old teal/green surface palette is removed. Desk objects, paper labels, lamp and small keepsakes remain, while a small monitor replaces the cool landscape decoration. Music, visuals, game and life path accents use vivid rarity colors.

The workstation strip includes real controls: **Pick next mission**, **Tune desk** and **Lamp on/off**. Tune desk saves a callsign and accent; the lamp changes the actual desk illumination. Earned titles and keepsakes sit on this strip. There is no fictional online/CPU/system telemetry. Motion preferences still apply, including reduced motion and hidden-workspace pauses.

The changes are scoped to quest styles and authored quest SVGs. `forge-skin.css`, global app CSS and the rest of Hearth are unchanged. Dialogs, commission cards, proof reviews, mixtape sleeves, rewards, skill matrix and small-screen layouts receive the charcoal treatment. No extra eager assets, fonts, timers or dependencies are introduced.

## Data and checks

Optional `workstation` metadata is added to the existing version-1 journal: version, accent, callsign, pinned route, equipped title and lamp state. Reward blueprints and receipt ritual/enjoyment fields are bounded and validated on load/import. Migration preserves proof, contracts, favorites, reward history, XP and the original skill tree. An equipped title is only displayed while the supporting completion count is still eligible. Backup and restore carry the new metadata.

`node dev/quest-workstation-test.js` tests all eight reachable routes through all three ranks, upgrade preservation, evidence rules, practice availability, title eligibility after undo, idempotent blueprints, enjoyment/refund accounting and invalid imports. The isolated Electron journey `dev/checks/quest-workstation.js` tests the actual dialogs, proof gate, equipped keepsake, personalized reward, receipt flow, controls, narrow layouts and reload persistence. Its reviews are explicit fixtures, not live artistic judgments.

Run `node dev/run-checks.js quests --out <directory>` with `ELECTRON` pointing at the installed binary. The suite includes the existing journal, studio, session, proof and mixtape journeys plus the new workstation journey and core checks. Run `node dev/boot-test.js` for startup budgets. Screenshots and logs are retained in task outputs under `studio-forge-shots` and `studio-forge-checks`.

Windows validation on 2026-10-17: all ten check types passed across the main run and corrected journal rerun. The first run reported 9/10 because the old journal test hard-coded the previous purple color; its assertion now follows the current catalog palette, and the full journal/recovery/reload journey passed in `studio-forge-recheck`. The final workstation replay also verified the new title celebration/link (51 UI checks plus reload, no page errors). Desktop/narrow screenshots were inspected. Syntax/diff checks and startup budgets pass: 72 initial scripts / 2,288 KB, 29 styles / 446 KB. No live model calls were needed; a native Mac run remains for integration.

## Release handoff

Branch: `codex/studio-forge-progression`, based on `codex/studio-quest-variety` (PR #10). If #10 is still unmerged, the new PR against main contains both passes. Claude owns integration into main and the normal Hearth updater release. No live application data, configuration or running process is changed by this branch. Coordination is in GitHub issue #2.
