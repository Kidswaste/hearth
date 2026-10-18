# Lightweight projects and quiet background pages

The owner's PC remained laggy after the navigation consolidation. Read-only inspection found `kv/projects.json` at 148,358,788 bytes for two projects. One project held 409,603 rows but only five distinct references: two capture rows were repeated 327,680 and 81,920 times, with identical metadata. The index was repeatedly parsed, copied across IPC, indexed and scanned by the chat list.

The path translation used by sync changed a project item's `ref` between Mac and PC, but left its derived `type:ref` ID unchanged. Renderer normalization rebuilt that ID, allowing identical references to accumulate across joins. Project normalization did not remove duplicate rows.

## Changes

- Project compaction collapses exact duplicate records, retaining differing metadata, unknown fields, project IDs, notes and every distinct reference. Linked files are never touched.
- Sync rebuilds derived project item IDs after translating paths, and compacts project indexes before merging. Twenty simulated Mac/PC round trips keep one capture as one capture.
- Large indexes are compacted on the storage worker before their contents cross IPC. Before replacing a valid index, it keeps an immutable byte-for-byte copy under `data/kv/.project-recovery/`. The repair refuses to write if the source changes during the read, backup or preparation. A failed backup prevents replacement; unreadable/fallback sources are not repaired.
- Projects Home uses the active surface to determine visibility. `offsetParent` incorrectly reported Home as visible behind Chat/Life because inactive Hearth surfaces use `visibility:hidden`. Hidden project changes now mark Home stale without rebuilding cards, and returning draws current data.
- Concurrent project source requests share one pending read. Invalidated reads cannot overwrite newer cache results.
- A sync refresh updates the in-memory project view without echoing another save back to disk.

## Evidence

On a read-only copy of the owner's actual index, exact compaction gives **2,408 bytes / five rows**, preserving the complete set of distinct records. Mean JSON parse across three runs on this PC: **434 ms before, 0.02 ms after**. The one-time compaction takes about one second on the storage worker; this is not a claim about total app latency.

`dev/project-index-test.js` checks conflicting metadata, unknown fields, immutable backup bytes, changed-source refusal, failed-backup refusal, path round trips and a real worker read of 409,600 repeated references (528-byte result). Isolated Electron checks in `dev/checks/projects-lightweight.js` use `HEARTH_LOOPLAG=1` to count actual IPC: twelve concurrent thumbnail callers make one request, sync refresh makes zero save requests, and hidden Home has zero DOM mutations. The same check passes with a 409,603-reference startup fixture. Navigation and saved chat/project/quest preservation checks also pass.

Existing projects, sync, store-thread, data-safety, boot and lazy-group suites pass. Two existing test fixtures were made portable to Windows: an uncreatable Mac `Icon\r` filename is tested by predicate, and an injected held-file error uses the host separator.

The update needs a clean restart to load the new storage worker and release the old oversized in-memory index. Forgeheart styling, models, creative tools and quest content are unchanged. This fixes measured project-index/background work; GPU-heavy live scenes remain a separate workload.
