# Project quest guide

Opening a quest shows its goal, first action, time and reward with **Accept quest** and **Not now**. Acceptance adds it to the journal and tracker and opens the first action. Hearth infers the project and tool; there are no recipe or workspace dropdowns. Existing guides offer **Continue quest**, restoring their saved progress even after switching to another quest. Declining changes nothing.

The quest helper can attach to a Hearth project. Making quests have a small starting action, a saved-work milestone, a play/listen/review prompt, and a result to keep for proof review. Planning quests such as choosing a track use their own smaller steps. A compact next-step card lives beside the project chat. Accepting alone gives no XP.

Saved scene, creative-board and instrument changes are checked against a checkpoint in the selected project. New worktable images, saved presets and linked exports are recorded as kept results. A save is evidence of a change, not a quality judgment: XP completion and the review still use the existing proof flow. Manual confirmations are labelled separately from observed changes in the helper's evidence history.

Checks run after successful saves or an explicit Check button. Creative guides do not poll running applications. Missing or unreadable scene data, stale steps, paused guides and metadata-only scene edits cannot silently complete a step. Opening a guide from a project leaves that project loaded.

Validation: `dev/questguide-project-test.js`, `dev/questguide-test.js`, `dev/questguide-picker-ui-test.js`, `dev/checks/quest-project.js`, `dev/checks/quest-offer.js`, `dev/checks/guided-quests.js`.

# Windows canvas rendering

`/graphics canvas graphite` selects Chromium's Graphite canvas renderer on Windows at the next launch; `/graphics canvas auto` restores the usual renderer. The choice leaves scene resolution, antialiasing, effects and game logic unchanged. Mac and Linux retain their default renderer even when the setting is synced. Existing command-line features are preserved; an explicit Graphite disable is respected. A failed start or GPU-process crash marks the choice for fallback on the next launch.

This is an explicit per-setup choice, not enabled for every graphics card. Validate real gameplay on the target computer before selecting it. `dev/gpu-canvas-test.js` covers selection and fallback; `dev/gpu52-test.js` covers the existing graphics behavior.
