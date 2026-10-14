# Lean attachments (round 40, attachlean): files, logs, pastes and pictures cost what the message needs

Attachments were the biggest token cost a single message could carry: a text file was pasted whole into the message
(up to 200 KB ≈ 50k tokens), a long paste the same, a picture went at its full size, and the same file attached again
three messages later was sent whole again. Now each attachment's chip shows what it costs before you send, and what
reaches the AI is what the message needs, with the rest one click (or one Read) away.

## How attachments reached the AIs (measured with the fake engines)
- **Text files and pastes** were inlined in the message as `<file name="…">…</file>`, whole, up to 200 KB; bigger files
  were refused (or, with file access, passed as a path for the AI to open itself). A paste over 6,000 characters became
  a text file, cut at 200 KB.
- **Pictures** were saved in Hearth's attachments folder (or used where they are) and listed in the message; Claude
  opens them with its Read tool (turned on for that message, `--add-dir` the attachments folder), Astra gets them with
  `-i`. Full size.
- The chat's history keeps every message, so whatever went in is re-read (mostly from the cache) on every later step.

## Before → after (tokens, `node dev/attachlean-test.js --table`)
| attachment | before | after |
|---|---:|---:|
| 2,000-line code file (native.js, 150 KB), "why does renderChips not show the cost?" | 35,907 | 2,253 (−94 %) |
| 5 MB log, "why does it crash when I send?" (pasted: cut at 200 KB; as a file it was refused) | 51,200 | 1,616 (−97 %) |
| 4K screenshot 3840×2160 (at its full size) | 11,060 | 1,844 (−83 %) |
| long paste (47 KB of notes), "tighten the pacing notes for shot 42" | 12,044 | 1,514 (−87 %) |
| the same code file again, next message | 35,907 | 42 (−100 %) |
| …changed by one line | 35,907 | 126 (−100 %) |
| the code file in two messages | 71,814 | 2,295 (−97 %) |

End to end (`dev/checks/attachlean.js`, fake Claude reporting what it really got): a message with a 147 KB code file,
a 4K PNG and a 20 KB paste reached the engine as **8,880 characters (≈ 2.2k tokens)** + one **1568 × 882** picture,
instead of ≈ 167k characters (≈ 42k tokens) + the 3840 × 2160 picture. The same file in the next message:
**254 characters**. A one-line edit: a 5-line diff. "Send whole" sent the 146,852 characters and the original picture.

Tokens ≈ characters / 4; pictures ≈ width × height / 750. Fixed prompt tokens are unchanged (`unit:tokens-test`), and
prompts stay byte-stable (`unit:cache-test`): nothing in the system prompt changed, and the same attachment with the
same message always gives the same bytes (tested).

## Upgrades
### The cost on each chip (before sending)
1. **Every attachment chip shows its cost**, tiny and plain: "≈ 800 tok", "≈ 1.3k of 37k tok", "sent at 1568 px · ≈ 1.8k tok", "same as 14:02 · ≈ 40 tok".
2. **Its hover says what will happen** in words (what the AI gets, what stays on your computer, how to change it).
3. **"Send whole" is one click on the cost** (it turns gold and reads "whole · ≈ 37k tok"); click again to go back. Only for that attachment, only this message.
4. **`/send-whole [on|off]`**: all of this message's attachments whole (or trimmed again).
5. **`/attach-costs`**: what the attachments in the chat box cost, as sent and whole.
6. A sent message's attachment chips say on hover what each one cost ("Sent ≈ 1,445 tokens of ≈ 36,694", "at 1568×882 px", "Not sent again: the same as at 14:02").
7. Keys sheet line: click the cost on a chip to send it whole.
### Pictures
8. **Pictures over 1568 px are sent as a 1568 px copy** (what the models work at); your file is never touched and the chip still previews it.
9. The copy keeps the format (PNG stays PNG so text stays crisp, JPEG stays JPEG); GIFs are never re-encoded (they may move); scaling runs off the main thread (createImageBitmap).
10. Video contact sheets and Lab frames over 1568 px get the same treatment.
11. **The same picture again in a chat** isn't sent again: one line says it's the one from 14:02.
### Big texts (files, logs, pastes)
12. **A big text goes as an outline + the parts your message is about**: the words you use (function names, quoted bits, "shot 42"), the line numbers you name ("line 340", "lines 10-20"), the whole function you name.
13. **Code outline**: functions and classes with line numbers (≤ 60, the outermost first); each part says why it was picked and which function it's in.
14. **Logs**: one summary line (lines, first → last time, error lines and kinds, warnings), its first and last lines, every kind of error once with its stack trace (first and last time, "×54"), repeated lines counted once.
15. **The whole file is one Read away**: its copy sits in Hearth's attachments folder and the message says where; Claude gets its Read tool on that folder for the message (Astra reads it with its read-only commands when it has file access).
16. An AI that can't open files (Astra without file access) gets texts up to ≈ 12k tokens whole (quality first), and is told to ask for other lines above that.
17. **Text files up to 64 MB can be attached** (was 200 KB): a 5 MB log is fine now, from the picker, a drop or a paste.
18. **Dropping a big text file on a chat** (Finder / Explorer) attaches it trimmed instead of "too big to paste in".
19. Small texts (≤ 4k tokens) are sent exactly as before.
20. Very long lines (minified files) are cut at 400 characters in the parts.
### Long pastes
21. **A paste over 6,000 characters becomes a "Pasted text" chip** with its cost ("≈ 712 of 4.9k tok"), following the same rules; the toast keeps "Paste as text".
22. Pastes are no longer cut at 200 KB (up to 64 MB, trimmed when sent).
### The same file again
23. **Attached again, unchanged**: one line ("Unchanged since your message at 14:02: it's earlier in this chat"), with where the whole file is; the chip says "same as 14:02" before you send.
24. **Changed**: only the changed lines, with the new line numbers ("1 line added, 1 removed"); a rewrite (diff over half the file) goes as new.
25. **Safe by design**: a reference is used only while the AI's session still holds that message (same engine session, within the last 24 messages); a new chat, compact / continue lighter, a handover or an error sends it again; "send whole" always sends.

