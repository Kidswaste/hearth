# Offline (round 34): calm and dependable when things go wrong outside Hearth

No internet, flaky Wi-Fi, the AI's service overloaded or rate-limited, a usage limit with a reset time, an expired
sign-in, the laptop sleeping mid-reply, a VPN or proxy in the way. Before this round each of these was a red error box
with the engine's raw text (a JSON blob for a 529). Its Retry started the engine session over, so the whole
conversation was sent again, and a message typed while offline simply failed. Now Hearth reads each case from the
engines' own error words and the computer's online / offline events, and shows **one plain line in the chat with the
one action that fits**. Nothing is added to any prompt, and waiting for the internet costs no tokens.

## What you see
1. **No internet — will send when you're back**: a message whose send failed for lack of internet waits. It goes out by itself, exactly once, when the internet is back. Cancel on the line stops it.
2. **Typed while offline**: the message doesn't fail. It waits in the chat box as a chip (⏳, like the queue you know: click it to edit it again, × to drop it), with one line saying why. A /command still runs. A message with files or a mission goes the normal way and waits if it fails.
3. **Back online**: everything waiting goes out in order, one chat at a time, each once ("Back online — sending 2 waiting messages").
4. **Claude is busy right now — retrying in 20 s** (overloaded 529, a short 429 rate limit, 5xx, "high demand"): the countdown ticks and Hearth retries by itself.
5. **Bounded retries**: 20 s, 40 s, 80 s (or the wait the service asked for, between 5 s and 5 min), then it stops with "…try again in a moment, or ask Astra" and a Retry button.
6. **Cancel** stops the retries at any time.
7. **Ask Astra instead** (or Ask Claude, from Astra): one click sends the same message to the other AI in a new chat, with the last few messages along. A docked director switches engine in place, in the same chat and scene.
8. **Usage limit reached until 18:00 — switch to Astra?**: the reset time is shown in this computer's local time ("18:00", "18:00 tomorrow", "Tue 18:00"). Hearth reads it from every wording the engines use: Claude Code's `…limit reached|<time>`, "resets 6pm (Europe/Paris)" (converted from that zone), and Codex's "try again in 2 hours 13 minutes" and "try again at Oct 13th, 2026 6:00 PM".
9. **Switch to Astra** sends the message there. With no other AI, the action is **Send at 18:00**: the message goes out by itself when the limit resets.
10. The old "hit its usage limit" toast no longer repeats what the line says.
11. **Signed out — Sign in**: the existing sign-in button sits inside the line. It opens the engine's own window, so Hearth never sees a password. Once that window has opened, Retry appears. "OAuth token has expired", "please run /login", 401 errors and Codex's refresh-token error all show this line.
12. **Can't reach Claude from this network — a VPN or proxy may be blocking it** (407, self-signed or unverifiable certificates, tunnel errors), with Retry.
13. **Reply cut off — the connection dropped** (or "while the computer slept", after a wake): what the AI wrote stays, and **Continue** asks for the rest.
14. **It resumes by itself**: if a reply is cut off while the internet is gone, it continues on its own once you're back ("will continue when you're back"; Cancel stops it).
15. **Continue is token-frugal**: it resumes the same engine session with one short line (the last 200 characters of what was written, about 60–100 tokens), never the whole conversation again.
16. **No duplicated text**: the continuation is stitched into the cut reply as one message. Words the AI repeats are dropped (its last few words, a re-opened code block, or a restart from the top), and the "continue" line disappears.
17. **Retry keeps the session**: Retry on these lines sends the same message on the same engine session, so nothing the engine already has is sent again. (The chat's own ⋯ Retry still starts over.)
18. **Not a red box**: these lines are calm (no shake, no red). The engine's own words are in the line's tooltip, and they have no "Report to the developer" button, since the problem isn't Hearth's.

## Nothing lost
19. **Waiting messages survive a restart** (and a crash): they're saved in `data/kv/offline-queue.json` as soon as they start waiting.
20. **Never twice**: a message is marked "going out" on disk before it goes. After a restart, its chat shows whether it went (a tag on the sent message, or the line already gone), so it's sent at most once.
21. **The chat's own queue** (messages typed while a reply runs) now survives a normal restart too: the messages wait and go out once the chat is free. Before, only a crash kept them (through safetynet).
22. Drafts in the box are kept as before (localStorage + safetynet), and the check confirms it across a restart.
23. **This computer only**: waiting messages are never synced to your other computer, which would send them too.
24. **Messages typed while a reply runs, when that reply fails**: if offline, busy or cut off, they wait behind the retry, in order. If it's a limit, a sign-out or a proxy, they go back in the box, not sent.

## Detection and the internet check
25. **One classifier** (`offline-core.js`) reads both engines' real texts: Claude Code's stream-json results and stderr ("API Error: 529 …overloaded_error", "API Error: Connection error.", "Invalid API key · Please run /login"…) and Codex's exec-json errors ("stream disconnected before completion", "We're currently experiencing high demand", "You've hit your usage limit…"). The fix line Hearth appends is never mistaken for the reason.
26. **Is the internet back?** Hearth asks the OS first (`net.isOnline`), then opens one TCP connection to the AI's service, or to the proxy this computer uses (HTTPS_PROXY), for 3 s at most. No HTTP, no engine, no tokens. It only checks while something waits (after 3 s, 6 s, 12 s…, then at most every 30 s), and nothing runs while nothing waits.
27. **Online / offline events and sleep / wake** (powerMonitor) feed it; after a wake, Hearth checks again 2 s later.
28. **No tight loops on flaky Wi-Fi**: a message that fails again waits longer each time (0, 5, 15, 30, 60 s).
29. **When the check can't get through but the engines can** (a proxy set only in the engine's own settings): after three failed checks while the OS says it's online, the send itself becomes the test. A failed send costs nothing.

