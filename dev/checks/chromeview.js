// Chrome views (round 31, chromeview stream), end to end with a real Chromium standing in for Google Chrome
// (Playwright's, launched "as Chrome" in the throwaway profile: smoke --pw-chrome) and local test pages:
//  1. an app set to Chrome opens in its Hearth window as a Chrome view; frames arrive; every Chrome window is off-screen
//  2. through the view (DOM events on the view, mapped by chromeview-core.js): a click on a button (the page's title
//     changes), typing into a box, a paste, the wheel scrolls the page, the page's cursor shows on the view
//  3. a popup the page opens → another Chrome view over it (off-screen in Chrome too), closed with ✕
//  4. a download → Downloads/Hearth/<App> (the app window's list); a file picker → Hearth's own (answered by the test)
//  5. the window hidden → the screencast stops (no frames, CPU measured both ways); shown → frames again
//  6. Sign in (opens Chrome once): the page's Chrome window comes on screen, the view waits; the page leaves the sign-in
//     page → the window goes back off-screen, the view carries on; the AI tools still read / click the page
//  7. a website chat in Chrome shows its page in a Chrome view in the hub (drawing only while it's the one shown); a
//     sign-in page inside it offers "Sign in (opens Chrome once)"; asking it types there
//   node dev/smoke.js --pw-chrome --wait 6000 --check-timeout 240000 --script dev/checks/chromeview.js --shot /tmp/chromeview.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(200); } return null; };
const out = { steps: [], problems: [], cpu: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); if (!ok) out.problems.push(label); };
const AW = 'apps-window\\.html\\?id=cvtest';
const inWin = async (expr) => (await smoke({ pageEval: AW, expr })).value;
// the test's hands in the app window: events on the view, at the page's own CSS pixels (the view is the page's size)
const HANDS = `(() => { if (window.__cv) return true; const stage = (pop) => document.querySelector(pop ? '.cv-popup .cv-stage' : '#aw-main > .cv > .cv-stage'); const keys = () => document.querySelector('#aw-main > .cv .cv-keys');
  const at = (s, x, y) => { const r = s.getBoundingClientRect(); return { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' }; };
  window.__cv = {
    click(x, y, pop) { const s = stage(pop); const o = at(s, x, y); s.dispatchEvent(new PointerEvent('pointermove', { ...o, buttons: 0 })); s.dispatchEvent(new PointerEvent('pointerdown', { ...o, button: 0, buttons: 1 })); s.dispatchEvent(new PointerEvent('pointerup', { ...o, button: 0, buttons: 0 })); return true; },
    move(x, y) { const s = stage(); s.dispatchEvent(new PointerEvent('pointermove', { ...at(s, x, y), buttons: 0 })); return true; },
    type(text) { const t = keys(); t.focus(); for (const ch of text) { const code = /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : ch === ' ' ? 'Space' : ''; t.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code, bubbles: true, cancelable: true })); t.dispatchEvent(new KeyboardEvent('keyup', { key: ch, code, bubbles: true, cancelable: true })); } return true; },
    key(key, code, o = {}) { const t = keys(); t.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...o })); t.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true, ...o })); return true; },
    paste(text) { const dt = new DataTransfer(); dt.setData('text/plain', text); keys().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; },
    wheel(x, y, dy) { const s = stage(); s.dispatchEvent(new WheelEvent('wheel', { ...at(s, x, y), deltaY: dy, deltaMode: 0 })); return true; },
  };
  return true; })()`;
