# Round 166: Smoother Forgeheart, lighter on disk
*November 2026*

## Forgeheart chats scroll smoothly

- **In the Forgeheart look, a chat now scrolls on the graphics side too, like the plain looks since round 165.**
  Wheeling through a long chat keeps Hearth's main thread busy about 70 % less (0.8 s instead of 2.9 s for 30 wheel
  turns here), and the hitches of up to 0.3 s are gone. It looks the same: the warm glow and the violet ember stay
  fixed to the window. On a few pixels the glow now sits over the text instead of under it, at most 4 shades out of 255.

## Website caches stay small

- Every signed-in website in Hearth keeps its own cache: each web chat, app window (Meshy, Suno, Figma…), the Adobe
  and Pinterest windows, and the docs and Miro panes. Chromium let each one grow to about 1 GB. Now each one stops at
  80 MB. Pages refill the cache by themselves, and older caches that are bigger shrink the next time you open that site.