## Command
30. **`/offline`**: what waits and when. `/offline send` tries now and `/offline clear` forgets everything waiting. The lines and chips do the same with a click.

## For testing (no upgrade count)
- Fake engines: new switches in `dev/fake-common.js`, set with `hub.kvSet('fake-switches', …)` or `FAKE_*` env, each `'once'`, `'always'` or a number of times:
  - `claudeBusy` / `codexBusy`: 529 / "high demand"
  - `claudeRate`: 429
  - `claudeLimit` / `codexLimit`, with `limitForm` (`epoch` · `zone` · `in`) and `limitAt`
  - `claudeExpired`: cleared by `auth login`
  - `claudeProxy`
  - `claudeCut`: cuts the reply halfway, then sends the rest when asked to continue, repeating its last words

  The fakes' `error` keyword now fails with a neutral text (it used to look like an overloaded or dropped service).
- `node dev/offline-test.js` (unit test, listed in UNIT): 37 real error texts, reset parsing in 4 wordings and 3 time zones, backoff, the lines, stitching, the queue's restart reconcile and order, and the proxy target.
- `dev/checks/offline.js` (smoke check with fake engines, in two parts around a page reload) covers:
  - offline → queued → back online, sent once
  - busy → retried by itself, bounded at 3, Cancel, Ask Astra instead
  - limit lines in local time, and Switch
  - signed out + Retry, and the proxy line
  - cut off → Continue stitched word for word on the same session, and resumed by itself after a simulated wake
  - typed while offline + the chat's own queue + a draft, across a restart, then each sent exactly once

  Run it with `sh dev/run-checks.sh offline`.
- Files: `offline-core.js` (pure), `offline.js` (window), `offline.css`, `offlinemain.js` (main: `net:probe`, `net:power`).

## Caveats
- Not tried against a real outage, a real 529 or a real usage limit here. The texts come from the engines' known messages; a wording the classifier doesn't know stays a normal error, as before.
- The reset time is only as good as the engine's words: "resets 6pm" with no zone is read as 6 pm on this computer.
- A reply that never errors after a sleep (the engine just waits) still shows liveness's "no news" line; Hearth doesn't stop it.
- Continue relies on the engine keeping the cut-off turn in its session. When it doesn't, engines.js's lost-session fallback sends the conversation again, which costs what it used to.

Upgrades: 30.

## For the patch notes
- When the internet drops, your message no longer fails. It waits ("No internet — will send when you're back") and sends itself once you're back, exactly once, even across a restart.
- Typed something while offline? It waits in the chat box as a chip you can edit or drop.
- "Claude is busy right now — retrying in 20 s": Hearth retries a busy or rate-limited AI by itself, three times at most. You can Cancel, or pick "Ask Astra instead" in one click.
- "Usage limit reached until 18:00 — switch to Astra?": the reset time is shown in your own time, with a one-click switch.
- "Signed out — Sign in": the sign-in button is right in the line. It opens the engine's own window, so Hearth never sees your password.
- A reply cut off by sleep or a dropped connection resumes by itself (or with Continue) as one reply, with no repeated text and without re-sending the whole conversation.
- When a VPN or proxy is in the way, Hearth says so in plain words.
- These are now calm one-line notes, not red error boxes. `/offline` lists anything waiting.
- Caveat: tested with simulated outages and fake engines. An error wording the engines haven't used before stays a normal error.
