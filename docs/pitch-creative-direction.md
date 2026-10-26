# Pitch: Hearth's next creative round — direction, taste, honesty

Hi Claude. You're picking up a design and build brief for **Hearth**, a plain-JS Electron app
(repo `kidswaste/hearth`). Quentin, who owns it, uses it to make three.js scenes, music
(Serum 2 / Vital through Hearth's Sound desk) and visuals with AI help. Two AI collaborators live inside it:
- **Astra** (Codex): an AI chat agent.
- **Swarm**: meant to run several agents at once.

Another Claude session is running feature round 66, so stay off those topics:
- the map's "I'm here" pin;
- the weekend plan;
- the music session log;
- the map buttons and layers;
- the startup fix.

## What Quentin told us (his words, lightly trimmed)

> Sometimes it's really hard to describe what I have in mind and get the result I want. Once I've gone in a
> direction, it's either a hard reset to get closer to the vision, or deepening until the idea debt is too bad
> and I kinda feel burned out.
>
> The moodboard inspiration is usually *too* accurate — almost a copy of the homework, not something inspired
> off it. The "vibe" and text usually come short of what the image actually represents; too vague to be
> useful to me or the AI.
>
> Collaborations with Astra don't work anymore for the most part: they can't see the scene in three.js, or
> they can't interact with stuff they're being given. That also means I can't set something up in After
> Effects while the three.js layer works. Multi-agent deployment (Swarm) should be in there but doesn't work.
>
> I lack the capacity to finish and polish ideas properly, so the AI does most of the work, so it's
> AI-generated art in essence. My industry doesn't fuck with that, and I don't want trouble or to lie about
> what I make. "My program can make this" is a cooler angle than "I made art", but I'd like to post the
> creations, so I have to take over the code at some point. Since things are never quite right, small tuning
> feels useless.

## The diagnosis

1. **He's asked to describe what he can only recognise.** Choosing between options beats describing
   one, and pointing beats rewriting a prompt.
2. **Work runs in one straight line**, so the only moves are to throw everything away or to keep
   piling fixes on top. He needs branches and something fixed to compare against.
3. **The moodboard passes the image itself**, so the result copies it. It should pass extracted
   *qualities* instead.
4. **Astra, After Effects and Swarm have real bugs.** These aren't limits of the idea.
5. **Tuning only pays off once the base is right.** Fix 1–3 and polishing becomes worth it again.
6. **Being honest about authorship is a labelling problem.** It's solved by an honest credit log and by
   deliberately keeping some layers hand-made (his music already is), not by doing everything by hand.

## Proposed round 67 (five streams, all reachable by clicking)

1. **Astra and Swarm repair** (bugs first).
   - Give every agent the same "eyes": a fresh frame of the live three.js scene, a short summary of
     what's in the scene, and the current selection.
   - Audit each Astra tool end to end and fix what's broken.
   - Make After Effects jobs run on their own so the three.js scene stays usable.
   - Make Swarm actually work. Its first real job is stream 2.
2. **Try 4, then commit.**
   - From one idea, Swarm produces 4 quick, rough, really different takes.
   - He picks one, or combines them ("this one, with that one's light").
   - Versions branch, so he can go back to an earlier point with what he's learned instead of resetting.
   - Add pointing at the result: circle a region and say more of this / wrong.
   - Add a few plain sliders (calmer ↔ busier, warmer ↔ colder).
   - Add a **vision anchor** card: 3 frames, a few words, and one "should feel like" sentence. Each new
     version is compared against it, so drift is visible before it piles up.
3. **Moodboard qualities instead of copying.**
   - From each inspiration tile, pull out colour values, brightness and contrast, composition, texture
     and grain, motion speed, and shape language.
   - Send those qualities to the AI, not the image.
   - Add a "what I like about this" line per tile (the strongest signal).
   - Add a distance slider from close to the reference to only its spirit.
   - Encourage mixing 2–3 tiles.
4. **Credit log and process reel.**
   - Quietly record what Quentin did by hand (code edits, tuning, sound) and what the AI generated.
   - Export honest credits plus a short "how it was made" reel per piece.
   - This protects him in his industry and works as content.
5. **Finish lines.**
   - Give each piece a size (10 s / 30 s / full) and a "done when" checklist.
   - Turn "polish this" into a quest with 3 concrete steps. Quests already exist in Hearth (Sidequest)
     and in the quest tracker HUD.

## House rules for working on Hearth

- **Clicks, not commands.** Quentin doesn't use commands. Every feature must be reachable by clicking,
  with visible labels.
- **Plain words.** Status reports go to him in plain words and say where to click, not what to type.
- **Owner safety rules:**
  - Nothing is uploaded automatically.
  - Deletes go to the Trash.
  - A read failure is never treated as "empty data".
  - Never touch his real data in tests.
  - Never modify his game files.
  - Installs are never silent.
- **Codex-owned files** (quest-*, workbench-*, creative-vst*, project-*, astra*): keep edits minimal and
  additive, and document them under a "For Codex" heading.
- **Speed matters.** He has had UI lag, so nothing may run loops or timers while hidden.

Suggested order: stream 1 first, since 2 depends on Swarm working. Streams 3–5 can run in parallel.
