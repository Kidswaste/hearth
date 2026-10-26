// Credits (round 67, credits67) in the app: the group loads, the Lab toolbar has a "Credits" button, the log is read,
// the panel shows plain lines with Copy and "How it was made",
// and Escape closes it. (The video itself needs ffmpeg and a drawing GPU: not part of this check.)
//   node dev/smoke.js --script dev/checks/credits.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await Lazy.load('credits');
  step(typeof Credits !== 'undefined' && typeof CreditsCore !== 'undefined', 'the credits group loads');
  activate('tool:three');
  await until(() => window.ThreeLab?.scenes?.currentId?.() && window.ThreeHistory);
  const btn = await until(() => document.querySelector('.three-toolbar .cr-open'));
  step(Boolean(btn) && btn.textContent === 'Credits', 'the Lab toolbar has a visible "Credits" button');
  const id = ThreeLab.scenes.currentId();
  await Credits.ready();
  step(Credits.log() && !Credits.unreadable(), 'the log was read');
  btn.click();
  const card = await until(() => document.querySelector('.cr-card'));
  step(Boolean(card), 'the panel opens');
  step(/Visual code/.test(card?.textContent || '') && /Sound/.test(card?.textContent || ''), 'plain lines: Visual code, Sound', (card?.textContent || '').slice(0, 300));
  step([...(card?.querySelectorAll('button') || [])].some((b) => b.textContent === 'Copy'), 'a Copy button');
  step([...(card?.querySelectorAll('button') || [])].some((b) => b.textContent === 'Make the video'), '"How it was made": Make the video');
  card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(100);
  step(!document.querySelector('.cr-card'), 'Escape closes it');
} catch (err) { out.problems.push(`threw: ${err.message}`); }
return out;
