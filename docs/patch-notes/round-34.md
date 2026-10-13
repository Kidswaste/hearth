# Round 34: Fix my scene, lighter long chats, Lab gestures, calm when offline
*October 2026*

## 🩺 Fix my scene (Lab)
A free check of your scene (0 tokens): black frame, a crashed layer, too dark or blown out, subject off-screen, NaN values, very slow frames, music layers with no music, missing files.
**Find it:** right-click the preview › ✦ More › 🩺 Fix my scene, or the Lab toolbar's ⋯.
- Most problems have a one-click fix (hide the broken layer, point the camera at the subject, brighten, halve a count…). Each is one undo step.
- No local fix? **✦ Ask the director** writes one short request for you to send.
- A crash or blank frame shows a small hint once, then it goes away by itself.

## 🗜 Continue lighter
When a long chat re-reads a lot with every message, one line under the reply offers **Continue lighter?** with the size now and after. Nothing happens unless you click.
- It keeps a short summary (cheapest model) plus your last two exchanges word for word. The whole chat stays scrollable and searchable.
- In a 30-message test chat, the last message went from 92k to 16k tokens.
- Set the size or turn it off: ⋯ AI setup › Spending › "Offer to continue lighter" (default ≈ 40k).

## 🖐 Move around Lab scenes
- Trackpad: two fingers turn, Shift + two fingers pan, pinch zooms. Mouse: wheel zooms, right-drag turns, middle-drag pans. A still right-click still opens the menu.
- Double-click (or Z) frames the subject; Shift+Z goes back to the scene's camera. F is still Freeze.
- Looking around never changes your scene; right-click › View › Keep this view makes it the scene's camera.

## 📶 Calm when things go wrong
- No internet: your message waits and sends itself once you're back — exactly once, even after a restart.
- AI busy: Hearth retries by itself (Cancel, or **Ask Astra instead**).
- Usage limit: "until 18:00 — switch to Astra?", in your own time.
- Signed out: the Sign in button is in the line (the engine's own window; never your password).
- A reply cut off by sleep resumes as one reply, without re-sending the whole chat.

## 🪶 Lighter
- With a big history, the background process uses about 175 MB less; "What did we decide?" uses a tenth of the memory (and no longer forgets words after a deleted chat).
- Closing AI setup really frees it; Hearth's own Chrome closes itself after 5 idle minutes (still signed in next time).

## Good to know
- Continue lighter replaces the old silent compaction and the long-chat banner. With the offer Off, Claude Code still compacts by itself near its limit.
- The first chat search after a quiet while takes a fraction of a second longer.
- The offline notes were tested with simulated outages; an unfamiliar error wording stays a normal error.
