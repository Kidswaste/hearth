# Chat / Studio / Life

Hearth now has three main destinations. Existing surface, agent, project and quest IDs remain unchanged; this release does not migrate or delete saved content.

- **Chat:** assistants across the top, existing conversation history on the left. Assistant context menus, native chats and tool chat docks remain available.
- **Studio:** Projects, Visuals, Sound, Drawing, Storyboard, Materials, References and Forgeheart in one workspace row. Assets opens the existing worktable; Apps opens connected tools. Materials groups seamless tiles and surface maps. The nested Playground navigation and duplicate heading are hidden.
- **Life:** Today, Map and Progress. Today emphasizes the current quest, bookmarked session and accepted quests. Find a quest combines campaigns, commissions, mixtape briefs and life routes with interest/length/search filters. Saved ideas, saved cards and hidden cards have a shared fold. Map's My plans opens existing calendar plans, saved outings and guided journeys. Progress retains collection, skills, rewards and memories.

Old campaign/deck/commission/life links redirect to the filtered quest browser. Campaign pause/resume, personal route notes, skipped steps and completed proof remain accessible. Settings contains desk personalization, lamp/motion and journal backup/restore. The normal command palette and old shortcuts still work.

This is the first navigation consolidation: underlying project/worktable stores and outing stores retain their existing formats. The combined plans view does not rewrite or deduplicate those records. Tool-specific editors and assistants retain their own controls.

Validation: isolated Electron checks in `dev/checks/workspace-nav.js` compare saved chats, projects and the full quest journal before/after navigation, including an idea, saved card and session bookmark. The map's pre-existing initial public-place seeding settles before that comparison. The checks cover legacy links, assets, plans, desktop and narrow layouts. `dev/checks/guided-quests.js` verifies the real tile workspace, helper progress, proof gate and outing guide. Quest, life, deck and focus behavior suites plus boot and lazy-group checks pass. No extra first-screen script or stylesheet requests were added.
