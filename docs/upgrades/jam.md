# Jam: Claude and Astra make a visual together (round 4)

You asked for "a thing where you and Astra bounce back and forth to create a cool visual for me". That's **Jam**:
one action, no setup. Claude builds in the Three.js Lab, Astra looks at it and directs like an art director,
Claude applies it, and so on. When it ends, the best version is back in the Lab with its sliders saved.

## How to use it
1. **🎛 Jam** chip above the Three Director's chat box, or type **`/jam`** in any chat (Ctrl/⌘+K → "Jam" works too).
   With no idea, the agents pick one from your song and the open sketch. `/jam neon tunnel that breathes with the bass`
   gives them one; `/jam 6 …` plays 6 rounds instead of 4.
2. Watch it, or don't: a small **Jam · round 2/4 · Astra directing** badge sits on the Lab preview and one compact
   card grows in the director's chat. **Esc** (or the badge's ■, or `/jam stop`) stops it at any point.
3. At the end both name the best round; it goes back into the Lab, its sliders are saved into the code and as a
   look ("Jam …"), and the card shows what each agent spent.
4. Changed your mind? Hover a round in the card and press **↺** (or `/jam keep 2`). **＋2 rounds** (or `/jam again`)
   keeps jamming on the result.

## What shipped
### The jam
1. **`/jam [rounds] [idea]`**: Claude and Astra take turns on one music visual in the Lab (4 rounds by default, up to 8).
2. **No setup**: if the Three Director doesn't exist yet, the jam makes it and docks it next to the Lab.
3. **The agents pick the idea** when you give none, from the loaded song (tempo, how loud it gets, the first drop) and the open sketch; the card shows the idea they chose.
4. **Builds with the Lab's real tools**: each build is a director turn with its Lab tools (edit code, sliders, screenshots…), told to keep the main knobs as sliders.
5. **Astra directs like an art director**: after each build it sees one small picture and answers in at most 3 lines: one bold thing to push, one thing to cut. No code, no praise.
6. **Frame strip when the song plays**: Astra sees 3 frames over the song (left to right) instead of one still, so it can judge motion and beat sync.
7. **Direction passed verbatim**: Claude gets Astra's words as they are, not a paraphrase.
8. **The lead alternates**: when Astra is a director with hub tools (`/director-engine three astra`, or an Astra director with Lab tools), Astra builds every other round and Claude directs. Otherwise Claude builds and Astra directs.
9. **The last round gets no direction** (no one would apply it): it goes straight to the final pick.
10. **Final pick by both**: they see every working version side by side, numbered, and each names the best. If they disagree, Astra's pick wins (it's the art director; the card says what Claude picked).
11. **The best version is kept**: it goes back into the Lab if it wasn't the last one, its sliders are saved into the code (like Save) and as a look named "Jam <idea>".
12. **The jam works on a copy**: it starts with "Jam · <idea>", a copy of the open sketch, so your sketch stays as it was.
13. **Every round is an undo point**: the whole sketch (all layers) is kept per round; ↺ on a row puts that version back with its sliders saved and a look; the "Start" row goes back to before the jam.
14. **`/jam keep <round>`**: the same from the chat (`/jam keep 0` = where the jam started).
15. **`/jam again`** (and **＋2 rounds** on the card): two more rounds on the current result; `/jam again 3` for three. If you moved to another sketch, it continues from the kept round.
16. **`/jam stop`**, **Esc** (in the Lab or its chat) and the badge's **■** stop the jam at once (the engines are stopped too).

### Calm, visible
17. **Jam card** in the docked director chat: one line per round with a thumbnail and who did what; the direction under it in one line. Click a row to unfold the full direction / errors; the running round is unfolded.
18. **The best round is starred** (★), broken ones are red, the card's top edge flows Claude → gold → Astra while it runs.
19. **Lab badge**: "Jam · round 2/4 · Claude building / Astra directing / picking the best", with a pulsing dot and ■ to stop; click it to show the chat.
20. **Tokens per agent**: the card's header shows `C 3.9k · A 13k` live (hover: in / out), the footer and the end toast repeat it.
21. **A short trace in the chat's context**: the jam leaves one line ("Jam with Astra on …: 4 rounds, round 3 kept …") so your next message to the director knows what happened, without the whole jam.
22. Ctrl/⌘+K → "Jam: Claude and Astra make a visual together".

### Frugal (product rule #1)
23. **No growing transcripts**: every turn is a fresh engine session with a self-contained prompt plus a one-line running summary of earlier rounds (capped at 240 characters).
24. **Astra's turns are lean**: no tools, one small JPEG (512 px, ≈ 250–400 image tokens), 3 lines of context, low effort.
25. **Build turns keep only the Lab tools** (`hubOnly` in engines.js): no chat tools, connectors or self-review line, so a build costs a plain director turn.
26. Thumbnails, the side-by-side sheet, saving sliders and looks happen in Hearth, not in a model turn.

### Robust
27. **Astra missing or failing**: Claude critiques its own builds with the same screenshot (the card says so once); a failed Astra build hands the building back to Claude.
28. **A broken build is fixed first**: the next build gets the errors at the top of its prompt; broken builds get no direction.
29. **Two broken builds in a row go back to the last good round** before the jam goes on.
30. **Never ends broken**: if the Lab has errors when the jam ends or stops, it goes back to the last good round (or the start); if no build ran cleanly, the start comes back.
31. A turn stuck for 7 minutes is stopped; a jam interrupted by closing the app shows as stopped.

## For developers
- `jam.js` (+ `jam.css`), the card is a `{ role: 'jam' }` chat message drawn through one line in `native.js` messageEl.
- `window.Jam`: `start(idea?, { rounds })`, `stop()`, `again(n)`, `keep(n)`, `running()`, `latest()`, `label`, `desc` (the collab chip can show Jam when `window.Jam` exists).
- Lab hooks in `tools/three.js` director: `capture()` (all layers of the open sketch) and `restore(snap, { asNew })`.
- `engines.js` `send`: option `hubOnly` (keep the agent's tool sets, drop chat tools / connectors / self-review).
- `director-dock.js`: the 🎛 Jam chip (chips can carry their own `title`).
- Fake engines play both roles (`dev/fake-common.js` jamPlan): builds make real MCP `three_set_code` calls, directions are two lines, picks name a round; `jam-break`, `jam-break-hard`, `jam-astra-down` in the idea test the failure paths.
- Test: `node dev/smoke.js --fake-engines --script dev/checks/jam.js --wait 6000 --check-timeout 600000`.
