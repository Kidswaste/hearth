# Round 151: a speed check-up
*November 2026*

- **Fixed:** in the Lab, a quick flick of the mouse into the picture's top-right corner sometimes left the buttons
  hidden (since round 150). They now always come back where you point.
- Leave a moving scene stopped and walk away for a minute: the preview drops to 30 frames a second, so your graphics
  card is freer for your other apps. Touch anything and it's back to full speed. A playing song or live sound never slows it.
- The Lab's small glowing touches (the header dots and sweeps, the timeline glint) now rest with the rest of the look
  when nobody is using Hearth.
- With Hearth hidden in the tray, the scene frame's labels stop updating (they kept ticking for nobody).
- **Fixed:** the timeline could stay frozen for a whole song if you pressed play while it was still appearing.
- While a scene plays, Hearth no longer re-scans its buttons every second because of the Lab's live numbers.
- We measured everything: with a chat open and nothing happening, Hearth uses about 3–5 thousandths of a second of
  work per second. Almost all the cost while the Lab plays is the scene itself being drawn on your graphics card.
