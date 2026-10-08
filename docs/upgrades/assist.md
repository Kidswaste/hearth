# Assist (round 5): Hearth decides the small things, Astra only where taste matters

You asked for fewer options and for Astra to take on some of the deciding. Assist makes small choices for you.
It works things out locally first, at no token cost. It asks Astra one small question only when you click ✦ or
type a command. Every choice it makes shows a toast with **Undo**, and **`/assist undo`** does the same. There are
no new settings.

## Shuffle, then pick (you shuffle 31× and save 46×)
1. **`/shuffle-pick [2–9]`** shuffles the selected layer's sliders 4 times (or the number you give) and shows each result as a thumbnail in a small picker over the Lab, with **Before** first. Nothing changes until you click one.
2. **Hold 🎲 Shuffle** for half a second to open the same picker. A short click still shuffles once, as before.
3. **Shuffle ▾ / right-click Shuffle** → **🎲 Shuffle 4, pick one…** is the first item.
4. **Click a thumbnail** and the Lab shows it at once, so you can compare on the real preview. Double-click keeps it and closes the picker.
5. **Keys in the picker:** 1–9 pick a variation, 0 goes back to Before, ← → step, Enter or Esc keeps it, R makes more, S saves.
6. **✦ Astra picks**: Astra sees the variations side by side, numbered, and picks the one that suits the song best. The picker shows its pick (✦ on the thumbnail), the reason in a few words, and what it cost. You can still click another one.
7. **`/shuffle-pick 4 astra [goal]`** makes the variations and lets Astra pick in one go, for example `/shuffle-pick 6 astra dark and punchy`. The goal is the song's name and tempo plus the sketch, unless you type one.
8. **↻ 4 more** makes new variations from the one you selected. Repeat until it's good. The first thumbnail is then labeled **Now**.
9. **✦ Save as look** keeps the variation and saves it as a look, named from its colors (see 13).
10. **Keep** shows a toast with **Undo**, which puts back what you had before the picker. ✕ goes back to before right away.
11. Each thumbnail's tooltip shows its seed, so `/shuffle seed N` gets that variation again later.
12. **`/astra-pick`** lets Astra pick while the picker is open. Ctrl/⌘+K has "Shuffle & pick" and "Shuffle & let Astra pick the best".

## Names from what's on screen (no tokens)
13. **Quick looks are named from their colors and the song.** Shift+click Save, Save ▾ → as a look, and `/save-look` used to give "Look 3". They now give a name like "Violet Drop" (the main color plus the song part under the playhead), "Jade Teal" (two colors) or a frame size. Names never repeat ("Violet Drop 2").
14. **Save look…** fills in the same name for you to keep or change.
15. **`/name`** renames the open sketch from its colors and song, for example "Violet Gold · Midnight Run". It costs no tokens and shows a toast with Undo.
16. **`/name astra`** asks Astra to name the sketch from a small picture (2–3 words, Undo).
17. **`/name look`** saves the sliders as a named look. **`/name look astra`** gets Astra's name for it.

## Your usual
18. **Hearth learns the frame sizes you use**, overall and for each song. It reads the frame size after your clicks in the Lab. There is no timer and nothing is sent anywhere.
19. **`/usual`** switches the Lab to your usual frame: the size you last used with this song, else the size you use most. It shows a toast with Undo. Ctrl/⌘+K → "Lab: my usual frame size".
20. **`/decide size`** with no Astra and no Claude now falls back to your usual size instead of always 9:16.

## Next steps (computed here, no model call)
21. **After a reply from a docked director**, up to three dashed chips appear first in its chip row. They come from the Lab's state: 🛠 **Fix the errors** (when the console has some), 💾 **Save** (when slider changes are unsaved), ▯ **Try 9:16** (your usual size, when the frame is different), ⇪ **Stills in 4 sizes**, 🎲 **Shuffle & pick**. They go away when you send your next message.
22. **After a jam**, 🎛 **Jam 2 more** joins them (`/jam again`).
23. **✦ What would Astra do?** is the last chip. It asks Astra for one next step, from a small picture, in one sentence. Nothing goes to the director until you click the answer, which then appears as the first chip ("✦ Make the rings pulse on every kick…").
24. In Video Review's docked director, the next steps are ✦ Review with Astra and ⇪ Export 4 socials (the export shows only when no notes are open).
25. **`/next-steps`** (also `/whats-next`) shows the same steps as a note with buttons in any chat. `/next` still asks the agent for next steps, as before.

