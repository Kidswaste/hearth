# Round 177: the newest engine, measured
*November 2026*

## Hearth stays on its current engine, on purpose

- Hearth runs on Electron, its own copy of Chrome. A new one, 45.3.0, came out, so this round measured it against the
  one Hearth uses (44.5.1) in the same tests, one after the other, twice: starting up, a chat sitting idle, scrolling and
  switching chats, a reply streaming in, the Lab playing a heavy scene, and Hearth hidden.
- The new one starts a touch quicker (about 0.05 s) and drew the Lab's test scene a little smoother on the test
  computer. It uses the same amount of processor. But it holds more memory everywhere: about 12–33 MB more in what your
  computer really spends with a chat open or after using the Lab, and every one of Hearth's processes is a bit bigger.
- You asked for lighter, so Hearth stays on 44.5.1 for now. Nothing changes on your computers.

## Ready for a lighter one later

- Everything Hearth needs to offer a new engine calmly is built and tested, and set aside: a line in Settings › This
  computer & sync with the engine's version, and, only when a lighter one is approved, one button to download it. It
  would never download or install by itself, would check the download's fingerprint, and would keep the old engine
  for one start so a failed start goes straight back.
- Hearth also already works on the new engine: every check we ran on it passed, or failed the same way on the current one.

## Under the hood

- One thing to do before the engine after that (46): three places that keep keys safe use a way of asking the
  computer's keychain that Electron is removing. They still work today.
