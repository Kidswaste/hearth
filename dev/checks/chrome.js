// Hearth's Chrome (round 30, chrome stream), end to end with a real Chromium standing in for Google Chrome
// (Playwright's, launched "as Chrome" in the throwaway data folder's own profile) and local test pages:
//  1. AI setup's Chrome row says it's found; an app set to "Open in Chrome" opens there (the Hearth Chrome starts with
//     its debugging port), is listed as open, and the AI tools work on it the same way: read the title and text, click
//     a button (the title changes), type a prompt (apps_open paste: the shared fill script), a picture (apps_page shot,
//     and the page picture sent to the chat), wait for a selector; "Use it inside Hearth" brings it back.
//  2. An app in Hearth's own window whose sign-in popup lands on Google's "Couldn't sign you in" page: the popup goes,
//     the app window shows the offer; its "Sign in with Chrome instead" opens the same site in the Hearth Chrome.
//  3. A website chat whose page lands on the refusal page: the offer shows above it; one click → it lives in Chrome
//     (round 31: shown here in a Chrome view), and asking it something types into its chat box in Chrome and presses Enter.
//   node dev/smoke.js --pw-chrome --wait 6000 --check-timeout 180000 --script dev/checks/chrome.js --shot /tmp/chrome.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(200); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await Lazy.load('chrome');
  step(typeof ChromeUI !== 'undefined', 'the chrome group loads');
  const st = await window.hub.chrome.status({ fresh: true });
  const base = st.testBase;
  step(Boolean(st.found && base), 'Chrome is found (the stand-in) and the test pages are up', st.found);

  // the row in ⋯ AI setup › What it can use
  await Lazy.load('options');
  Options.open({ agentId: H.claudeAgent().id });
  const row = await until(() => [...document.querySelectorAll('.opt-sheet .opt-row')].find((r) => /Chrome \(for Google sign-in\)/.test(r.textContent)), 8000);
  step(Boolean(row) && /Google Chrome · found/.test(row?.textContent || ''), 'AI setup › What it can use has the Chrome row: found, Open, Sign in…', row?.textContent);
  step(Boolean(row?.querySelector('button') && [...row.querySelectorAll('button')].some((b) => b.textContent === 'Sign in…')), 'the row has Open and Sign in… buttons');
  Options.hide();

  // ---------- 1. an app in Chrome, driven like an embedded one ----------
  Apps.register({ id: 'chrometest', name: 'Chrome Test', icon: '◍', url: `${base}/page`, group: 'More' });
  await window.hub.apps.chrome('chrometest', 'chrome');
  await Apps.open('chrometest');
  const listed = await until(async () => (await window.hub.apps.windows()).find((w) => w.id === 'chrometest' && w.chrome), 30000);
  step(Boolean(listed), 'the app set to Chrome opened in the Hearth Chrome (listed as open there)', listed);
  const st2 = await window.hub.chrome.status({ fresh: true });
  step(st2.controlled && st2.pages >= 1, 'the Hearth Chrome is open with Hearth\'s hand on it', { pages: st2.pages, browser: st2.browser });
  await window.hub.apps.page('chrometest', 'wait', { selector: '#go', timeout: 15000 });
  const t1 = await Apps.tool('apps_page', { app: 'chrometest', do: 'info' });
  step(t1.ok && t1.value?.title === 'Hearth test page', 'the AI reads the page\'s title in Chrome', t1.value);
  const t2 = await Apps.tool('apps_page', { app: 'chrometest', do: 'text' });
  step(t2.ok && /Hello from the test page/.test(t2.value), 'the AI reads the page\'s text', String(t2.value).slice(0, 80));
  const c = await Apps.tool('apps_page', { app: 'chrometest', do: 'click', selector: '#go' });
  const clicked = await until(async () => (await window.hub.apps.page('chrometest', 'info')).value?.title === 'Clicked', 5000);
  step(c.ok && Boolean(clicked), 'the AI clicks a button there (a real click: the page\'s title changes)', c);
  const pasted = await Apps.tool('apps_open', { app: 'chrometest', paste: 'dreamy synthwave, 90 bpm', field: 'prompt' });
  const val = await window.hub.chrome.page('app:chrometest', 'eval', { expr: 'document.querySelector("#q").value' });
  step(pasted.ok && val.value === 'dreamy synthwave, 90 bpm', 'apps_open paste types a prompt into the page in Chrome (the same fill as in Hearth\'s windows)', { pasted: pasted.value || pasted.error, val: val.value });
  const ty = await Apps.tool('apps_page', { app: 'chrometest', do: 'type', selector: '#q', text: 'lo-fi' });
  const val2 = await window.hub.chrome.page('app:chrometest', 'eval', { expr: 'document.querySelector("#q").value' });
  step(ty.ok && val2.value === 'lo-fi', 'apps_page type replaces the box\'s text', val2.value);
  const shot = await Apps.tool('apps_page', { app: 'chrometest', do: 'shot' });
  step(shot.ok && shot.images?.[0]?.data?.length > 1000 && /in Chrome/.test(shot.value), 'apps_page shot: a picture of the Chrome page', { len: shot.images?.[0]?.data?.length, v: shot.value });
  const pic = await window.hub.apps.picture('chrometest');
  step(typeof pic === 'string' && /chrometest-page\.jpg$/.test(pic), 'the page picture (send to chat) comes from Chrome', pic);
  const w8 = await Apps.tool('apps_page', { app: 'chrometest', do: 'wait', selector: '#nothing', timeout: 600 });
  step(w8.ok && w8.value === false, 'wait for a selector that never comes: false after the timeout');
  const bad = await Apps.tool('apps_page', { app: 'chrometest', do: 'click', selector: '#nope' });
  step(!bad.ok && /Nothing matches #nope/.test(bad.error), 'a click on nothing: a plain error', bad.error);
  const nav = await window.hub.apps.nav('chrometest', 'url', `${base}/start`);
  const moved = await until(async () => (await window.hub.apps.page('chrometest', 'info')).value?.title === 'Test app', 10000);
  step(nav.ok && Boolean(moved), 'the app window\'s navigation works in Chrome (go to an address)');
  // back inside Hearth
  await window.hub.apps.chrome('chrometest', 'hearth');
  await Apps.open('chrometest');
  const here = await until(async () => (await window.hub.apps.windows()).find((w) => w.id === 'chrometest' && !w.chrome && w.visible), 15000);
  step(Boolean(here), '"Use it inside Hearth" brings the app back to Hearth\'s own window');
  await window.hub.apps.close('chrometest', { destroy: true });

  // ---------- 2. Google refuses in an app window's sign-in popup ----------
  Apps.register({ id: 'rejtest', name: 'Reject Test', icon: '✖', url: `${base}/start`, group: 'More' });
  await Apps.open('rejtest');
  await until(async () => (await window.hub.apps.page('rejtest', 'wait', { selector: '#signin', timeout: 2000 })).value, 20000);
  const was = (await window.hub.apps.status()).lastOffer?.at || 0;
  await wait(1000); // (the page painted: a click before its first frame can be dropped)
  let pc = null; let offered = null;
  for (let i = 0; i < 3 && !offered; i += 1) { // a real click through the page; again if nothing opened
    pc = await window.hub.apps.page('rejtest', 'click', { selector: '#signin' });
    offered = await until(async () => { const o = (await window.hub.apps.status()).lastOffer; return o && o.at > was && o.id === 'rejtest' ? o : null; }, 7000);
  }
  step(pc.ok && Boolean(offered), 'the refusal page in the sign-in popup is noticed: the app window offers Chrome', offered || pc);
  step(offered?.popup === true && offered?.url === `${base}/start`, 'it came from the popup, and Chrome would open the app\'s own page (not Google\'s)', offered);
  const bar = await until(async () => (await smoke({ pageEval: 'apps-window\\.html\\?id=rejtest', expr: '(() => { const b = document.getElementById("aw-offer"); return b ? b.textContent : null; })()' })).value, 8000);
  step(/Sign in with Chrome instead/.test(bar || '') && /My everyday Chrome/.test(bar || ''), 'the offer bar in the app window: Sign in with Chrome instead · My everyday Chrome', bar);
  const popups = await until(async () => !(await smoke({ pageEval: 'signin/rejected', expr: '1' })).value, 6000);
  step(Boolean(popups), 'the dead-end popup closed by itself');
  await smoke({ pageEval: 'apps-window\\.html\\?id=rejtest', expr: 'document.querySelector("#aw-offer .aw-go").click(), true' });
  const rejChrome = await until(async () => (await window.hub.apps.windows()).find((w) => w.id === 'rejtest' && w.chrome), 30000);
  step(Boolean(rejChrome) && /\/start/.test(rejChrome?.url || ''), 'one click: the same site opens in the Hearth Chrome (and stays there next time)', rejChrome);
  step((await window.hub.chrome.pref()).apps.rejtest === 'chrome', 'remembered for that app');

  // ---------- 3. a website chat ----------
  const agent = { id: 'chrome-web-test', name: 'Web Test', mode: 'web', icon: 'W', color: '#4285f4', url: `${base}/chat` };
  H.config.agents.push(agent);
  await saveConfig();
  await until(() => H.surfaces.get(agent.id)?.webview, 10000);
  activate(agent.id);
  const view = H.surfaces.get(agent.id).webview;
  await until(async () => { try { return /\/chat/.test(view.getURL()) && !view.isLoading(); } catch { return false; } }, 15000);
  step(!view.dataset.chrome, 'a website chat that isn\'t Google-only stays inside Hearth');
  await view.executeJavaScript('document.getElementById("signin").click()');
  const offer = await until(() => H.surfaces.get(agent.id).el.querySelector('.chr-offer'), 15000);
  step(Boolean(offer) && /Sign in with Chrome instead/.test(offer?.textContent || ''), 'the refusal page in a website chat: the offer shows above it', offer?.textContent);
  await smoke({ shot: '/tmp/chrome-offer.png' });
  offer?.querySelector('button.primary')?.click();
  const card = await until(() => H.surfaces.get(agent.id).el.querySelector('.chr-view .cv'), 15000); // (round 31: a Chrome view of its page, no longer a card)
  step(Boolean(card) && H.agent(agent.id).chrome === 'on', 'one click: the chat lives in Chrome now (its page in a Chrome view here, saved on the agent)', card?.className);
  const aw = await until(async () => ((await window.hub.chrome.status({ fresh: true })).windows || []).find((x) => x.key === `agent:${agent.id}`), 30000);
  step(Boolean(aw) && /\/chat/.test(aw?.page?.url || ''), 'its page is open in the Hearth Chrome', aw?.page);
  await sendToWebsite(H.agent(agent.id), 'hello from Hearth');
  const sent = await until(async () => { const r = await window.hub.chrome.page(`agent:${agent.id}`, 'info'); return r.value?.title === 'sent: hello from Hearth' ? r.value.title : null; }, 15000);
  step(Boolean(sent), 'asking it types into its chat box in Chrome and presses Enter', sent);
  await smoke({ shot: '/tmp/chrome-card.png' });
  await ChromeUI.setAgent(H.agent(agent.id), 'off');
  step(!H.surfaces.get(agent.id).el.querySelector('.chr-view') && H.agent(agent.id).chrome === 'off', '"Use it inside Hearth instead" brings it back');

  // the command still answers (internal API)
  const s = await Commands.tryRun('/chrome', H.claudeAgent().id);
  step(true, '/chrome answers', typeof s === 'string' ? s.slice(0, 120) : s);
  await window.hub.chrome.quit();
} catch (err) {
  out.problems.push(`threw: ${err.message}`);
  out.stack = String(err.stack || '').split('\n').slice(0, 4).join(' | ');
}
return JSON.stringify(out, null, 1);
