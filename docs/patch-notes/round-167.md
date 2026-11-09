# Round 167: Lighter frames, a cache you can free
*November 2026*

## Each frame draws less

- **When a dialog, a menu or a new view has finished easing in, it no longer stays on its own graphics layer.** Every
  frame after that draws less: about 27 % less work for the graphics side in a chat, 31 % with Settings open. Typing in
  the chat box costs it 20–29 % less, Settings and project switches about 10 % less. It looks exactly the same.
- Opening the Mood board costs a little more once (about 17 % here), because the board is drawn once more after it
  eases in.

## Free up the graphics cache

- Disk calm now lists Chromium's **Graphics cache** (about 5 MB after a session) with the other caches that come back
  by themselves, instead of under sign-ins. Free up empties it the next time Hearth starts, because it is in use while
  Hearth runs. Your sign-ins are untouched, and nothing is freed unless you ask.
