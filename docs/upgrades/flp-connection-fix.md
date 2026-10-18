# FL Studio 2026 project connection

The saved-project reader now handles FL 25+ event `0xAC` as three bytes. Treating it as a four-byte event consumed the following opcode and lost the saved tempo, rejecting otherwise valid projects. The field layout is documented by [flpdiff's format research](https://github.com/dawhubapp/flpdiff/blob/main/docs/fl-format/fl25-event-format.md) and reproduced in an independent synthetic regression fixture.

Choosing a project shows a busy button and then its filename and saved BPM. Paused guides still get this preview and explain how to resume. Errors scroll into view rather than remaining above the setup panel; a rejected replacement preserves the existing connection. Selection alone still does not award old progress.

Validation: current FL 2026 project read-only (95 BPM and note records, unchanged file), older factory project, synthetic modern/legacy readers, persisted picker acceptance, paused preview, rejected replacement, saved-step progression and renderer feedback tests. No personal song content is included in fixtures or committed.
