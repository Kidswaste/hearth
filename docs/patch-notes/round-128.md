# Round 128: projects that start with a plan
*November 2026*

## ✦ The AI prepares before it builds
- A project can now have a **brief**. The AI reads the project's moodboard, Lab references, song (tempo, sections,
  drops) and what you wrote you're making, and writes a short plan: the mood and look, a palette, a tempo plan per
  section, 3–6 first steps, the risks, and a question or two only if something is unclear.
- It shows as a **plan card** at the top of the project's Lab chat and Three Director: **▶ Start with step 1** sends
  that step to the director (only when you click), **✎ Edit the brief**, **↻ Refresh** (when the moodboard, references
  or song changed since), **Hide**. The steps tick off as you go.
- The AI sees the moodboard's pictures only if you tick **Let the AI look at the moodboard** for that project.
- The director keeps a short version of the brief in mind, can read the whole brief when it needs it, and for big
  requests ("make a visual for this song") states a short plan before building.
- Also: `/brief`, and Ctrl/⌘+K "Prepare the brief".

## ＋ A richer new project
- Name + **Create project** still works in two clicks. Below it, optional parts:
  - **Start from**: an empty scene, an audio visualizer, particles, shader art, kinetic type, a 3D model showcase,
    footage + effects, one of your scenes or templates, or a copy of a project.
  - **Music & footage**: pick or drop a song (analysed when the project opens) or footage.
  - **Look**: drop pictures for the moodboard, pick a palette (or **✦ Suggest a palette** from your pictures, on your
    computer), a size (16:9, 9:16, 1:1, 4K) and a frame rate (24, 30, 60).
  - **AI**: Claude or Astra, **Let the AI look at the moodboard**, **Let the AI prepare a brief** (on by itself
    when there's a song or pictures), and **✦ Suggest a name** from what you're making.
- The size, frame rate and AI you pick are remembered for the next project, and the Render window uses the project's
  own frame rate and size for its scenes.
- Fixed: a 9:16 scene rendered on "Lab frame" before the Lab's sequence was opened came out 1920×1080; it is now
  1080×1920.

## ☰ One project menu
- The same, tidier menu wherever a project shows: the project name ▾ above the chats list, the **⋯** on a Home card
  (or right-click it), the Desk's **⋯**, and Ctrl/⌘+K "Project menu". **Ctrl+Shift+O** (⌘⇧O) opens it for the
  project in front of you; the arrow keys and Enter work.
- At the top: the project's mark, name and a status line (for example "3 chats · 2 scenes · song 128 BPM · brief
  ready"). Then: **Open** (Desk, Lab, chats) · **Make** (new chat, new scene, add to the moodboard, a song) · **AI**
  (prepare or refresh the brief) · **Look** (rename, colour and mark, cover picture from a frame) · **Share & keep**
  (export, duplicate, its folder, render) · **Settings** (default AI, aspect & frame rate) · **Close** (archive,
  delete).
- Delete now asks first, says what's inside, and sends the project to Recently deleted.