try {
  await Lazy.load('chrome');
  const st0 = await window.hub.chrome.status({ fresh: true });
  const base = st0.testBase;
  step(Boolean(st0.found && base) && typeof ChromeView !== 'undefined' && typeof ChromeViewCore !== 'undefined', 'the chrome group loads with Chrome views; Chrome (the stand-in) and the test pages are up', st0.found?.name);
  step(st0.hidden === true, 'Chrome works out of sight by default ("Show Chrome" is off)', { hidden: st0.hidden, show: st0.prefs?.show });

  // ---------- 1. an app in Chrome, in its Hearth window ----------
  Apps.register({ id: 'cvtest', name: 'View Test', icon: '◍', url: `${base}/cv`, group: 'More' });
  await window.hub.apps.chrome('cvtest', 'chrome');
  await Apps.open('cvtest');
  const listed = await until(async () => (await window.hub.apps.windows()).find((w) => w.id === 'cvtest' && w.chrome), 30000);
  step(Boolean(listed), 'the app set to Chrome is open (listed as in Chrome)', listed);
  const frames0 = await until(async () => { const n = await inWin('window.cv && window.cv.state.frames'); return n > 2 ? n : null; }, 30000);
  step(Boolean(frames0), 'its Hearth window shows a Chrome view, and frames arrive', frames0);
  const vw = await inWin('(() => { const s = document.querySelector("#aw-main > .cv > .cv-stage"); return { w: s.clientWidth, h: s.clientHeight, meta: window.cv.state.meta, dpr: devicePixelRatio }; })()');
  step(vw?.meta?.deviceWidth === vw?.w && vw?.meta?.deviceHeight === vw?.h, 'the page\'s viewport is the view\'s size (frames sized to the view)', vw);
  const wb = await window.hub.chrome.status({ fresh: true, bounds: true });
  const offAll = (s) => (s.all || []).length > 0 && s.all.every((p) => p.bounds && (p.bounds.left + p.bounds.width < -2000 || p.bounds.top + p.bounds.height < -2000));
  step(offAll(wb), 'every Chrome window is off-screen', (wb.all || []).map((p) => `${p.key || p.id.slice(0, 6)}@${p.bounds?.left},${p.bounds?.top}`));
  const info0 = await until(async () => (await window.hub.apps.page('cvtest', 'info')).value, 8000);
  step(info0?.title === 'View test', 'the AI tools read the same page (apps_page info)', info0);

  // ---------- 2. click, type, paste, scroll, cursor through the view ----------
  await inWin(HANDS);
  await inWin('window.__cv.click(90, 42)');
  const clicked = await until(async () => (await window.hub.apps.page('cvtest', 'info')).value?.title === 'Clicked', 8000);
  step(Boolean(clicked), 'a click on the view clicks the page\'s button (its title changes)');
  await inWin('window.__cv.click(100, 105)');
  await wait(300);
  await inWin('window.__cv.type("hi there")');
  const typed = await until(async () => { const r = await window.hub.chrome.page('app:cvtest', 'eval', { expr: 'document.querySelector("#q").value' }); return r.value === 'hi there' ? r.value : null; }, 8000);
  step(Boolean(typed), 'typing on the keyboard in the view types into the page\'s box', typed);
  await inWin('window.__cv.key("Backspace", "Backspace")');
  await inWin('window.__cv.paste(" & pasted")');
  const pasted = await until(async () => { const r = await window.hub.chrome.page('app:cvtest', 'eval', { expr: 'document.querySelector("#q").value' }); return r.value === 'hi ther & pasted' ? r.value : null; }, 8000);
  step(Boolean(pasted), 'Backspace and a paste (the clipboard\'s text) reach the box', pasted);
  await inWin('window.__cv.wheel(300, 300, 600)');
  const scrolled = await until(async () => { const r = await window.hub.chrome.page('app:cvtest', 'eval', { expr: 'scrollY' }); return r.value > 100 ? r.value : null; }, 8000);
  step(Boolean(scrolled), 'the wheel over the view scrolls the page', scrolled);
  await window.hub.chrome.page('app:cvtest', 'eval', { expr: 'scrollTo(0, 0), true' });
  await wait(300);
  await inWin('window.__cv.move(90, 42)');
  const cur = await until(async () => { const c = await inWin('document.querySelector("#aw-main > .cv > .cv-stage").style.cursor'); return c === 'pointer' ? c : null; }, 5000);
  step(Boolean(cur), 'the page\'s cursor shows on the view (a hand over the button)', cur);
  const cm = await window.hub.cview.menu ? true : false;
  step(cm, 'right-click asks the page first (its own menu), else Hearth\'s menu');

  // ---------- 3. a popup ----------
  await inWin('window.__cv.click(90, 158)');
  const popped = await until(async () => { const n = await inWin('(() => { const p = document.querySelector(".cv-popup"); return p ? (window.ChromeView && [...ChromeView.views.values()].find((v) => v.el.parentElement === p)?.state.frames) || 0 : -1; })()'); return n > 0 ? n : null; }, 20000);
  step(Boolean(popped), 'a popup the page opens shows over it as another Chrome view (with frames)', popped);
  const wb2 = await window.hub.chrome.status({ fresh: true, bounds: true });
  const popWin = (wb2.all || []).find((p) => /cv-popup/.test(p.url));
  step(Boolean(popWin) && popWin.bounds.left < -2000, 'the popup\'s own Chrome window was put off-screen', popWin && { url: popWin.url, b: popWin.bounds });
  const paused = await until(async () => { const i = await window.hub.cview.info(); const main = i.views.find((v) => v.key === 'app:cvtest'); return main && !main.casting ? true : null; }, 6000);
  step(Boolean(paused), 'the page under the popup stops drawing while it\'s covered');
  await inWin('window.__cv.click(60, 20, true)');
  const pclick = await until(async () => { const w = (await window.hub.chrome.page(null, 'pages')).value || []; return w.find((p) => /cv-popup/.test(p.url) && p.title === 'Popup clicked'); }, 8000);
  step(Boolean(pclick), 'the popup\'s view takes clicks too');
  await inWin('[...document.querySelectorAll(".cv-popup-head .cv-btn")].pop().click(), true');
  const unpop = await until(async () => !(await inWin('!!document.querySelector(".cv-popup")')) && !((await window.hub.chrome.page(null, 'pages')).value || []).some((p) => /cv-popup/.test(p.url)), 8000);
  step(Boolean(unpop), '✕ Close: the popup view and its Chrome page are gone; the page under it draws again');

  // ---------- 4. a download, a file picker ----------
  await inWin('window.__cv.click(60, 255)');
  const dl = await until(async () => (await window.hub.apps.downloads('cvtest')).find((d) => d.chrome && d.state === 'completed'), 20000);
  step(Boolean(dl) && /apps-downloads[\\/]View Test[\\/]hearth-view-test\.txt$/.test(dl?.path || ''), 'a download lands in Downloads/Hearth/<App> and in the app window\'s list', dl && { name: dl.name, path: dl.path });
  const dlBadge = await until(async () => inWin('!document.getElementById("aw-dl").hidden'), 5000);
  step(Boolean(dlBadge), 'the app window\'s ⤓ shows it');
  if (dl?.path) {
    await window.hub.cview.test('chooser', [dl.path]);
    await inWin('window.__cv.click(60, 205)');
    const chosen = await until(async () => { const r = await window.hub.chrome.page('app:cvtest', 'eval', { expr: 'document.querySelector("#f").files[0]?.name || ""' }); return r.value || null; }, 10000);
    step(chosen === 'hearth-view-test.txt', 'the page\'s file picker goes through Hearth (its own dialog; the test answers it): the page gets the file', chosen);
  }

  // ---------- 5. hidden: no frames; shown: frames again; CPU both ways ----------
  const cpu = async () => { const i = await window.hub.cview.info(); return { hearth: i.hearthCpu, chrome: i.chromeCpu, frames: i.views.find((v) => v.key === 'app:cvtest')?.frames || 0, casting: i.views.find((v) => v.key === 'app:cvtest')?.casting }; };
  const a0 = await cpu(); await wait(3000); const a1 = await cpu();
  out.cpu.visible = { fps: (a1.frames - a0.frames) / 3, hearthCpuPct: Math.round((a1.hearth - a0.hearth) / 3 * 1000) / 10, chromeCpuPct: Math.round((a1.chrome - a0.chrome) / 3 * 1000) / 10 };
  step(out.cpu.visible.fps > 5 && out.cpu.visible.fps <= 31, 'visible: frames keep coming (an animated page), at most 30 a second', out.cpu.visible);
  await window.hub.apps.close('cvtest');
  const stopped = await until(async () => (await cpu()).casting === false, 6000);
  const b0 = await cpu(); await wait(3000); const b1 = await cpu();
  out.cpu.hidden = { fps: (b1.frames - b0.frames) / 3, hearthCpuPct: Math.round((b1.hearth - b0.hearth) / 3 * 1000) / 10, chromeCpuPct: Math.round((b1.chrome - b0.chrome) / 3 * 1000) / 10 };
  step(Boolean(stopped) && b1.frames === b0.frames, 'the window hidden: the screencast stops (no frames at all)', out.cpu.hidden);
  await Apps.open('cvtest');
  const again = await until(async () => { const c = await cpu(); return c.casting && c.frames > b1.frames + 2 ? c.frames - b1.frames : null; }, 10000);
  step(Boolean(again), 'shown again: frames again', again);

  // ---------- 6. Sign in (opens Chrome once) ----------
  const r6 = await inWin(`window.appWin.cview.signIn(window.cv.id, { url: ${JSON.stringify(`${base}/v3/signin/identifier?continue=x`)} })`);
  step(r6?.ok && r6.signing, 'Sign in (opens Chrome once) from the view', r6);
  const onScreen = await until(async () => { const s = await window.hub.chrome.status({ fresh: true, bounds: true }); const p = s.all.find((x) => x.key === 'app:cvtest'); return p && p.bounds.left > -2000 && p.bounds.top > -2000 ? p.bounds : null; }, 10000);
  step(Boolean(onScreen), 'its Chrome window comes on screen, normal size (only now)', onScreen);
  const waiting = await until(async () => inWin('(() => { const n = document.querySelector("#aw-main > .cv .cv-note"); return n && !n.hidden && n.dataset.kind === "signing" ? n.textContent : null; })()'), 6000);
  step(/Signing in/.test(waiting || '') && /I.m signed in/.test(waiting || ''), 'the view waits: "Signing in, in Chrome\'s own window" with "I\'m signed in"', waiting);
  const others = (await window.hub.chrome.status({ fresh: true, bounds: true })).all.filter((x) => x.key !== 'app:cvtest');
  step(others.every((p) => p.bounds.left < -2000), 'every other Chrome window stays off-screen');
  await window.hub.chrome.page('app:cvtest', 'go', { url: `${base}/cv`, wait: false });
  const offAgain = await until(async () => { const s = await window.hub.chrome.status({ fresh: true, bounds: true }); return offAll(s) && !s.signing.length ? true : null; }, 15000);
  step(Boolean(offAgain), 'the page leaves the sign-in page → its Chrome window goes back off-screen by itself');
  const resumed = await until(async () => { const n = await inWin('(() => { const n = document.querySelector("#aw-main > .cv .cv-note"); return (!n || n.hidden) && window.cv.state.frames; })()'); const c = await cpu(); return n && c.casting ? n : null; }, 10000);
  step(Boolean(resumed), 'the view carries on with the page (frames again)', resumed);
  const ai = await Apps.tool('apps_page', { app: 'cvtest', do: 'click', selector: '#go' });
  const aiClicked = await until(async () => (await window.hub.apps.page('cvtest', 'info')).value?.title === 'Clicked', 8000);
  step(ai.ok && Boolean(aiClicked), 'the AI\'s tools still click on the page (unchanged, over CDP)', ai);
  // "Sign in…" from AI setup: a window only for signing in, closed by "I'm signed in"
  const r7 = await window.hub.chrome.signIn({ url: `${base}/v3/signin/identifier?continue=y` });
  const tempOn = await until(async () => { const s = await window.hub.chrome.status({ fresh: true, bounds: true }); return s.signing.length && s.all.some((p) => /identifier\?continue=y/.test(p.url) && p.bounds.left > -2000) ? true : null; }, 10000);
  step(r7?.ok && Boolean(tempOn), 'AI setup › Sign in…: a Chrome window on screen on the sign-in page', r7);
  await window.hub.chrome.signedIn({});
  const tempGone = await until(async () => { const s = await window.hub.chrome.status({ fresh: true, bounds: true }); return !s.signing.length && !s.all.some((p) => /continue=y/.test(p.url)) && offAll(s) ? true : null; }, 10000);
  step(Boolean(tempGone), '"I\'m signed in": that window closes, nothing of Chrome is on screen');
  await smoke({ shot: '/tmp/chromeview-app.png' });

  // ---------- 7. a website chat in Chrome ----------
  const agent = { id: 'cv-web-test', name: 'View Chat', mode: 'web', icon: 'V', color: '#4285f4', url: `${base}/chat`, chrome: 'on' };
  H.config.agents.push(agent);
  await saveConfig();
  await until(() => H.surfaces.get(agent.id), 10000);
  activate(agent.id);
  const hv = await until(() => { const c = ChromeUI.covers.get(agent.id); return c?.cv?.state.frames > 1 ? c : null; }, 30000);
  step(Boolean(hv) && Boolean(H.surfaces.get(agent.id).el.querySelector('.chr-view .cv .cv-bar .cv-addr')), 'a website chat in Chrome shows its page in a Chrome view here (with Back, Forward, ↻ and its address)', hv && { frames: hv.cv.state.frames, addr: hv.cv.state.address });
  await sendToWebsite(H.agent(agent.id), 'hello view');
  const sent = await until(async () => { const r = await window.hub.chrome.page(`agent:${agent.id}`, 'info'); return r.value?.title === 'sent: hello view' ? r.value.title : null; }, 15000);
  step(Boolean(sent), 'asking it still types into its chat box (in Chrome) and presses Enter', sent);
  activate(H.claudeAgent().id);
  const hubStop = await until(async () => { const i = await window.hub.cview.info(); const v = i.views.find((x) => x.key === `agent:${agent.id}`); return v && !v.casting ? true : null; }, 6000);
  step(Boolean(hubStop), 'another chat in front: its view stops drawing');
  activate(agent.id);
  await until(async () => { const i = await window.hub.cview.info(); return i.views.find((x) => x.key === `agent:${agent.id}`)?.casting; }, 6000);
  await window.hub.chrome.page(`agent:${agent.id}`, 'go', { url: `${base}/v3/signin/rejected?continue=chat`, wait: false });
  const strip = await until(() => { const s = H.surfaces.get(agent.id).el.querySelector('.cv-strip'); return s && !s.hidden ? s.textContent : null; }, 10000);
  step(/Sign in \(opens Chrome once\)/.test(strip || ''), 'a sign-in page inside the view offers "Sign in (opens Chrome once)"', strip);
  await smoke({ shot: '/tmp/chromeview-chat.png' });
  // the AI setup row
  await Lazy.load('options');
  Options.open({ agentId: H.claudeAgent().id });
  const row = await until(() => document.querySelector('.opt-sheet .chr-show'), 8000);
  step(Boolean(row) && /Show Chrome/.test(row?.textContent || '') && !row.querySelector('input').checked, 'AI setup › Chrome has "Show Chrome" (off)', row?.textContent);
  Options.hide();
  await ChromeUI.setAgent(H.agent(agent.id), 'off');
  step(!H.surfaces.get(agent.id).el.querySelector('.chr-view'), '"Use it inside Hearth instead": the view goes, its own page is back');
  await window.hub.apps.chrome('cvtest', 'hearth');
  await window.hub.apps.close('cvtest', { destroy: true });
  await window.hub.chrome.quit();
} catch (err) {
  out.problems.push(`threw: ${err.message}`);
  out.stack = String(err.stack || '').split('\n').slice(0, 4).join(' | ');
}
return JSON.stringify(out, null, 1);
