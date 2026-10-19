# Switching between PC and Mac

Sync accepts UTF-8 JSON exported with a Windows BOM, including attachment metadata
and moodboard manifests. Both the main-process reader and the background hashing
worker use the same parser. The original local export is left unchanged.

QA browser profiles and native MSVC build caches stay on their own computer.
Previously mirrored copies are left untouched; they no longer trigger locked-file
rename loops. Project source code, exported media and ordinary project folders
still sync. Cloud metadata writes no longer retrigger the watcher, and numbered
copies of a machine's journal are not treated as separate computers.

Before an incoming sync replaces an existing chat or KV store, Hearth saves its
current local version to `data/sync/recovery/`. There is one previous version per
file, keeping storage bounded. If that recovery write fails, the replacement
stops. Sync's **Deleted files & previous versions** window can restore it; replacing
an existing version also keeps that version in the existing recovery trash.
Unreadable JSON now leaves sync pending instead of claiming it is finished.

The upgrade must be installed on both computers for both to use these safeguards.
The sync indicator describes the local computer's cloud mirror, not a guarantee
that iCloud has already delivered the files to the other device. Wait for iCloud
and Hearth to finish syncing before editing on the other computer. Existing
automatic backups and the conflict/recovery copies remain available.

Validation: two-computer sync tests cover concurrent messages, project references,
scene layers, quest progress, stale in-memory writes, restart, BOM exports, cache
exclusion, previous-version recovery and failed recovery writes. Store-worker
tests cover the same encoding. The Electron smoke check verifies received chat
messages and the recovery UI in an isolated copy.
