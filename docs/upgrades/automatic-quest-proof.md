# Automatic project quest proof

“I reached the finish line”, the project quest helper’s Review action, and the tracker’s finish action now gather relevant proof from the quest’s own linked project chats and start Astra’s review. Opening a quest does not send anything. A saved passing review is reused; XP still requires completion and is awarded only once.

The collector reads at most three linked chats and examines their last 60 messages locally. It selects up to four relevant results, favoring work since acceptance and explicitly labeling any older baseline. It retains chat excerpts, copies up to four linked still images, and can ingest up to two linked text/code, audio or video exports through the existing read-only proof pipeline. Audio remains a technical review, and video is sampled frames. Files must be explicitly linked in message metadata; no project-wide disk scan or remote fetch is performed. The bundle keeps source chat links, media previews and coverage limits.

No matching recent work opens the manual proof picker with an explanation. A busy reply pauses collection. Closing the gathering dialog cancels it; saved proof remains retryable after model failure. Double clicks and unchanged proof do not create additional review requests. Existing submissions and completed quests are untouched.

Validation covers project isolation, stale/unrelated work, missing exports, cancellation, content fingerprints, real local image/text ingestion, failure/retry, duplicate clicks, helper/tracker entry points, source persistence and XP. The actual Clink chat also yielded its saved Brushstroke comparison and test notes without a model call or journal change.
