# Round 58: steadier Getting ready, a quieter Lab, quicker Doctor
*October 2026*

## 🎮 ▶ Play never loses the graphics card while getting ready
- On a busy computer, the quick smoothness check under the "Getting ready" card could keep the graphics card waiting so long that the system restarted it, and the game was set up all over again. The check now pauses the game behind the card while it measures and never makes the graphics card wait on one long frame.
- Its results (Hearth's helpers, the shadow size) are measured exactly as before, and it's quicker: on the test machine the check went from 33.6 s to 26.5 s on a first ▶ Play, 7.8 s to 4.2 s on the second.

## 🧊 The Lab goes quiet sooner
- When a title or scene stops moving just as you click, type or switch a setting, the preview now stops redrawing it within a few frames (it could keep redrawing the same picture for 1–2 seconds). A game that keeps playing is checked as rarely as before. Nothing looks different.

## 🩺 Quicker Doctor, honest plug-in list
- The Doctor and the startup engine check no longer wait up to a minute when Astra's model list can't be reached: after a few seconds they say "couldn't check models right now".
- The Sound desk lists each VST3 plug-in once on the Mac (the Mac ignores upper / lower case, like Windows).

## 🛠 Small fixes
- Asking for a material look on a layer with no 3D scene says so right away, instead of a vague "Something went wrong" a few seconds later.

## Also on main from Astra (Codex)
- Creative tools focused around live instruments, sketches and personal quests.
