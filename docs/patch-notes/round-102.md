# Round 102: the AI and the Lab, checked again
*November 2026*

## 🧪 The AI chat and the Lab, re-checked
- **Applying the AI's code tells you the truth.** After ▶ Apply, the chat now waits until the new layer actually shows
  before saying "it runs with no errors", so an error on its first frame isn't missed.
- **The AI sees your model properly.** When Claude or Astra adds a 3D model and then looks at the scene, the look waits
  a moment for the model's full pictures instead of showing the blurry preview version. If they're still loading, the
  AI is told so.
- **History keeps everything.** Changes made in a scene that isn't on screen (an AI working in the background, or your
  ▶ Apply and Undo there) now show up in that scene's History too.
- **New 3D models never stay invisible.** A model layer waiting for its shaders on a slow or busy computer now shows
  within 6 seconds at most, as intended (it could stay blank for 15 s or more).
- **Your typing stays where it is.** If your cursor is in a layer's code, an AI edit to another layer no longer moves
  you there, even if you paused for a while before typing.
- **One-click notes stay gone.** After "Tell Claude what happened", the Apply note no longer comes back when the chat
  redraws.

## 🧰 Steadier speed checks
- **Behind the scenes**: the Lab's start-up check now judges the computer's speed at the moment the Lab opens, not
  seconds later, and no longer counts the pointer arriving on the button as the Lab's work. It still fails at once if
  the Lab reads its big history and picture files before showing its scenes.
- **Behind the scenes**: the sync check with many small files now tells "the code held things up" from "the computer
  was busy", hold by hold. Behind that, it found that a first sync of 50,000 files holds Hearth for up to half a second
  at a time. That is now on the list to fix.
- **Behind the scenes**: the performance guard has a fresh baseline taken on this version, with the measures added in
  rounds 93–101.
