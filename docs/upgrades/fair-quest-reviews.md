# Fair quest reviews

Quest reviews now combine the current proof with earlier submissions from that same quest. A character rename explained in an earlier submission, an uploaded pose sheet and a later chat test account can inform one review. Evidence stays bounded (eight images maximum, older excerpts capped at 16,000 characters), with explicit image indices and omission markers. Earlier artifacts are version context, not automatic proof of the latest state.

Completion is judged against the accepted goal. Relevant extra work is credited; scope reminders do not penalize doing more. Concrete reported tests are accepted as reported evidence without pretending the reviewer played the game. Optional polish is separate from completion, and assessable partial work can receive a score even when a required step is missing. Unsupported completion claims and unrelated artifacts still cannot finish a quest.

“Reconsider with all my proof” creates a new review entry while retaining the original proof and verdict. Model failure leaves the new entry retryable. Existing limits, completion checks and one-time XP awards apply. There is no automatic rewrite of past reviews or completion of quests.

Selecting a Hearth message also saves up to four local still images from its structured media/opened-file metadata. This includes generated before/after comparisons previously dropped by the text-only handoff. No arbitrary paths in prose or remote URLs are fetched. A reconsideration can recover missing images from the exact original message, provided its ID and submitted text still match. Missing media never erases saved proof. Evidence previews and coverage identify what was actually attached.

Validation: quest-review unit checks, quest core checks, isolated renderer failure/retry/history persistence check, and boot checks. All changes use platform-independent renderer code and existing storage/sync contracts.