## Review with Astra (Video Review)
26. **`/review-astra`** sends Astra the frame on screen (480 px) with your open notes. Astra answers with at most 3 short notes, which land on the timeline as notes by **Astra**, each with its frame. One toast with **Undo** removes all of them.
27. **`/review-astra sheet`** does the same for the whole video, from 6 frames, and puts each note at the time Astra gives.
28. **✦ Review with Astra** is the first quick chip of the Video Director, and Ctrl/⌘+K → "Video Review: review this frame with Astra".

## ✦ Decide where it was missing
29. **✦ in the Lab's looks row** appears once you have two saved looks. Astra picks one of your looks for the picture, with Undo. **`/decide saved`** does the same, and Ctrl/⌘+K → "Let Astra decide: one of my saved looks".

## Seeing what it did and what it cost
30. **`/assist`** lists Assist's questions to Astra with their tokens (in and out), the total, and the last automatic choice. **`/assist undo`** takes back the last automatic choice: a kept variation, a name, a frame size, or Astra's notes.
31. Every question's tokens go to the meter (source "assist").

## Token cost per action
Only the ✦ actions ask a model, once per click. Each one is a fresh lean run: no tools, no chat history, a one-line
persona instead of the agent's instructions, low effort for Astra (Codex), and one small JPEG.

| Action | Model call | Prompt | Picture | Output |
|---|---|---:|---|---:|
| Shuffle & pick, click a thumbnail, Keep, ↻ more, Save as look | none | | | 0 |
| Names of quick looks, `/name`, `/name look` | none | | | 0 |
| `/usual`, the learned sizes, next-step chips, `/next-steps` | none | | | 0 |
| ✦ Astra picks a variation | 1 | ≈ 180 chars (≈ 50 tokens) | 4 thumbnails at 180 px, ≈ 740×170 | ≈ 15 tokens |
| `/name astra`, `/name look astra` | 1 | ≈ 105 chars (≈ 30 tokens) | 320 px | ≈ 5 tokens |
| ✦ What would Astra do? | 1 | ≈ 170 chars (≈ 45 tokens) | 320 px | ≈ 15 tokens |
| `/review-astra` | 1 | ≈ 140–260 chars with 3 open notes (≈ 40–70 tokens) | 480 px frame | ≈ 25–60 tokens |
| `/review-astra sheet` | 1 | ≈ 185 chars (≈ 50 tokens) | 6 frames, 720 px | ≈ 25–60 tokens |
| `/decide saved` | 1 | ≈ 230 chars (as `/decide`) | 320 px | ≈ 5 tokens |

The prompt sizes were measured in the test run (`/assist`). The engine also adds its own fixed instructions to
every run, the same as for `/decide` and second opinions. The fake Codex counts these as about 4.2k input tokens,
mostly cached, so each ✦ action showed about 4.3k in and 3–21 out in the test. A real Codex run adds its own fixed
amount, and the picture costs a few hundred image tokens. If Astra isn't set up or doesn't answer, Claude gets the
same small question. If neither answers, Hearth decides locally and spends nothing. For example, "✦ Astra picks"
then takes the variation that changed the most.

## For developers
- `assist.js` + `assist.css`; `window.Assist`: `shufflePick(n, { goal, astraPicks, from })`, `astraPick()`, `picker()`,
  `lookName({ taken, colors })`, `sketchName()`, `nameSketch({ useAstra })`, `colorWord(hex)`, `usualFrame(song?)`,
  `useUsual()`, `labSteps({ jam })`, `reviewSteps()`, `showSteps(toolId, agentId, steps)`, `whatWouldAstraDo(toolId)`,
  `reviewAstra({ sheet })`, `ask(kind, text, { images })`, `undo()`.
- Small hooks elsewhere: `tools/three-tweaks.js` (quick-look names, the Shuffle menu item, ✦ in the looks row),
  `jam.js` (a `hearth:jam-end` event), `index.html` (one script and one stylesheet), `Decide.KINDS.saved`, and the
  `Decide.KINDS.size` local fallback.
- The fake engines answer Assist's four question shapes (`dev/fake-common.js`).
- Test: `sh dev/make-test-videos.sh /tmp/hearth-test-videos && node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/assist.js`.
