# Optimize (round 12): smooth again, habits that tidy, sequence reload and render

You asked: "do an optimization pass, save framerates where you can on the whole app so that's its back to being
smooth, and are you still tracking my habits/errors? if so do a pass on that too, help my workflow get faster and
hide things i never use. Add a visible reload button for when the sequence bugs out (happens often during frame
swapping) and add a render button with options that's a bit more obvious."

Measured before → after (headless, same machine):
- Switching to a 320-message chat: about 772 → 200 DOM changes a second, layout objects 36k → 6k, the long frame
  stall is gone; opening it 263 → 99 ms.
- Streaming a reply: 78 → 60 DOM changes a second. Idle app: back to 0 frames drawn.
- Ready after launch: about 519 → 362 ms.

1. Long chats show their last 40 messages; "↑ Show N earlier messages" (or scrolling up to it) loads the rest without moving what you're reading.
2. Jumping to an old message (search, bookmark, pin) loads the whole chat first, so it always lands.
3. The working status line under a running reply repaints at most twice a second.
4. The token meter's live number repaints at most twice a second.
5. Progress bars move in 2 % steps instead of every tiny change.
6. Video Review's player loop parks when it's hidden and paused, and wakes on play or when you open it.
7. Every tool announces when it's opened, so parked loops wake right away.
8. WebM files whose length the browser doesn't know are measured once, so nothing loops to "infinity".
9. Errors are kept in a small local log (toasts, failed runs, page errors), grouped by kind with paths and ids folded, and the fix shown with each.
10. `/habits errors` lists your most frequent errors and their fixes; `/habits forget-errors` clears the log.
11. Hearth tidies a screen once a week after 7 days of use: controls you never touched there are tucked into its ⋯ menu (always one click away, Customise… brings them back).
12. `/habits` shows what's tracked; `/habits tidy on | off | now` controls the weekly tidy.
13. The Lab sequence has a visible **↻ Reload** button: it reloads the preview and puts the sequence back at the same time.
14. `/sequence reload` does the same from chat.
15. A clear **⇪ Render** button on the sequence toolbar and the Lab's media strip opens a render panel: formats (several at once), 24 / 30 / 60 fps, Draft / High / Best quality, sound on / off, open in Video Review after.
16. The render panel remembers your last choices; "Record in real time instead" is still one click; right-click ⇪ Render for the old quick menu.
17. `/sequence render options` opens the render panel from chat.
18. A sequence that reaches its end holds its last frame instead of going black (this read as the sequence "bugging out"); Play starts it again from the top.
19. Changing the frame size while a sequence plays keeps picture and clock in step (tested with 8 size changes in a row).
20. A new chat shows up in the chats list right away, marked as a draft until its first message.
