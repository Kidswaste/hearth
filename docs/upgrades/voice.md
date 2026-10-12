# Voice (round 23): talk to your chats, hear them answer

Your hands are on the Lab and you want to tell the Three Director "make it pinker". Hold **Ctrl+Space** and say it.
Everything stays on your computer: the speech is turned into text by whisper.cpp (or faster-whisper) in a separate
process, and the recording is deleted as soon as the text is back. Short commands like "freeze", "save" or "next scene"
run straight away and cost no tokens. When you speak to a chat, its reply is read aloud. Press any key to stop it.

First time: type `/voice install`. It finds whisper if it's installed. If it isn't, it shows the exact steps for your
Mac or PC. It then asks before downloading the speech model (142 MB for the default "base" model) into Hearth's data
folder. Until it's set up, the push-to-talk key points you to your system's own dictation.

## Talking
1. **Push to talk:** hold **Ctrl+Space** anywhere in Hearth, speak, and let go. Your words land in the chat box so you can edit them before sending. On a Mac, hold the real Ctrl key (⌘+Space opens Spotlight).
2. **Tap to talk hands-free:** a short tap of the same key listens until you stop talking.
3. **＋ › 🎙 Talk** in every chat box turns the mic on. Pick it again (⏹ Stop listening) to stop.
4. **`/talk`** (also `/dictate`, `/listen`) starts listening. Run it again to stop, or use `/talk send` to stop and send.
5. **Voice activity detection:** Hearth learns the room's background noise and ends what you said after about 1 second of quiet. If you say nothing for 8 seconds, it stops on its own.
6. **Live waveform:** a small pill above the chat box shows your voice while it listens.
7. **Words as they're recognised:** the pill shows the text bit by bit while whisper works.
8. **The pill:** click it to stop and use the words, click × or press Esc to cancel, or right-click it for the voice settings.
9. **Send when I let go:** your words are sent without stopping in the box first (`/voice send-on-release on`, or right-click the pill).
10. **The Lab's director gets the words:** when the Lab is open, what you say goes to the docked director's chat box.
11. **Talking interrupts reading:** if you start talking while a reply is read aloud, the reading stops.
12. **Silence is cut** from the start and end of each recording, so transcription is faster.
13. **Choose the key:** `/voice key F8`, `/voice key Alt+Space`, `/voice key Ctrl+Shift+Space`… `/voice key default` goes back to Ctrl+Space.
14. **A mouse side button as the key:** `/voice key mouse4` or `/voice key mouse5`.
15. **Choose the microphone:** `/voice mic <part of its name>`; `/voice mic default` goes back.
16. **How long a pause ends it:** `/voice silence 1600` (in ms, between 400 and 4000).

## Speech-to-text on your computer
17. **Finds whisper.cpp** (`whisper-cli`, or the older `whisper-cpp`) on your PATH, in Homebrew's folders on a Mac (GUI apps don't see the shell's PATH), and in `C:\whisper\Release`, LocalAppData, scoop and WinGet on Windows.
18. **Finds faster-whisper** (Python: `python3` on a Mac, `py` or `python` on Windows) when whisper.cpp isn't installed.
19. **Kept off the main threads:** the microphone is read in an AudioWorklet and transcription runs in a child process, so the Lab never stutters.
20. **`/voice install`** shows the exact steps. Mac: `brew install whisper-cpp`. Windows: the `whisper-bin-x64.zip` release unzipped to `C:\whisper`. Either system: `pip install faster-whisper`.
21. **The speech model download asks first** and shows its size. It goes into `data/voice/models`, the progress shows in a notification, and a cut-short download is never kept.
22. **Model choice:** `/voice model tiny | base | small | base.en | small.en`. Each one shows its size and what it's good at, and it offers the download when the model is missing.
23. **Language:** `/voice lang auto` (the default) or a two-letter code such as `/voice lang fr`.
24. **Installed somewhere unusual:** use `/voice path <whisper-cli>` and `/voice model-file <model.bin>`.
25. **Without local speech-to-text:** the key focuses the chat box and tells you how to dictate with your system: press Fn twice on a Mac, or Win+H on Windows.
26. **Mac microphone permission:** Hearth asks with the system prompt. If you said no, it tells you where to allow it (System Settings › Privacy & Security › Microphone).
27. **`/voice status`** shows the engine, the model, the key and every voice setting in three lines.
28. **`/voice history`** lists the last 20 things you said.
29. **Private by design:** each recording is deleted right after it's transcribed, leftovers from a crash are cleared at the next start, and nothing leaves the computer.

