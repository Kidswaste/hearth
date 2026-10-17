# Sidequest Studio: glass and life expeditions

This pass adds a smoked-glass finish and six opt-in life expeditions to the Forgeheart workstation. It builds on the pending mixtape and personal progression passes. Claude owns main integration and the updater release.

## How to try it

Open **Life expeditions** in the workstation controls, **Explore life quests** in the notebook, or the shortcut in Project crate. Preview all three checkpoints before accepting. Add a personal note, accept the route, then open its next checkpoint. The existing proof submission, Astra scorecard and explicit completion flow applies.

| Expedition | Three checkpoints | XP total |
| --- | --- | --- |
| Reclaim the command desk | Clear one patch, prepare the setup, use it | 60 |
| Defeat one open tab | Name the task, take one action, close or hand off | 75 |
| Take the artist outside | Notice three details, keep one, turn it into art | 75 |
| Open a co-op lobby | Think of someone, draft an invitation, choose something to share | 60 |
| Rescue the almost-finished | Choose a small survivor, make one change, keep a version | 75 |
| Make tomorrow easier | Save a breadcrumb, remove an obstacle, return later | 60 |

The route map shows finished and skipped checkpoints. All three finishes earn the route's keepsake badge, also visible in the existing collection. Skipping advances the route but does not award its XP or badge. Letting a route rest preserves its work; saving it again resumes it. No expiry or streak penalties. Each route is accepted once, with stable IDs and saved content; re-entry never resets its proof or mints XP. Routes use campaign capacity, not the three side-quest slots.

Life quests use the existing Everyday Adventurer path, Return specialist and Finish-line collector ranks. A concrete note, draft or checklist can be the evidence when the brief asks for it. The reviewer rates that evidence and states the limits of self-reported actions. Scores do not rate the person's worth, health or productivity. No other person's reply is required. A doorway or window is an alternative to going outside. Rest is never gated behind a reward.

Personal route notes stay in the local journal and exported backup; they are not inserted into review prompts. Proof is sent only through the existing explicit submission action. Suggested follow-up dates are notes, not reminders. No messages, appointments or purchases are performed by these routes.

## Visual behavior

Thick colored left rails become thin neutral borders. Charcoal panels use static layered gradients, corner accents, highlights and rounded edges. Buttons have an inert, clipped reflection layer that sweeps on pointer hover or keyboard focus. SVG desk objects, skill connections and selected-navigation markers remain intact. Life cards enter in sequence and their illustrations lift on hover. Violet, pink, gold and ember accents distinguish the routes.

No pointer tracking, rendering loop, blur or backdrop sampling is added. New animation uses transforms/opacity and finite durations. Both the journal's motion switch and the system reduced-motion preference disable the new movements. The feature remains within the existing lazy-loaded quest group; global Forgeheart CSS and first-screen assets are unchanged.

## Checks

`node dev/quest-life-test.js` exercises opt-in acceptance, catalog isolation, all 18 proof-gated finishes, exact XP, skip/undo/pause, capacity and ID collisions, note validation, persistence and the everyday review scope. `dev/checks/quest-life.js` runs the UI with labelled review fixtures in an isolated profile, checks the real hover effect, accepts/reviews/rests/resumes a route, checks narrow layouts and motion settings, and reloads Electron to verify persistence.

The `quests` check group includes both new checks alongside the existing journal, proof, session, mixtape and workstation checks. Screenshots are saved under `outputs/studio-glass-life-shots`. Live review quality and native macOS behavior still need real-use verification; fixtures validate the workflow without spending account usage.
