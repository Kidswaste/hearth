# Pick up where you left off

Opening a project restores its last tab, conversation, scene and Creative board
tool on this computer. Explicit Scene and conversation links still open exactly
what they name. The return points are small, bounded local preferences: they do
not rewrite or remove project links when a resource has not arrived from sync.

Click the project name in the toolbar to switch among recent projects. Switching
uses the existing save/unload/preload path; the app never keeps a second live
project running in the background.

The desk keeps expanded sections and module/file searches while moving between
tools. Notes update the project model immediately, with its existing batched disk
writes, so closing or repainting the desk cannot discard the last typed words.
The file shelf builds no item rows until opened, shows 60 at a time, and offers
search, type filtering and Show more. Its modules belong to the selected scene.

Validation: project-continuity-test covers fallback without data mutation. The
isolated Electron project-continuity check exercises related chats/scenes,
independent return points, draft and notes retention, lazy file pagination,
filters, the project switcher and a real reload. Lifecycle/fluidity checks cover
clean unload, cancellation, failed saves and retained workbench/composer views.
