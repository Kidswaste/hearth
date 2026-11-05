# The project brief (round 128, aiprep128)

The owner asked: "allow the AI to do some pre-checks of what to do or checking the moodboard ahead of time so that it
already has an idea etc." Now a project can have a **brief**. Before the director builds, the AI has looked at the
project's material once and written a short plan. The director gets that plan with every message, and it can read the
whole brief when it needs it.

## What it does

1. **One AI pass over what the project has.** It reads:
   - the moodboard: what the items are, the palette (from the pictures' colors and the swatches), mood words, notes and
     picture titles;
   - the Lab references, by name;
   - the song's analysis: BPM, key, duration, sections with their energy, and drops. It uses the analysis the Lab
     already makes (`ThreeBackstage.songPrep`), or the loaded song's;
   - the scene's outline: its name, layers, palette and frame;
   - the owner's written intent: the project's description or notes, or the words the wizard passes.

   It writes JSON: mood, look, palette (hex, taken from the moodboard where it has colors), a tempo plan per song
   section, 3–6 first steps, risks, and 1–3 questions only when something is truly ambiguous.
   - It runs on the project's default AI (its Lab chat's AI), with the cheapest model and effort (`Autocompact.CHEAP`),
     as a lean helper run: no tools and no memory.
   - Words and numbers only: no file paths. Secrets in notes are removed with `AccessRules.redact`.
2. **Pictures only with consent.** "Let the AI look at the moodboard" is a tick on the plan card (and `/brief look
   on|off`). It's stored with the project and synced, and it's off by default. With it on, one small overview picture of
   the moodboard (`BoardEyes.overview`, 768 px) goes with the brief. With it off, no picture is even drawn.
3. **Stored with the project.** kv `project-briefs` holds `{ v: 1, list: [{ id: projectId, brief, compact, fp, at, by,
   eyes, done }] }`. It's a list of objects with ids, so sync merges two computers' changes one item at a time, and
   `sync-kinds.js` puts it in the "Projects & scenes" kind. It's declared with StoreAck, and a read that fails is never
   saved over. `fp` holds the inputs' fingerprints, so the card can say "The moodboard changed since the brief". The
   moodboard, references, song and notes count; the scene doesn't, because the director builds it.
4. **The plan card** sits at the top of the project's Lab chat, and of any Three Director chat in the project. It
   shows:
   - mood, palette swatches (click to copy), the look, the first steps as a checklist (synced), the tempo plan (folded),
     risks and questions;
   - **▶ Start with step N**: sends that step to the director as your message. Nothing is sent without this click;
   - **✎ Edit the brief**: a plain-text dialog with the headings Mood, Look, Palette, Tempo, Steps, Risks, Questions;
   - **↻ Refresh**: only when something changed since the brief;
   - **Let the AI look at the moodboard** and **Hide**.

   The card folds to one line. When a project has no brief yet, a new empty director chat in it shows a small offer,
   **✦ Prepare a brief**, instead.
5. **The director knows it.** A `brief` prompt part (engines.js) goes to directors in a project with a brief. It is at
   most 600 characters, with mood, palette, tempo, steps and questions. It sits in the tail, after the standing
   instructions. Its bytes change only when the brief changes, so the parts before it stay cached; dev/aiprep128-test.js
   checks this. Lean runs, crew helpers and plain chats never get it. The whole brief is **`three_do brief`** (in full
   mode it is the `three_brief` tool). It says what changed since the brief was written.
6. **Pre-checks before big edits.** One line in the guide's core (mcp/three-guide.js): "Broad asks (a whole visual, a
   new scene): read three_do brief and the moodboard / refs, say a 2–4 line plan, then build." Small edits aren't
   affected.

## Where the owner clicks

- **In a project's Lab chat or Three Director chat:** the plan card at the top. If there's no brief yet, a new empty
  chat shows the offer card: **✦ Prepare a brief**.
- **`/brief`** in a project's chat: prepares one (or shows the existing one). Also `/brief refresh | edit | show | hide
  | look on | look off`.
- **Ctrl/⌘+K:** "Prepare a project brief (the AI looks at the moodboard, song and notes first)".
- **The new-project wizard (projcreate128):** "Let the AI prepare a brief" calls the API below.

## API contract (for projcreate128)

`window.ProjectBrief`, lazy group `projectbrief` (`await Lazy.load('projectbrief')`; it also loads by itself after the
first screen, after `projects`):

| Call | Returns |
| --- | --- |
| `ProjectBrief.prepare(projectId, opts)` | `Promise<brief>`. opts: `{ moodboard, refs, song, scene, notes, eyes, quiet }`. Each input you give is used as it is, `false` leaves it out, and one you leave out is read from the project. `notes` is the owner's intent as words. `eyes: true` only when the owner ticked "Let the AI look at the moodboard"; it is stored as this project's consent. `quiet` means no toasts. Two calls for one project share one run. It rejects with a plain-words error. |
| `ProjectBrief.get(projectId)` | `brief` or `null` |
| `ProjectBrief.stale(projectId)` | `bool`. It checks again in the background at most every 15 s; `staleWhat(id)` gives the words. |
| `ProjectBrief.card(projectId)` | `HTMLElement`: the plan card, or the offer to prepare one. A card outside a chat repaints itself when the brief changes. |
| `ProjectBrief.open(projectId)` | The project's Lab chat (`ProjectWorkspace.open(id, 'chat')`, else its newest director chat) on screen, with the card. |

`brief` = `{ id, at, by, eyes, done: [step indexes], compact, pictures, mood, look, palette: ['#rrggbb'], tempo:
[{ section, plan }], steps: [..], risks: [..], questions: [..] }`.

Also: `edit(id)`, `hide(id)`, `start(id)`, `setEyes(id, bool)`, `onChange(fn)`.

## Files

- `projectbrief-core.js` (new, pure): inputs, fingerprints, changed, prompt / request (the consent gate), parse,
  compact, toText / fromText, the store helpers, prepare (with injected reads, AI and store).
- `projectbrief.js` + `projectbrief.css` (new): the window side, described above.
- `lazy-data.js`: the `projectbrief` group, and the manifest regenerated (`node dev/lazy-manifest.js`).
  `docs/lazy-groups.md` has its line, and `index.html`'s `lazy-at.js#…projbundle,projectbrief,…` tag has its place.
