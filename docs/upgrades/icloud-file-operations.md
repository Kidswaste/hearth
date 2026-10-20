# iCloud background freezes

The Windows sync path used synchronous renames on Electron's main thread. A
cloud-provider wait could therefore stop Hearth responding. Renames and their
destination checks now use asynchronous I/O, serialize writes to each destination,
and recheck the observed file before every retry. An unreadable destination is
never treated as an absent file that can be overwritten.

Windows cloud-file attributes are read in a bounded, hidden subprocess without
opening file contents. Files that still need downloading remain pending. Small
files and explicitly requested downloads retain their existing automatic read
behavior, but replacement/move waits for local availability. Unknown metadata
also defers changes. macOS retains its existing placeholder checks and downloads.
Attribute definitions: [Microsoft file attributes](https://learn.microsoft.com/en-us/windows/win32/fileio/file-attribute-constants).

The `speed` record (recent clicks, usage ranking and learned shortcuts) was already
designed as per-computer data but was missing from sync's exclusions. On the
affected PC it was repeatedly merged from iCloud's numbered copies, then moved
to cloud trash. It and its conflict copies now stay untouched in the cloud and
remain local on each device. Chats, projects, scenes and quest progress still sync.
No existing copies are deleted or reset by this upgrade.

Cloud duplicates wait until their data is available and their timestamp has
settled before being absorbed. Both `name (1).json` and `name(1).json` are recognized.
The sync indicator refers to this PC's mirror; iCloud transport to the Mac is
still managed by iCloud. Install the update on both devices.

Checks: temporary-drive two/three-computer sync tests (including concurrent chat
edits and fuzzing), download/metadata-failure safety, slow rename responsiveness,
retry-time concurrent writes, Windows metadata UTF-8/quoted paths, and boot checks.
Tests never rename or delete files in a real cloud drive.
