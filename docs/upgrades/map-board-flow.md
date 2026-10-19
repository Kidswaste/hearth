# Easier map and Creative board editing

Map search filters pins without moving the camera or replacing the selected
place's information. A small result row offers eight direct choices, a count,
Fit all matches and Clear. Enter chooses the first result, Down focuses it and
Escape clears search. The map also has Fit shown places. Its position and zoom
are remembered on this computer, including after a restart, without syncing
view preferences to the other computer.

For large catalogs the existing worker still performs spatial queries. While
waiting for its latest result, existing pins and routes move with the map
instead of remaining behind. The visible-tile loading and provider identity,
quiet zoom rules, event sources, personal places and quests are unchanged.

Storyboard duration and title edits update existing shot buttons and thumbnails.
Reordering keeps their identity and keyboard focus. A three-image cache reuses
decoded frames, preloads the next frame and retains the current preview until
the next image is ready. Playback uses cached timing and geometry. Closing the
editor stops animation, disconnects observers and releases its image cache.

Focus the storyboard preview or a shot: Space plays/pauses, arrows select, and
Alt + arrows reorder. Selection scrolls only the horizontal timeline. On the
sketch canvas, Ctrl/Cmd Z undoes; Shift Z or Ctrl/Cmd Y redoes. Text fields keep
their own normal shortcuts. Re-clicking the current Creative board tab keeps
the editor warm. Text and slider changes enter the existing batched save queue
as they happen, so leaving before blur does not discard them.

No data format or project migration is involved. Verification includes pure
map framing cases and an isolated Electron workflow with 24 storyboard shots,
input-without-blur persistence, cache reuse, editing/reordering/limits,
Windows/Mac shortcut modifiers, search focus, delayed worker results against
10,000 places, viewport persistence and worker disposal. The existing
responsive-studio-map check now expects the warm editor introduced by project
fluidity rather than requiring its canvas to be destroyed on every return.
