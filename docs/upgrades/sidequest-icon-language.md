# Sidequest icon language

The Paris field-kit treatment now extends across the Sidequest notebook, campaigns, skill matrix, rewards, shelf, mixtape, life expeditions, commissions and quest dialogs.

Secondary actions use original SVG glyphs with consistent colors: pink chat/media, violet editing/settings, gold saved items/files, ember focus/discovery. The same action keeps the same symbol. Main verbs, proof submissions, removal/undo actions and purchase/restore confirmations retain their visible labels. The authored desk objects remain the main navigation, with compact spacing, colored selection and explanatory hints.

Repeated introductory copy is available through information buttons. These show text on hover or keyboard focus and open a readable dialog on click/tap. Skill modules offer their explanation on hover/focus and retain their full detail view. Quest requirements remain visible; the proof explanation is under a shield/info row. XP, time and sparks use colored statistic chips.

General hints use one manual-popover tooltip in the top layer so they are not clipped by scroll panels or hidden behind modal dialogs. They have accessible names/descriptions, viewport bounds, pointer-accessible text and Escape dismissal. A first Escape dismisses an open hint; a subsequent Escape still closes a modal normally. Navigation, scrolling, resizing and leaving Sidequest dismiss stale hints. The existing map hints retain their checked behavior. Dynamic timer, lamp and motion labels retain their glyphs and names when updated.

The discovery links are compact, and the active quest precedes them on narrow windows. Skill cards fit their shorter content. No quest ledger, catalog, price, budget, proof rule or storage migration changes in this pass.

## Validation and Claude handoff

- `dev/checks/quest-icons.js`: nine pages, named icons, visible primary labels, keyboard hints and viewport bounds, actual Escape key delivery above a modal, dynamic lamp/motion labels, explicit restore confirmation, unchanged progress from browsing, narrow layouts and screenshots.
- Existing `dev/checks/quest-workstation.js`: proof/ranks/titles, personalized rewards, redemption/refund, settings, narrow layouts, reduced motion and reload. Its old ten-blueprint assertion now checks the current catalog, which includes the previous release's field rewards.
- Existing `dev/checks/quest-focus.js`: desk ordering, map route, reward budget, chat image/WAV previews, narrow layouts and reload.
- Boot/lazy checks preserve the first-screen budget. Automated map images use offline fixtures.

Claude owns merging and Hearth's normal updater release. No live app restart or live journal writes are performed by this branch.
