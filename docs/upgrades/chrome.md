# chrome (round 30): Google sign-in in your real Chrome, with Hearth's hand on it

The owner, with a screenshot: every Google sign-in inside Hearth shows Google's **"Couldn't sign you in — This browser
or app may not be secure"**. Hearth already presented a plain Chrome user agent and kept sign-in popups inside the app,
but Google recognises embedded browsers anyway. The owner asked: *"could we just use Chrome and hook into Chrome?"*

Yes. Where Google sign-in is needed, the page opens in **your real Google Chrome** (Edge or Brave when there's no
Chrome: Chromium browsers Google accepts), in **a Chrome profile of Hearth's own**. You sign in to Google once there,
on Google's own page, and it stays signed in. Hearth keeps its hand on those pages through Chrome's DevTools protocol
(the way developer tools talk to Chrome, on a port only this computer can reach), so the AI tools and "ask everyone"
work there the same way they work in Hearth's own windows. Hearth never sees or handles a password.

How it fits together:
- `chrome-cdp.js` (plain Node): finding Chrome, which sites are Google-only, Google's refusal page, the client hints,
  and a small DevTools client (Node's own WebSocket, no dependency).
- `chromemain.js` (main process, loaded on first use): the Hearth Chrome (data/chrome/profile, `--user-data-dir` +
  `--remote-debugging-port` on a free 127.0.0.1 port; Chrome 136+ refuses that on your everyday profile, so a profile
  of its own is required), its windows, page actions, your everyday Chrome, signing in.
- `chromeguard.js` (main process, always on, small): the user agent and client hints, and noticing the refusal page.
- `appsmain.js` / `apps-window.js`: app windows in Chrome, the AI's hands on a page (`apps_page`), the offer bar.
- `chrome-ui.js` + `chrome-ui.css` (the hub, lazy group `chrome`, loaded on use): AI setup's Chrome row, website chats
  in Chrome, the offer above a website chat, `/chrome`.

## Upgrades

### The Hearth Chrome
1. **Hearth finds Chrome by itself** on a Mac (`/Applications`, `~/Applications`), on Windows (Program Files, Program Files (x86), your AppData, and Windows' own "App Paths" record in the registry for unusual install places) and on Linux; **Microsoft Edge, then Brave** (then Chromium) when there's no Chrome.
2. **A Chrome profile of Hearth's own** (data/chrome/profile): your everyday Chrome, its tabs and logins aren't touched; sign in to Google once there and it stays signed in. It never syncs to your other computer (it belongs to this one).
3. **Hearth drives it through Chrome's DevTools protocol** on a free port reachable only from this computer; a Hearth Chrome left open across a Hearth restart is found again (no second Chrome).
4. **App windows open as Chrome app windows** (no tabs, no address bar), so they still look like Hearth windows.

### App windows (Suno, Meshy, Pinterest, Firefly, YouTube Studio…)
5. **Automatic for sites whose sign-in is Google's only** (Gemini, NotebookLM, AI Studio, Google Labs, YouTube Studio, Google Docs / Drive…): they open in Chrome when Chrome is on this computer.
6. App window **⋯ › Open in Chrome (for Google sign-in)**: that app opens in Chrome from now on (remembered per app).
7. App window **⋯ › Open this page in my everyday Chrome**: your own Chrome and its logins (Hearth can't drive it there).
8. Opening an app that lives in Chrome shows **"… opened in Chrome"** with a one-click **Use it inside Hearth**.
9. The app window's own actions work on its Chrome window: reload, back, forward, go to an address, its start page, copy the address, **send the page to the chat** (address, what you selected, a picture), close.
10. `/apps windows` and the AIs' window list show the apps open in Chrome.

### When Google refuses anyway ("Couldn't sign you in")
11. **Hearth notices Google's refusal page wherever it shows**: an app window, the sign-in popup an app opened, a website chat (by its address, or by its words on Google's own page; never another site's).
12. **In an app window, a bar offers "Sign in with Chrome instead"** (one click) and "My everyday Chrome"; Chrome opens the app's own page, not Google's dead end, and remembers it for that app.
13. **The dead-end sign-in popup closes by itself** once the offer shows.
14. **Above a website chat, the same offer**; one click and that chat lives in Chrome.

### Website chats (ChatGPT, Gemini, claude.ai, Perplexity…)
15. **A website chat can live in Chrome**: its place in Hearth shows a calm card: **Show it in Chrome**, **Sign in to Google…**, **Use it inside Hearth instead**. Gemini does this by itself when Chrome is found.
16. **Right-click a website chat in the rail › Open in Chrome (for Google sign-in)** / **Use it inside Hearth instead**.
17. **Asking everyone reaches it in Chrome**: Hearth types your message into its chat box there and presses Enter.
18. **Its Chrome window comes forward** when you open that chat in Hearth (once it has one: nothing starts by itself).

### ⋯ AI setup › What it can use › Chrome
19. **A "Chrome (for Google sign-in)" row**: found (which browser) or not found, with **Open** (the Hearth Chrome) and **Sign in…** (Google's own page there); **Get Chrome** when there's none.
20. **What opens in Chrome is listed** under it, each with ✕ to bring it back inside Hearth.
21. Its ⋯: **Sign in without Hearth's hand on Chrome…** (for the rare time Google still refuses: the Hearth Chrome reopens on Google's page with nothing of Hearth attached; the sign-in stays, Hearth takes its hand back the next time it needs it).
22. Its ⋯: **Close the Hearth Chrome**, 23. **Show its profile folder**, 24. **Look for Chrome again**.

### The AIs' tools
25. **`apps_page`** (with the app tools on): the AI reads an app's page text, **clicks** (a real mouse click), **types** into a box (+ Enter), presses a key, takes **a picture**, waits for something to appear or the page to load, goes to an address: **the same in Hearth's windows and in Chrome** (≈ 130 tokens a message, only for AIs with the app tools on).
26. **apps_open paste works in Chrome too** (Suno's lyrics / style boxes): the same fill script as Hearth's windows, shared in apps-core.js.
27. The page picture the chat gets (💬 and apps_page shot) comes from Chrome when the app is there.

### The cheap fix, tried first and kept
28. **The user agent names this computer's real system** (it said Windows on a Mac too) with Chrome's own short version, as real Chrome sends it.
29. **Client hints say "Google Chrome"** (Sec-CH-UA, platform, the full version list when asked) on Google's sites, matching the user agent. *This can't be verified here (no Google account, no network): if Google still refuses, the offer above takes over.*

### Commands and the palette (the app's internal API; the buttons above are the way in)
30. `/chrome` (status · open · sign-in [plain] · everyday <url> · app <app> chrome|hearth|auto · here on|off · pages · quit).
31. Ctrl/⌘+K: **Chrome: open the Hearth Chrome (Google sign-in)**, 32. **Chrome: sign in to Google in Chrome**.

## Tests
- `node dev/chrome-test.js` (unit, 16 ok): finding Chrome on Mac / Windows (folders + registry App Paths) / Linux,
  Edge / Brave / the owner's pick, Google-only sites, the refusal page (address, words, only on Google's host), client
  hints and user agent; the DevTools client against `dev/fake-cdp.js` (a fake Chrome: hand-made WebSocket server):
  connect, list / open / attach / close pages, navigate + wait for the load, title, text, click in the element's box,
  type (replace / append), Enter, a scaled JPEG screenshot, wait for a selector, plain errors, the connection closing.
- `node dev/smoke.js --pw-chrome --script dev/checks/chrome.js` (`sh dev/run-checks.sh chrome`): Playwright's Chromium
  launched **as "Chrome"** in the throwaway data folder's profile, with local test pages: the AI setup row (found, Open,
  Sign in…); an app set to Chrome opens there as an app window, the AI reads its title / text, clicks (the page's
  title changes), pastes a prompt, types, takes a picture, waits, navigates; back inside Hearth; an app in Hearth's
  window whose sign-in popup lands on a fake "Couldn't sign you in" page → the popup closes, the app window shows the
  offer, its button opens the same site in Chrome (remembered); a website chat landing on the refusal page → the
  offer → one click → the card, its page in Chrome, asking it types and presses Enter there; back inside Hearth. 30 ✓.
- `node dev/apps-unit-test.js` (the apps tools list, still lean), `node dev/boot-test.js` (chromemain.js channels).

## Risks and what couldn't be checked here
- **No real Google account, no network here**: whether Google accepts sign-in in Chrome started with a debugging port
  (Hearth never passes `--enable-automation`, so `navigator.webdriver` stays false) is not verified; "Sign in without
  Hearth's hand on Chrome" is the fallback if it doesn't. Whether the client-hint fix alone satisfies Google is unknown.
- Real Google Chrome on a Mac / Windows wasn't run: the paths and the registry lookup are unit-tested, and the second
  start handing its `--app` window to the running Chrome was tried with Chromium on Linux.
- An existing Gemini website chat now opens in Chrome by itself when Chrome is found (right-click › Use it inside
  Hearth instead brings it back). If the Hearth Chrome is open without Hearth's hand on it (after "Sign in without
  Hearth's hand"), Hearth asks you to close its windows once.
- Downloads from an app in Chrome land in Chrome's own Downloads folder (not Downloads/Hearth/<App>).

## For the patch notes
- Google sign-in works again: where Google refuses inside Hearth ("Couldn't sign you in"), the page opens in your real Google Chrome instead (Edge or Brave if there's no Chrome).
- It's a Chrome profile of Hearth's own: sign in to Google once there and it stays signed in; your everyday Chrome isn't touched.
- When Google's refusal page shows in an app window or a website chat, one button: **Sign in with Chrome instead**.
- Any app window: ⋯ › **Open in Chrome (for Google sign-in)**, or **Open this page in my everyday Chrome**.
- Website chats: right-click one in the rail › **Open in Chrome**; Gemini does it by itself. Asking everyone still reaches it.
- ⋯ AI setup › What it can use › **Chrome**: found or not, Open, Sign in…, and what opens there (✕ brings it back).
- Hearth still reaches pages in that Chrome: the AI reads, clicks, types and takes pictures there like in Hearth's windows.
- Hearth never sees your password: you sign in on Google's own page, in Chrome.
- Caveat: we couldn't try a real Google account here; if Google still refuses, AI setup's Chrome ⋯ › "Sign in without Hearth's hand on Chrome".
