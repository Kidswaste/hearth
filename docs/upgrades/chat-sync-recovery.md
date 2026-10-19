# Chats survive a missing cloud copy

Clink stopped opening because its linked chat disappeared from the iCloud mirror.
Sync treated the missing file as a remote deletion and moved the current local
conversation to its recoverable sync trash. The project references and scene
remained intact, but the project could no longer resolve its chat.

Sync now preserves a surviving chat unless the side where it disappeared has
the same conversation in Hearth's `trash/<id>.json`. That is the move performed
by Hearth's Delete action. A missing file, a cloud replacement in progress, an
unreadable trash copy, or an older trash copy cannot remove the surviving chat.
The remaining copy is republished or pulled back. This protects standalone and
project chats on Windows and macOS without changing their saved format.

Delete and Undo Delete inside Hearth still sync. Removing a chat JSON manually
outside Hearth is now treated as missing data and repaired from the other copy.
Ordinary assets retain their existing deletion, recovery and mass-deletion rules.
No project, scene, chat or quest migration is needed.

Validation: `node dev/sync-test.js` covers missing local/cloud conversations,
older trash copies, cross-platform Delete/Undo, restored chats disappearing again,
ordinary file recovery, and randomized two-computer edits. `node dev/boot-test.js`
checks startup and lazy module wiring. Live recovery used Hearth's existing sync
restore API, retained Clink's latest Brushstroke conversation and 58 scene layers,
and verified scene/chat/moodboard/creative-board navigation and the saved quest.