- `engines.js`: `options.brief` → `agent.projectBrief` in `runAgent`, and the `brief` part in `promptParts0`, both
  capped by `BRIEF_MAX`.
- `mcp/three-mcp.js`: `brief` in `DO_CMDS`, and a `three_brief` tool for full mode. `mcp/three-guide.js`: the broad-ask
  line. `tools/three-txn.js`: `three_brief` counts as a read.
- `sync-kinds.js`: `kv/project-briefs.json` is in the Projects & scenes kind.
- dev: `dev/aiprep128-test.js` (new, in UNIT), `dev/fake-common.js` (the fake engines' brief answer: JSON, the
  moodboard's palette, how many pictures they got), `dev/fake-liveness.js` (a brief that names "quiet" sections isn't a
  long-task scenario), `dev/promptdiet-test.js` and `dev/director-mcp-test.js` (budgets; see below).

### Budgets

- **promptdiet** `directorFull` goes from 9150 to 9225. Full mode lists every tool, so `three_brief` adds about 50
  tokens, and the guide line adds about 25.
- **Lean directors** stay within their budgets: 2159 ≤ 2170, Keep going 2196 ≤ 2200, tokens-test 2261 ≤ 2265.
- **director-mcp-test**: the full list has 39 tools.
- The `three_do` description is unchanged. `brief` is named by the guide line and the brief part.
- **First screen**: only the manifest lines for the group.

## Tests

The owner asked for less testing, so there is one new unit test: **`dev/aiprep128-test.js`** (`unit:aiprep128-test`).
It checks:
1. A fake project's inputs: the moodboard palette, moods and notes, references, the song's BPM, key, sections and drops,
   and the scene. There are no paths, and a secret in a note is redacted.
2. The AI pass through the fake engine (`engines.once` → `dev/fake-claude.js`): the brief is parsed and stored with its
   time and fingerprints, other projects' briefs are untouched, and Edit round-trips.
3. Staleness: a moodboard note, the notes and another song are named. The same inputs, a moved picture and the scene
   being built on are not.
4. The `brief` part: ≤ 600 characters and byte-stable, and the parts before it are unchanged. Only directors get it
   (Claude and Astra), never lean or crew runs, and engines.js caps it.
5. No picture without consent: none is drawn, sent or received. A tick sends exactly one, and the consent stays until
   it's taken back.

The run for this round: unit:aiprep128-test, unit:promptdiet-test, unit:tokens-test, unit:cache-test,
unit:sendpath122-test, `node dev/boot-test.js`, and the Lab check labchat92.

## For the patch notes

- **Your projects can have a plan.** In a project's Lab chat, click **✦ Prepare a brief**, or type `/brief`. The AI
  looks at the project's moodboard, references, song and notes once and writes a short plan:
  - the mood;
  - a palette taken from your moodboard;
  - what happens in each part of the song;
  - 3–6 first steps;
  - things to watch out for;
  - a question or two if something is unclear.

  It uses the lightest model.
- **The plan sits at the top of the chat.** Tick the steps off. **▶ Start with step 1** sends that step to the director
  for you. **✎ Edit the brief** changes it. **↻ Refresh** appears when your moodboard, references, song or notes changed
  since.
- **The director knows the plan.** It gets a short version with every message and can read the whole thing. For a big
  ask like "make a visual for this song", it checks the plan, the moodboard and the references first, and tells you its
  plan in a few lines before it builds.
- **Pictures stay private unless you say so.** The AI only reads words and numbers about your moodboard. Tick **Let the
  AI look at the moodboard** on the plan to also show it one small picture of the board. The setting is kept per
  project.

## For Codex

No Codex-owned file was edited. `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `astra*`,
`codex-*`, `workbench-*` and `engine-watch.js` are unchanged. The brief uses them only through their public calls:
- `Projects.get / projectOfChat / openChat / onChange / here`;
- `ProjectWorkspace.open(id, 'chat') / currentChat`;
- the existing `Native.hooks.options`, where project-workspace.js's own hook (`asDirector: 'three'`) runs first.

What touches Codex's area:
- **`sync-kinds.js`** (not Codex-owned) adds `project-briefs` to the Projects & scenes regex, so `kv/project-briefs.json`
  syncs with the projects. The sync engine itself is unchanged.
- **Astra:** an Astra director gets the same `brief` part as Claude: `options.brief` goes through `runAgent` like
  `crewOn`. dev/aiprep128-test.js checks it, and astraparity116 is unaffected because the part only exists when a brief
  is passed.
- **projcreate128's wizard** should call `await Lazy.load('projectbrief')`, then
  `ProjectBrief.prepare(projectId, { notes: <the idea>, eyes: <the owner's tick, if the wizard offers one> })` and
  `ProjectBrief.card(projectId)`. See the contract above.
