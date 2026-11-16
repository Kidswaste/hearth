# projclean182: a clean Projects screen (round 182)

The owner's ask: "change how projects are handled and presented, make the UI very minimalist and clean, and more about
what the project is gonna be, with suggestions or follow-ups of a different series. Hide all the past projects under
the old player in a separate, 'Older version' under-folder. Separate games from music from videos at creation."

## Shipped
1. **A card is a cover, a name and one line.** The line is what the project is going to be: `p.pitch` (new, ≤ 200
   characters), else its description, else the first line of its notes (`ProjKindCore.pitchOf`). A project without
   one shows "What is it going to be?" on hover. Gone from the card: the count line, the three continue chips, the
   mark beside the name. They are in the tooltip, the ⋯ menu and the Continue card.
2. **Games · Music · Videos.** `workspace.kind` is `'game' | 'music' | 'video'` (it was `'game'` or nothing). Without
   one, the kind is read from how the project started (`workspace.start`: visualizer / particles → music, footage /
   model → video, game → game). Tabs with counts above the cards; "Not set" appears only when some have no kind.
3. **Continue.** The project last worked on is one wide card (cover, name, line, its chat / scene / render chips). Only
   on the unfiltered "Last worked on" view.
4. **Pins, an order, a series.** ★ pinned projects come first (`p.pin`). Order: last worked on, newest, name. A project
   can belong to a series (`p.series`): it shows under the card and the bar can list one series.
5. **"Older version".** A project whose scenes were all made for the old player (none has `format: 'gpu'`) is folded
   under "Older version · N" at the bottom, closed by default (`ProjKindCore.shelfOf`). The scenes' formats come from
   `Projects.Src.sceneFormats()` (the Lab's list when loaded, else `kvPick('three-sketches', ['id', 'format'])`). A
   project with no scene here, or one new-player scene, stays current. The owner can move any project either way
   (`p.shelf`; project menu). Nothing about the project changes: it opens, edits and renders as before.
6. **What could come next.** Under the cards and on a project's Desk: three follow-ups in the project's series (a
   sequel, a trailer, its theme as a visual…) and three ideas for a different series, one per kind
   (`ProjKindCore.followUps`, no AI). ✦ Ideas from the AI asks once (`ideasPrompt` / `parseIdeas`, one small call on
   the click) and keeps the answer on the project (`p.ideas`). A click opens the new-project card with the kind, name,
   line and series filled in.
7. **Kinds at creation.** The new-project card opens with three choices: Game, Music, Video. Each shows only its own
   starts (`ProjKindCore.STARTS`), picks its first start and a fitting personality, and is saved as the project's kind.
   Nothing picked keeps every start, and the kind is read from the start. "What is it going to be?" replaces "What are
   you making?" and becomes the card's line. ✦ Suggest a name is told the kind.
8. **Conveniences.** `/` focuses the search and `N` opens a new project on the Projects screen; on a card: Enter
   opens, F2 renames, P pins, the arrows walk the cards. Project menu › What it is: What it is going to be…, Kind,
   Series…, Pinned to the top, Move to "Older version" / back. The animated front-page banner only shows when it is
   switched on (Projects › ⋯ › Animated frontpage).

9. **More conveniences.** A card dragged onto Games / Music / Videos becomes that kind; onto "Older version", it is
   folded there (Undo in the note). Projects › ⋯ › ✦ Sort my projects gives every project without a kind or a line
   both, in one small AI call (`sortPrompt` / `parseSort`; what is there is never changed). The Continue card and a
   project's Desk show where it stands: the brief's next step (kv `project-briefs`) and the moodboard's mood (kv
   `mood-reads`). "Earlier chats" is always last, never Continue, never folded. A project made before kinds is sorted
   by its personality (game builder, music producer), then by plain words in its name and line ("Visualizer3", "a
   loop for a techno song"); the Lab's game features still follow `workspace.kind` only. `/new-game`, `/new-music`,
   `/new-video [name]`. The new-project card offers the kind made last.

10. **▶ Play on a game's card** (`playProject` → `GameMode.play({ kind: 'lab', id: workspace.sceneId })`): only for
    `kindOf(p) === 'game'` with a main scene. Checked: it starts the play window from the card.
11. **After a review of the diff**: a project made now is marked `shelf: 'current'` (a start that still makes an
    old-format scene no longer lands it in the fold); a series filter whose series is gone is dropped; a kind set by
    drag, the menu or ✦ Sort doesn't stamp the project as worked on (`setWorkspace(p, patch, { quiet })`).

## Where it lives
- `projkind-core.js` (new, pure; group `projects`): kinds, the line, the shelf, the lists, follow-ups, the AI prompt.
- `projects-home.js`: `paintHome`, `card`, `nextIdeas`, `ideaRows`, `askIdeas`, `editPitch`; the Desk's line and
  "What could come next"; `S.formats`.
- `projects.js`: `Src.sceneFormats`, `setField(p, 'pitch' | 'series' | 'pin' | 'shelf' | 'ideas', v)`.
- `projcreate.js` / `projcreate-core.js`: the kind buttons, the filtered starts, `kindAndPitch`, the series line.
- `projmenu.js`: the "What it is" section. `projclean.css` (new, last in the group's CSS).

## Checks
- `node dev/projkind-test.js` (unit).
- `node dev/smoke.js --fake-engines --script dev/checks/projclean182.js` (silent): the cards, tabs, fold, pin, line,
  menu rows, ideas → the filled-in card, kinds at creation, Create.
- `dev/checks/project-workspaces.js` waits for the new screen instead of the hero banner.

## Not done / not verified
- Previewed once over a copy of the owner's project list (26 projects, 54 scenes, 6 of them v2), in a throwaway app
  copy: 4 current (Ascend to Heaven, Idleworld, Stroben, Visualizer3) plus Earlier chats, 21 under "Older version",
  Clink among them (its two scenes are old-format; ⋯ › Move back with the current projects). Not seen in the owner's
  own running app.
- A pin, a shelf move and AI ideas don't stamp the project's `updated` time (so Continue stays put); if the two
  computers change the same project at once, that change may lose to the other side's.
- When no project is current (all are older), the fold is open by default.
- Existing projects have no line until one is written (or a description exists).
- The Desk (a project's own page) keeps its layout; only the line and the ideas were added.
- macOS not checked.
