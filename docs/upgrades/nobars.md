# No bars (round 21): the colored left bars are gone

You said: "would love to remove most colored left bars in most UIs". This pass found every colored left accent bar in
the app's stylesheets and removed the decorative ones. The bars came in four forms: `border-left`, `box-shadow: inset
Npx 0 0`, a thin `::before` strip and a left-edge glow. There were none in JS inline styles or HTML. Where a bar told
you something (a status, who wrote it, what's selected or changed, a priority), that information is still there in a
quieter form: a small colored dot, the text or icon color, a soft background tint, or a tinted frame. The change applies
to every look: Forgeheart, Forgeheart Classic, Swirl, the Bold / Light / Plain looks and the glass looks. Text stays
where it was. Where a bar sat inside the padding, the padding grew by the bar's width.

56 bar rules were removed across 15 stylesheets. The functional lines that do a job are kept and listed at the end.
Pure CSS: no new settings or commands, and nothing to load.

## Chat
1. **Your messages**: the bubble keeps its agent-colored tint. The 2px agent-color edge is gone (Forgeheart, Classic,
   Swirl).
2. **Thinking blocks**: no violet bar. The thought reads as indented, muted italic text under its violet "Thought
   process" header.
3. **Tool steps** (the ⚙ chips): no violet bar. They keep their violet text and soft violet tint (Forgeheart, Classic).
4. **Quotes**: no bar. A blockquote is indented italic text. In the Forgeheart looks it is lightly warmed toward gold.
5. **Callouts** (`> [!NOTE]`, `[!WARNING]`…): no side bar. They keep their tint and icon, and the title now takes the
   callout's color.
6. **Notes in the chat**: the Forgeheart info-blue left edge is gone. The thin frame and blue tint stay.
7. **Error messages**: no red side bar. The red frame, the red tint and the shake stay.
8. **Second opinions**: no cyan bar. The cyan "🔎 Second opinion from…" header names them.
9. **Astra's replies**: no teal bar. The ✦ in the chat title and Astra's avatar say who is answering.
10. **Pinned replies**: the purple edge is replaced by a soft accent tint behind the reply, next to the 📌 mark.
11. **Answered questions** (❓ → answer rows): no orange bar.
12. **A reply being written** (Forgeheart, Classic, Swirl): the rainbow / swirling edge is gone. The typing dots, the
    "Writing · N s" status line and the shimmer show it. This also fixes a small layout jump: the reply used to be
    indented 14px while streaming and moved left when it finished.
13. **Queued messages** (the chips above the composer): no violet bar, a slightly stronger violet tint instead.
14. **Flow cards** (the live Doctor / flow card in a chat): the status bar is now a small glowing dot before the title.
    Gold means waiting for you, violet running or waiting on the AI, green done, orange stuck or stopped.
15. **Comp cards** (/dispatch parts): no colored edge per part row. Each part's glyph already carries its chat's color.
16. **Jam directions** (Claude ↔ Astra): no side bar. Directions are rounded chips tinted teal (Astra) or orange
    (Claude).

## Toasts
17. **Toasts** (Forgeheart, Classic): the 3px colored left edge and its left glow are gone. Toasts are an even glass
    panel.
18. **Error toasts**: a red-tinted frame and a faint red background replace the red bar.
19. **Render done / failed toasts**: a green- or red-tinted frame replaces the bar, in every look.
20. **Director-chat toasts**: the chat's glyph in its color plus a frame tinted with that color replace the bar.
21. **Celebration toasts** (the "pop" ones): a gold-tinted frame instead of a gold bar.

## Menus, palette, lists
22. **Right-click menus and submenus**: the hovered row is a soft gold wash and gold text, with no gold edge.
23. **Ctrl/⌘+K palette**: the selected row is a gold wash (slightly stronger), with no edge (Forgeheart and Classic).
24. **Slash menu** (typing `/`): same as the palette, a wash and no edge.
25. **Keyboard-shortcut highlight** in menus (rows lit by Ctrl/Alt) and the **keys sheet**: a tint only.
26. **Chats list**: in Forgeheart Classic, the active chat lost the gold strip floating inside the row. The row's gold
    wash and white text mark it.
27. **Director chats in the list**: the chat-colored edge is gone, active or not. Each row's colored glyph (and the
    working dot) still shows which chat is which.
28. **Make groups** in the chats list: no colored edge. The make's colored mark and name head the group.
29. **Tool rail**: the open tool keeps its gold wash and gold icon, without the gold edge.
30. **Prompt library and library rows**: the selected row is a gold wash, with no edge.
31. **Memory**: a pinned fact has a gold-tinted frame instead of a gold edge.
32. **Node editor menus and the node picker**: hovered and selected rows are a tint with no edge.
33. **Capture region picker**: keyboard focus is now a thin gold ring with a tint, so it is still clearly visible.
34. **Tooltips** (the forged ones): an even thin frame, with no gold edge.
35. **Pinned strip** at the top of a chat and the **Present** hint / HUD: no gold edge, the glass stays.

## Lab
36. **Sliders, a changed slider**: the gold edge is gone. A changed slider keeps its gold tint, and its name turns gold
    in every look, where before only Forgeheart did this.
37. **Sliders, music binding box**: a rounded cyan-tinted box, no cyan bar.
38. **Sliders, the notice** ("no sliders yet"…): a rounded red-tinted box, no red bar.
39. **Layers, the selected layer**: a gold tint (slightly stronger) and its bold name, no gold edge. The layer row's
    text no longer depends on a transparent 2px border.
40. **"Your sketches"** picker: when a director chat owns the open sketch, the picker's frame takes that chat's color
    instead of a thick left edge.

## Elsewhere
41. **Forge Debug → Tasks (kanban)**: cards lose the 3px left border. Priority 1 is now a small red dot before the
    title.
42. **Makes → a stuck part**: a soft red tint and a red icon instead of a red edge.

## Kept on purpose (functional, not decorative)
- **Resize handle** between the chat and a docked tool (`.tool-dock-divider`, 1px line): it is the thing you drag.
- **Pane dividers** (1px neutral lines): the tool dock's left edge, the Flows side panel and the node dialog side panel.
  They separate two panes. They are not accents and are not colored.
- **Segmented-button separators** (1px neutral lines): `.seg`, the meter switch, the Lab stage pill, Save | ▾ split, the
  loop chip ×, the slider look ×. They divide the buttons of one control.
- **Lab compare wipe line** (`.lab-wipe-bar::before`): the before / after split you drag.
- **Sequence playhead** (`.sq-playhead`): the current time on the timeline.
- **Capture scrubber in / out edges** (`.cap-scrub-io`): the edges of the selected range.
- **Layer drag insertion line** (`.ly-row.drop-target`, along the top): shows where a dragged layer will land.
- **Board rotate-handle glyph** (`.bd-h-rot::after`): a drawn part of the handle icon.
- **Capture caption presets**, "Lower third" and "Split title" (`.cap-caption-lower`, `.cap-title-split`): these are the
  design of the video being recorded, not app chrome, and the gold rule is part of each preset's look.
- Not left bars, so out of scope: top edges (the director chat header's top line, the code block's top line) and the
  rail's right-edge hairline.

## How it was checked
- `dev/checks/nobars.js` (new) builds a chat with thinking, tool steps, a quote, a callout, a note, a flow card, a
  pinned reply and a second opinion. It also shows a streaming reply, toasts, a hovered menu, the palette, the Commands
  page, Settings, the Board, Renders and the Lab with a changed slider and a selected layer, plus a sheet of the rarer
  parts (kanban, jam, comp, makes, keys sheet, render toasts…). It screenshots each one in Forgeheart, Classic, Swirl and
  Plain, and lists every visible element still drawing a left bar (a left border wider than the others, an inset left
  strip, or a thin `::before` strip). **Before: 36 distinct bars detected across the surfaces and looks, after: 0.**
- polish, qa-mac, chatcore and smooth-app were run. qa-mac, chatcore and smooth-app pass. polish reports `ok: false`
  with exactly the same output on the untouched base commit, because of its Shuffle-die and long-tooltip probes. That
  failure was already there and is unrelated to this pass.
