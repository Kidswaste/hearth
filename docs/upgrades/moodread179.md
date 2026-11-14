# moodread179: a moodboard read deeply, for inspiration and not re-creation (round 179)

The owner's ask: "I'd love for moodboard reads to be incredibly accurate regardless of token cost, just for the sake of
inspiration and not re-creation. Right now we're able to copy/paste work but it feels like stealing and I want the mood
to be more precise."

## What was wrong
- No AI ever looked at a moodboard picture closely. Each picture was measured on the computer (palette, brightness,
  contrast, warmth, grain, composition weight; motion and cuts for clips) and a fixed table turned the numbers into a
  few mood words. The project brief was one pass of the cheapest model over the board's *averaged* numbers, plus (with
  consent) one small overview picture of the whole board.
- Averaging hid what a board is. The owner's Flower board (one warm busy clip, three nearly black ones, one bright pink
  one) went to the brief as "vintage, nostalgic, warm, nocturnal, cold, spacious"; the brief kept the first clip's
  words, never saw the picture ("could not be opened in this session"), and its step 1 was "Import
  9153882-uhd_4096_2160_30fps.mp4 as a footage layer": the reference itself.
- Nothing recorded whose a picture is. "Allow chats to use it as footage" only added a line of text; the AI could add
  any attached moodboard picture to a scene's references and use it as a texture.

## Shipped
1. **The mood read** (`moodread-core.js`, `moodread.js`; lazy group `projectbrief`). On the owner's click, after the
   cost is shown:
   - every picture is sent at full size (1568 px long side; a clip or gif as six full frames) and looked at three
     times: **surface** (colour and how the colours sit together, light, texture and grain), **structure** (shape
     language, composition, depth and space, motion or the motion it implies), **meaning** (era and medium, what it
     echoes, the feeling in two sentences, 4–6 mood words, what to carry into new work). The third look is given the
     first two. "What I like about this" and the picture's note lead each look;
   - a **second, independent look** per picture by the other AI (Astra when it is set up, else a fresh pass of the
     first reader), which sees the picture and nothing of the first read;
   - then **one pass over the whole board**: the mood in one line, the essence, what the pictures share, the *threads*
     inside the board (it is told not to average), where pictures disagree, what the mood is not, colour / light /
     texture / shape / space / motion / era across the board, and principles for making new work in it.
   Surface, structure and the second look run together; a 34-picture board is about 34 × 4 passes + 1.
2. **Stored with the board, paid once.** kv `mood-reads` (`{ v: 1, list: [{ id: boardId, items, board, scope, by,
   second, usage, corrections }] }`, synced with the projects). Each picture's read carries a signature of its file and
   the owner's words on it: a refresh reads only new or changed pictures, then the board pass. Moving a picture or
   marking it "mine" costs nothing. A stopped run keeps what it read; an unreadable file is named and left out.
