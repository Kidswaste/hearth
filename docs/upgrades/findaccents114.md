# findaccents114: Find in a chat (Alt+F) ignores accents (round 114)

Round 113 (`search113.md`) made Ctrl/⌘+K, the chats list filter, Find in this project and recall ignore accents, capitals
and French elisions. Alt+F inside a chat still ignored capitals only. The owner writes French, so "sohne" didn't find
"Söhne", "cafe" didn't find "café", and "l'eglise" didn't find "L’Église". Now it does, in a normal chat, in a long
chat's resting messages and in a giant (windowed) chat on the store thread. All three use the same folding as the rest
of search.

## Before → after
| Typed in Alt+F | Text in the chat | Round 113 | Now |
|---|---|---|---|
| `sohne` | Söhne | none | found, "Söhne" marked |
| `cafe` / `CAFE` | café, Café, CAFÉ | none | found, each one marked |
| `l'eglise` (straight apostrophe) | L’Église (curly) | none | found, "L’Église" marked |
| `oeuvre` | œuvre | none | found, "œuvre" marked whole |
| `creme brulee` | Crème brûlée | none | found |
| `strasse` | Straße | none | found, "Straße" marked |
| `café` (typed with its accent) | cafe | none | found |
| `cafe` | "cafe" + a separate accent mark (U+0301, as some Macs and pasted text write it) | marked without its accent | marked with its accent |
| `sohne` in a 63 MB chat, a message far up | none (the store thread searched exact bytes) | found by the store thread, its block woken, marked |
| `sohne` in a giant chat whose file another program wrote with `ö` escapes | none | found |

What didn't change:
- Next and previous (Enter / Shift+Enter, ↑ ↓) work as before.
- The count ("3 / 12") works as before.
- Landing on a match, and the about-200-marks-near-you cap from round 113, work as before.
- A long chat's resting messages are still stand-ins until you step to them.
- The store thread's answer is still exact: a message it points at is parsed and tested before it counts.

## How
- **One folding** (`findfold.js`, new): `fold` is recall-core.js's own `fold` (the one Ctrl/⌘+K, the chats filter, Find
  in this project and recall use), plus two small rules:
  - ’ and ‘ count as ' (a typed apostrophe finds a curly one);
  - ς counts as σ (a Greek word's last sigma folds the same wherever it stands).
- **The highlights land on the original letters.** `foldMap` folds a text one character at a time. For each folded
  unit it keeps where its character starts and ends in the original. `ranges` turns a match in the folded text back
  into original places:
  - a match ends after any separate accent marks that follow its last letter ("cafe" + U+0301 is marked whole);
  - a match inside a ligature marks the whole ligature ("oe" in "cœur" marks "œ"; "s" twice in "ß" is one mark);
  - emoji, flags and family emoji are never cut: every place is on a character boundary;
  - plain ASCII text takes a fast path, with the same places as before.
- **The window** (`chat-ux.js`):
  - Alt+F's mark-making (`markAll`) moved into `findfold.js`, in the lazy group `chatfind` with recall-core.js. It is
    loaded the first time you find (the count shows "…" for that moment).
  - `chat-ux.js` is about 2 KB smaller on the first screen.
  - `chat-rest.js` folds a long chat's resting messages the same way. A message that isn't plain ASCII keeps its
    folded text while its text stays the same.
- **The store thread** (`storework.js` `chatFind`, a windowed giant chat):
  - The file's bytes are folded once per version of the file. This happens message by message, with the JSON escapes
    read (`é`, `\n`, `\"`).
  - The folded bytes are kept instead of round 113's lowered bytes. The memory is the same: 59 MB for the 63 MB chat.
  - Each search finds the folded needle there and then tests only those messages on their parsed text (`findHit`,
    now folded in `chatwin-core.js`).
  - Kelvin K and İ fold to k and i, so those messages no longer need reading apart.
  - A file that's gone, damaged or changed is still an error, never "no hits". The window says so, as before.
- **Time** (`node dev/findaccents114-test.js --bench`, bigchat84's 63 MB chat, this box):
  - the first find in a giant chat takes 0.49–0.9 s of the store thread (round 113: 0.39–0.56 s). Most of it is reading
    the 63 MB, as before; folding takes 0.28–0.34 s in place of the old lowering's 0.24 s;
  - a next word takes 30–105 ms (round 113: 81–83 ms);
  - none of this runs on the window thread.

## Tested
- `node dev/findaccents114-test.js`: 149/149. It covers:
  - the French cases;
  - separate accent marks;
  - œ / ß;
  - emoji and flags next to matches;
  - Greek;
  - İ / Kelvin K;
  - the exact highlight places;
  - 400 random texts, where every mark holds what was found and everything found is marked;
  - the window's `markAll` on a stand-in DOM: the text around and inside the marks is unchanged, the near-you cap is
    kept and code buttons are never marked;
  - the store thread's `chatFind` on a 900-message file written plainly, with `\u` escapes and with separate accent
    marks, which gives the same messages as the window's own test;
  - a missing or damaged file, which gives an error and never "no hits".
- `chatwindow86` (`CHATWINDOW86=1`) has a new step, **findAccents**. You type `l'eglise saint-zephyrin84`. The store
  thread finds #40's "L’Église Saint-Zéphyrin84" in the 63 MB chat, its block wakes, and exactly those letters are
  marked. The count reads "1 / 1", and no window task goes over the wake budget.
  - `dev/bigchat84-fixture.js` adds that sentence to #40 and writes `fixture-114.txt`.
  - `dev/run-checks.js` makes the fixture again when that file is missing, so an older fixture is replaced once.
- The new group is `findaccents114` in `dev/run-checks.js`, and the unit test is listed in UNIT.
- Results of the required runs are listed at the end of this file.

## Caveats
- Folding follows recall: NFD with the accents U+0300–U+036F removed, and the ligatures recall knows. Compatibility forms
  like "ﬁ" are not unfolded, and neither are full-width letters. This is the same as Ctrl/⌘+K.
- A match that crosses formatting (`caf**é**`) isn't marked, as before. The marks work one text node at a time.
- The window folds a whole message at once, and the store thread folds one character at a time. These differ only for
  rare runs of several non-Latin combining marks out of their usual order. In that case the store thread could miss one
  message. Latin, French, Greek, Cyrillic and CJK text are not affected.

## For Codex
Nothing of yours changed. No Codex-owned file was edited.

## For the patch notes
- **Find in a chat (Alt+F) now ignores accents and capitals**, like the rest of search. Type "cafe" to find "café",
  "sohne" to find "Söhne", "l'eglise" to find "L’Église", and "oeuvre" to find "œuvre".
- The highlight covers the word as it is written, accents included.
- This works in very long chats too, including the parts far up that aren't loaded yet.