25 upgrades.

## Files
New: `attachlean-core.js` (pure rules: picture sizes, outline, terms, part picking, log summary, the lean text, hash,
diff, "again", chip words; Node-tested), `attachlean.js` + `attachlean.css` (the chip's cost, scaling pictures, the send
step, what was sent per chat in `chat.attachSeen`, `/send-whole`, `/attach-costs`; lazy group `attachlean`, loaded after
the first screen), `dev/attachlean-test.js` (UNIT), `dev/checks/attachlean.js` (smoke, fake engines).

## Edits outside the lane (small, additive)
- `native.js`: renderChips asks `AttachLean.badge`; send() awaits `AttachLean.prepare` before packing and passes
  `readFiles`; packAttachments sends a prepared text as is and keeps its cost in the message's attachments; the text
  limits use `AttachLean.MAX_BYTES` when loaded; a long paste is named "Pasted text"; sent chips get a cost hover.
  Without the group everything behaves as before.
- `engines.js`: `options.readFiles` turns on the same Read tool (on the attachments folder) a picture does, sticky for
  the engine session like pictures (cachewise).
- `dragdrop-core.js` / `dragdrop.js`: `lean` option, a big text is attached (trimmed) instead of refused;
  `dev/checks/dragdrop.js` expects that when the group is loaded.
- `dev/fake-claude.js`: `attachinfo` keyword (message size, tools, folders, pictures the run got);
  `dev/fake-common.js`: the user part skips `<file …attributes>` blocks too.
- `lazy-data.js` (group + regenerated manifest), `index.html` (`attachlean` added to the existing `lazy-at.js#…` tag),
  `dev/run-checks.js` (UNIT + `attachlean` group).

## Tested
- `node dev/attachlean-test.js`: 68 checks (picture sizes and formats, kinds, outline, terms, parts for code / logs /
  pastes, budgets, 5 MB in < 3 s, same / diff / validity, the diff itself, chip words, byte-stable output).
- `sh dev/run-checks.sh attachlean budget`: attachlean, unit:attachlean-test, dragdrop, access-chat, chat-stream,
  unit:tokens-test, unit:cache-test, cachewise, autocompact, concise, tokenaudit (+ units): pass. `budget` fails two
  steps ("a line in Activity", "the same warning never twice") — **the same two fail on the unchanged round 39 base**
  (run from the main checkout), so not from this change.
- `node dev/lazy-manifest.js`: rewritten and compared (names, aliases, actions, keys, apps, tools, dups ✓).
- A screenshot of the chat box with a log and a 4K picture attached: "server.log · ≈ 586 of 327k tok", "sent at 1568 px · ≈ 1.8k tok".

## Not done (on purpose) / risks
- **Pictures**: Claude's API has long scaled big pictures down itself before counting them (≈ 1.15 MP), so on such
  models the 4K "before" was billed nearer ≈ 1.6k tokens — but as a 5–10 MB upload (the API refuses pictures over
  5 MB), and models that read at higher resolution count the full size. 1568 px makes the cost predictable and the
  upload small either way; fine detail in a big screenshot may need "send whole".
- **The trimming is a heuristic**: it may miss the part that matters. Claude can open the rest itself (it's told where);
  Astra without file access can't, so it gets more whole (≤ 12k tokens) and is told to ask; the owner can click "whole".
- **The Read tool**: the first trimmed file in a chat turns on Claude's Read tool on the attachments folder for the
  rest of that session (one tool definition, one full re-read once — the same as the first picture already did).
- **References rely on the engine keeping its history**: if an engine compacted its own context, a "same as 14:02"
  line points at something it no longer has (it's told where the whole file is). Only within 24 messages and the same
  session.
- The whole copies (`lean-<hash>-<name>`) stay in the attachments folder like pictures do (written once per content).
- PDFs still need file access (unchanged); the estimate on a chip is made before you type (the parts follow your words
  when sent).
- Not exercised: real Claude Code / Codex runs (fake engines only), Windows paths for the copies (built with the
  folder's own separator).

## For the patch notes
- **Attachments now show what they cost** before you send: a small "≈ 1.3k of 37k tok" on each chip.
- **Big files, logs and long pastes are sent lean**: an outline plus the parts your message is about (the function you
  name, the lines you mention, errors with their stack traces), and the AI can open the rest when it needs it.
- **Click the cost on a chip to send that one whole** this time (or `/send-whole`).
- **Pictures go at 1568 px** ("sent at 1568 px" on the chip); your original stays as it is.
- **The same file again in a chat** is one line ("unchanged since your message at 14:02"); if you changed it, only the
  changed lines go.
- **Long pastes become a "Pasted text" chip** with their cost, and text files up to 64 MB can be attached (a 5 MB log
  is fine now).
- On a typical big file or log, a message carries about 95 % fewer tokens; a file attached twice costs almost nothing
  the second time.
- Astra without file access gets files up to ≈ 12k tokens whole, since it can't open the rest itself.