3. **Accuracy you can see** (the panel: ◐ Mood read on a project's plan card, the board's menu, `/moodread`, Ctrl/⌘+K).
   Per picture: "What the AI saw" (one literal line, for the owner only), the feeling, words, what to carry over, the
   three looks; then **"Measured here"**: the read's own fixed claims (brightness, contrast, warmth, saturation, grain,
   detail) next to the numbers measured on the computer, with contradictions named ("brightness: the read says low,
   the measurement says high (0.83)"); then the **second look** side by side with what differs. The header counts the
   pictures to check.
4. **The owner corrects it.** ✎ Edit the read (the whole board read as text; the next refresh is told to keep the
   owner's wording), My corrections (free words that lead what the directors get and every later board pass), ✎ Correct
   on one picture (feeling and what to carry over), ↻ Read again, Read everything again.
5. **Inspiration, not re-creation.**
   - What a director gets (`three_do brief` now ends with it) is the board read: qualities, threads, what it is not,
     how to make new work in it. The literal "seen" lines and the references' titles are never passed on, and every
     look is told to describe qualities only (no subject, people, words, logos or layout).
   - It ends with the rule: "INSPIRATION, NOT RE-CREATION … Make something NEW in it … Never rebuild a reference's
     subject, layout or recognisable elements, and never put a reference's file in the scene", then the one
     exception: the pictures marked as the owner's own.
   - The project brief's AI pass is given the read (and the rule, even without a read), so a brief no longer proposes
     importing a reference. A new or edited read makes the brief stale ("the mood read changed").
6. **"This is mine: may be used as is."** The board item's existing `footage` mark, reworded (right-click a picture on
   the board, the tick on each picture in the panel, `/board-footage`). Marked pictures are named to the directors as
   usable as is.
7. **The AI's copy path is gated.** `three_references add` (on screen and backstage) refuses a file that came from the
   moodboard (a tile dragged into the chat) unless the picture is marked mine, or the call says `asked: true` (the
   owner asked for that file in their message). Files the owner attaches themselves are untouched.
8. **Labels.** "Closer" in ✦ Make a layer like this and "Close to it" on the board drawer's distance slider now say
   they move toward a copy (best kept for your own pictures). Everything the owner does by hand (moodboard fills,
   dropping a tile on the timeline or the preview, Add to the Lab sequence, ◎ How close am I?) is unchanged.

## What it costs
Shown before every run, in tokens and at the owner's own average price when there is one. Rough sizes (three looks +
the second look + the board pass, on the reader's own model, not the cheap helper):

| board | pictures | tokens in | tokens out |
|---|---|---|---|
| Bloom | 34 stills | ≈ 257k | ≈ 47k |
| Flower | 5 clips | ≈ 179k | ≈ 8k |
| INSPO | 97 stills + 32 clips | ≈ 1.9M | ≈ 174k |
| Y2K | 21 stills + 3 clips | ≈ 309k | ≈ 33k |

These are the app's own estimates for the owner's boards (`MoodReadCore.estimate`; real runs will differ: the output side is a guess until a real read is measured). Clips are the expensive part (six full frames in each of four looks). The panel can read only the starred / liked
pictures or the board's selection; without the second look it is about a quarter less.

## Where it lives
- `moodread-core.js`: prompts, parsing, signatures / staleness, the estimate, `check` (read vs measurement),
  `agreement` (first vs second look), `directorText`, `briefLines`, `toText` / `fromText`, `run` (deps injected).
- `moodread.js`: the store, full-size pictures (BoardEyes.stillOf / framesOf into attachments), the two readers, the
  panel, `refGate`, `/moodread`.
- `projectbrief-core.js` / `projectbrief.js`: `moodRead` in the brief's inputs and prompt, the `read` fingerprint,
  ◐ Mood read on the plan card, `three_brief` appends `MoodRead.directorText`.
- `tools/three-lab-ai.js`, `tools/three-backstage.js`, `tools/three.js` (the chat context passed on): the gate.
- `board-ask.js`: the "mine" wording, ◐ Mood read… in the board's menu. `sync-kinds.js`: `mood-reads` syncs.
- No change to `mcp/` or `engines.js`: nothing is added to what rides along with every message.

## Checks
- `node dev/moodread-test.js` (unit, through the fake engine): produced, stored, paid once and refreshed on change,
  read vs measurement and vs second look, delivered to the director and the brief, the edit round trip, a stopped run.
- `node dev/smoke.js --fake-engines --script dev/checks/moodread179.js` (silent): the cost first and nothing without
  the click, read and stored, the panel, `three_brief` ends with the read and the rule, a new picture refreshes alone,
  corrections and "mine", the gate. Group `moodread179` in `dev/run-checks.js`.
- `dev/aiprep128-test.js`, `dev/moodqualities-test.js`, `dev/tokens-test.js`, `dev/lazy-groups-test.js` pass;
  `dev/lazy-manifest.js` regenerated (`/moodread`). `dev/promptdiet-test.js`: everything passes except "Three Director
  (full): 8870 ≤ 7940", which already fails on this Windows PC without this change (nothing in `mcp/` or `engines.js`
  was touched).

## Not done / not verified
- **The quality of real reads is unproven.** Every check uses the fake engine's canned answers. Whether a real read of
  a real board is precise, and whether the "describe qualities only" instruction holds, needs the owner's eyes on a
  first real board (a small one first: the cost is real).
- No real read was run on the owner's boards (it spends their tokens; it waits for their click).
- The full-size pictures sent for a read are saved in Hearth's attachments folder and stay there (there is no call to
  delete an attachment). A board like INSPO leaves a few hundred JPEGs.
- A long read runs one picture at a time (three passes of it together): a big board takes a long time. It can be
  stopped and resumed, but only while the app is open.
- The gate covers the path that could be closed in code. A director with board tools can still look at a picture
  (`board_look`) and imitate it, clip frames dragged into a chat are not tracked, and `three_load_media` takes any
  path; those rest on the instruction. `asked: true` is the AI's word.
- The full `three_references` schema doesn't list `asked` or `like` (left as is to keep the prompt budget).
- The "close to it" band and "Closer" still exist (the owner chose to keep them, labelled).
- Per-picture reads are not offered to the directors (only the board read); a thread names picture numbers only in
  the owner's panel.
- macOS not checked.