## Voice commands (no tokens)
Say these on their own. Hearth runs the existing command, and nothing reaches the chat.

30. "**freeze**" / "**unfreeze**" (also "resume") / "**freeze on the next bar**" (or beat) runs `/freeze`.
31. "**next frame**" runs `/next-frame`.
32. "**save**" (also "save the sliders") runs `/save-sliders`.
33. "**next scene**" / "**previous scene**" / "**random scene**" switch between your saved looks (`/look next|prev|random`) when the Lab is open. Anywhere else you get a hint, so Hearth's colour look never changes by accident.
34. "**shuffle**", "**shuffle the colours**" or "**unshuffle**".
35. "**play**" or "**pause**" (also "play the song").
36. "**present**".
37. "**tap**" taps the tempo.
38. "**stop**" (also "quiet" or "stop talking") stops reading aloud.
39. "**send it**", "**scratch that**" (empties the box) and "**new chat**".
40. "**read it again**" reads the last reply aloud.
41. "**Director, make it pinker**" sends "Make it pinker." to the Three Director. "Director, freeze" runs `/freeze` directly instead of asking the director.
42. "**Astra, …**" and "**Claude, …**" send to that chat in the same way.
43. "**command size 9 16**" runs any chat command by name (`/size 9 16`).
44. **Your own phrases:** `/voice word make it pop = /shuffle wild` (nothing after `=` removes the phrase).
45. **`/voice words`** lists everything you can say.
46. **`/voice try next scene`** acts as if you had said it (handy without a mic).
47. **`/voice commands off`** treats everything you say as text.

## Hearing replies
48. **Replies to what you said are read aloud.** This also covers words you dictated and then sent by hand. Turn it off with `/voice replies off` (`/read auto on` still reads every reply).
49. **Any key stops reading.** Alt+R keeps its read / stop toggle. `/voice anykey off` turns this off.
50. **Cleaner reading:** code blocks are skipped (it says "code skipped"), and tables, pictures and bare links are named instead of being spelled out. Link text is read without the address, and Markdown symbols and emoji are left out.
51. **The system's own voices:** `/voice speak system` reads with macOS `say` (including the Siri / premium voices you installed) or the Windows voices (SAPI). The text is passed privately, not on a command line. `/voice speak browser` goes back. The reading speed from `/read rate` applies to both.
52. **Choose a system voice:** `/voice voice <name>`, with your installed voices suggested as you type.

## For the chats
53. The app map (`hearth_help chats`, read only on demand, so no per-message tokens) tells Claude and Astra that a spoken message may be loose, and that the reply will be read aloud, so the answer should come first in plain sentences.

## Notes
- Tests: `sh dev/run-checks.sh voice`. `dev/voice-test.js` has 82 Node checks: voice commands, keys, voice activity detection, the WAV, read-aloud text, and the main side against `dev/fake-whisper.js` (arguments, partial text, failure, cancel, the model download through a local server). `dev/checks/voice.js` runs in the app with an oscillator as the microphone: hold → waveform → words in the box, hands-free → "Freeze." → `/freeze`, "Director, …" → the director, send on release → the reply read aloud without its code, any key stops it.
- Not tested against a real whisper binary or a real microphone. The fake answers according to the tone it hears.
- The PTT key is Ctrl+Space on both systems. On a Mac where Ctrl+Space switches input sources, use `/voice key F8` (or a mouse button).
