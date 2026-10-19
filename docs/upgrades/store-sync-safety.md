# Preserve whole tool stores across cloud gaps

A missing `kv/*.json` database no longer removes the surviving copy on the other computer. Sync republishes or restores it. Clear individual items inside Hearth as usual: edits to store contents, including deliberate empty lists, still propagate. Ordinary file and asset deletions still go to sync trash.

This protects scene lists, project lists, quest progress and tool settings when a cloud client briefly removes or renames a whole store. Existing versions remain in normal recovery history. Verified with two simulated computers, missing-cloud/missing-local cases, item deletion, asset deletion and the 220-operation sync fuzz run (138 checks).
