# Round 126: the Desk and shader errors
*November 2026*

## 📁 Opening a scene from the Desk
- After you import a project, its "Imported …" message could sit over the Desk's lower rows (and stay while the
  mouse rested on it), so clicking a scene there clicked the message instead and you stayed on the Desk. When an
  import opens its project by itself, the message now goes away as soon as the project is ready.

## 🎛 Shader errors reach the chat
- When a shader in a scene doesn't compile, the Lab's chat now gets one line naming the layer and the error (for
  example: layer "Glass": its fragment shader didn't compile: 'fooBar' : undeclared identifier, line 57), with
  **Ask Claude to fix**. Before, that error could go unmentioned, so the AI might say "done" on a broken scene.
