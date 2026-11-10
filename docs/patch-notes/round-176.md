# Round 176: chats kept ready let go when you're away; new scenes stay fast; the volume button is back
*November 2026*

## Less memory while Hearth is out of sight

- Hearth keeps your last few chats drawn so switching back is instant. Now, once Hearth has been hidden or minimised
  for 5 minutes, or a kept chat hasn't been shown for 15 minutes, it lets go of them. In a long working session that
  meant about half the page's elements (≈ 20,000 → 9,400) and 2–3 MB less for the window, on top of round 156's trim.
- The chat on screen and a chat that is still answering are never let go. Your drafts stay, and so does your place in
  the chat on screen. The first switch back to a chat that was let go draws it like any chat you open, which is just as
  quick.

## The fast (WebGPU) scenes, everywhere

- **＋ Layer in a new scene adds a fast layer.** The menu now starts with "⚡ Fast layers" (Backdrop, Glow knot,
  Particle field, Cube). Before, every layer you added was the old, heavier kind, even in a new scene.
- **Claude and Astra always know which kind of scene they're in**, so they write the fast kind of code for it. Crew
  helpers too.
- **A fast scene stays fast** when you delete and restore it, open it from a pack or a template, start a new scene
  from it, or keep a crew variation.
- **A new project's scene** is the fast kind only when what's in it is.

## Volume

- **🔊 is back** on the left bar, above ⚙: one volume for everything Hearth plays on this computer. Your recordings and
  renders keep their full sound.

## Quiet tests

- **Test copies of Hearth no longer pop up on your screen.** When a check runs, its copy stays off screen, silent, and
  doesn't take your keyboard.
