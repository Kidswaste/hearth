// (round 174, audit174) the round's two fixes (docs/upgrades/audit174.md), ONE check. Its own temp data folder and
// profile (smoke.js), the fake engines; never an owner's data.
//   wait     smoke.js' wait for the lazy groups answers again: this part starts well before its 30 s limit (since
//            round 94 it never saw "ready" and every check part waited the full 30 s after --wait), and a group that
//            follows an on-use group nothing loads (appdialogs after lookpicker) doesn't hold it
//   graphics Settings › Advanced › Graphics measures the screen's pace once: the first Settings open asks ~40 frames
//            for it, a second open asks none and shows the same "· N fps" line (round 173: ~43 frames every open)
//   node dev/run-checks.js --exact audit174
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};

// ---------- wait ----------
out.startedAtMs = Math.round(performance.now());
ok(out.startedAtMs < 26000, `the check starts once the groups are in, not after smoke's 30 s limit (${out.startedAtMs} ms after the page loaded)`);
const st = Lazy.state();
out.appdialogs = st.find((g) => g.name === 'appdialogs')?.state;
ok(st.every((g) => g.tier === 'use' || (g.state !== 'stub' && g.state !== 'loading')), `every group that loads by itself is in (${st.filter((g) => g.tier !== 'use' && g.state !== 'loaded').map((g) => `${g.name}:${g.state}`).join(', ')})`);

// ---------- graphics ----------
activate(H.claudeAgent().id); await wait(800);
const key = async () => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } }); };
let fromGpu = 0;
const oraf = window.requestAnimationFrame;
window.requestAnimationFrame = function (fn) { if (/gpu52\.js/.test(String(new Error().stack))) fromGpu += 1; return oraf.call(window, fn); };
const opens = [];
try {
  for (let i = 0; i < 2; i++) {
    fromGpu = 0;
    await AppUI.openSettings(); await wait(2200);
    const line = document.querySelector('.gpu52-line')?.textContent || '';
    opens.push({ frames: fromGpu, line });
    await key(); await wait(800);
  }
} finally { window.requestAnimationFrame = oraf; }
out.opens = opens;
ok(opens[0]?.frames >= 30, `the first Settings open measures the screen's pace (${opens[0]?.frames} frames asked)`);
ok(opens[1]?.frames === 0, `a second open asks no frames for it (${opens[1]?.frames})`);
ok(/\d+ fps/.test(opens[1]?.line || '') && opens[1]?.line === opens[0]?.line, `and shows the same line ("${opens[0]?.line}" → "${opens[1]?.line}")`);

if (problems.length) throw new Error(`${problems.length} problem(s): ${problems.join(' · ')} · ${JSON.stringify(out)}`);
return JSON.stringify(out);
