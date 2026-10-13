// 📮 Ready to post (round 27, publishkit*.js, publish-hooks.js, publishmain.js), driven like the owner: a tiny 9:16
// video is made with ffmpeg through the render queue (detail in the bottom band, a quiet sine), its done note's
// "📮 Post" opens the kit (loaded on first use), which guesses Shorts, measures it (ffmpeg: loudness, frames), flags
// the detail under the app's buttons (red zone), offers cover ideas, plain words without tokens; TikTok chip; the
// scrub picks the cover and words go on it; ✍ asks the chat's AI (fake engine) for the words; Copy all; 📁 Make the
// post folder (video, cover at 1080×1920, post.txt); a fix (loudness to -14 LUFS) runs in the queue and the kit
// checks the new copy; the renders list's 📮; /post; the ◎ mission "Get it ready to post" (words written at once).
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/publishkit.js --shot /tmp/publishkit.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const shot = async (name) => { try { await smoke({ shot: `/tmp/hearth-checks/publishkit-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const dlg = () => document.querySelector('dialog.pk-dialog[open]');
const K = () => window.PublishKit?.current;
try {
  activate(C.id); await wait(200);
  await window.Lazy?.load?.('renders');
  ok(window.PublishHooks && typeof PublishHooks.open === 'function', 'PublishHooks loads with the render queue');
  ok(!window.Lazy?.loaded?.('publishkit'), 'the kit itself waits for its first use');
  ok(Commands.get('post'), '/post is there before the kit loads (stand-in)');
  ok(Missions.shown(C.id).some((m) => m.id === 'post' && /ready to post/i.test(m.label)), 'the ◎ mission "Get it ready to post"');

  // ---- 1. a finished render: a tiny 9:16 video made through the queue ----
  const DIR = `${window.SMOKE_SAVES}/pk`;
  const SRC = `${DIR}/neon_vertical.mp4`;
  const id = `pkmake${Date.now().toString(36)}`;
  await Renders.transcode({ id, input: '', output: SRC, duration: 4, args: ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x284060:s=540x960:r=30:d=4', '-f', 'lavfi', '-i', 'testsrc2=size=440x110:rate=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-filter_complex', '[0][1]overlay=x=20:y=810:shortest=1,format=yuv420p[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', 'OUTPUT'] }, undefined, { title: 'Neon test' });
  const made = await Renders.whenDone(id);
  ok(made.code === 0, `the test video was made (${made.error || ''})`);
  await until(() => [...document.querySelectorAll('#toasts .toast button')].some((b) => /📮/.test(b.textContent)), 5000);
  const postBtn = [...document.querySelectorAll('#toasts .toast button')].find((b) => /📮/.test(b.textContent));
  ok(postBtn, 'the done note has "📮 Post"');
  out.toastButtons = postBtn ? [...postBtn.parentElement.querySelectorAll('button')].map((b) => b.textContent) : [];

  // ---- 2. the kit opens and measures ----
  if (postBtn) postBtn.click(); else await PublishHooks.open(SRC);
  await until(() => K()?.res || K()?.error, 40000);
  ok(window.Lazy?.loaded?.('publishkit') && dlg(), 'the kit opened (loaded on first use)');
  const st = K();
  ok(st && !st.error, `measured without error (${st?.error || ''})`);
  ok(st?.platform === 'shorts', `9:16 → YouTube Shorts (${st?.platform})`);
  out.checks = st?.checks?.map((c) => `${c.level}:${c.id}`);
  ok(st?.checks.some((c) => c.id === 'under-bottom' && c.level === 'warn'), `detail under the bottom band is flagged (${out.checks})`);
  ok(st?.checks.some((c) => c.id === 'pixels' && c.level === 'warn'), 'only 540 px wide: a softness warning');
  ok(st?.checks.some((c) => c.id === 'loud'), 'loudness measured');
  ok(document.querySelector('.pk-zone.hit'), 'the bottom zone shows red on the video');
  ok(/Almost|fix/i.test(document.querySelector('.pk-verdict')?.textContent || ''), `a verdict (${document.querySelector('.pk-verdict')?.textContent})`);
  await until(() => [...document.querySelectorAll('.pk-thumb img')].filter((i) => i.naturalWidth > 0).length >= 3, 6000);
  out.thumbs = document.querySelectorAll('.pk-thumb').length;
  ok([...document.querySelectorAll('.pk-thumb img')].filter((i) => i.naturalWidth > 0).length >= 3, `cover ideas as pictures (${out.thumbs})`);
  ok(document.querySelector('.pk-title')?.value.length > 3, `plain words already there, no tokens (${document.querySelector('.pk-title')?.value})`);
  await shot('open');

  // ---- 3. TikTok, the cover, the words ----
  document.querySelector('.pk-plat[data-plat="tiktok"]').click(); await wait(150);
  ok(K().platform === 'tiktok' && /TikTok/.test(document.querySelector('.pk-verdict')?.textContent), 'TikTok chosen: checks for TikTok');
  ok([...document.querySelectorAll('.pk-zone span')].some((s) => /For You/.test(s.textContent)), 'TikTok\'s own zones');
  document.querySelectorAll('.pk-thumb')[1]?.click();
  await until(() => Math.abs(K().coverT - Number(document.querySelectorAll('.pk-thumb')[1].dataset.t)) < 0.1, 4000);
  ok(Math.abs(K().coverT - Number(document.querySelectorAll('.pk-thumb')[1]?.dataset.t)) < 0.1, 'a cover idea seeks the video there');
  const scrub = document.querySelector('.pk-scrub'); scrub.value = '2.5'; scrub.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => Math.abs(K().coverT - 2.5) < 0.05, 4000);
  ok(Math.abs(K().coverT - 2.5) < 0.05, `the scrub picks the cover frame (${K().coverT})`);
  const words = document.querySelector('.pk-cover-words'); words.value = 'Neon Drift'; words.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
  const pv = document.querySelector('.pk-cover-prev'); const px = pv.getContext('2d').getImageData(0, 0, pv.width, pv.height).data;
  let white = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) white += 1;
  ok(white > 20, `the words are drawn on the cover preview (${white} white pixels)`);
  document.querySelector('.pk-write').click();
  await until(() => /Ember Tide/.test(document.querySelector('.pk-title')?.value), 30000);
  ok(/Ember Tide/.test(document.querySelector('.pk-title')?.value), `✍ the chat's AI wrote the title (${document.querySelector('.pk-title')?.value})`);
  ok(/#threejs/.test(document.querySelector('.pk-tags')?.value) && /Written by/.test(document.querySelector('.pk-by')?.textContent), 'its hashtags, and who wrote it');
  [...document.querySelectorAll('.pk-wrow button')].find((b) => b.textContent === 'Copy all').click(); await wait(200);
  out.clip = await navigator.clipboard.readText().catch(() => null);
  ok(out.clip == null || (/Ember Tide/.test(out.clip) && /#threejs/.test(out.clip)), 'Copy all: the caption with its hashtags');

  // ---- 4. the post folder ----
  document.querySelector('.pk-foot .primary').click();
  await until(() => K()?.dir, 15000);
  const d = K()?.dir;
  ok(d && /posts/.test(d.folder) && /\(TikTok\)$/.test(d.folder), `a post folder (${d?.folder})`);
  if (d) {
    ok((await window.hub.fs.stat(d.video))?.size > 1000, 'the video is in it');
    const txt = await window.hub.fs.read(d.text);
    ok(/CAPTION\nEmber Tide/.test(txt) && /never uploads/.test(txt) && /CHECKS/.test(txt), 'post.txt: the caption, the checks, never uploads');
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `file://${d.cover}?${Date.now()}`; });
    ok(img && img.naturalWidth === 1080 && img.naturalHeight === 1920, `the cover at 1080×1920 (${img?.naturalWidth}×${img?.naturalHeight})`);
    ok(!document.querySelectorAll('.pk-foot button')[0].disabled, 'Show in folder is on');
  }
  await shot('folder');

  // ---- 5. a fix through the queue, then the kit checks the new copy ----
  const loudFix = [...document.querySelectorAll('.pk-chk')].find((r) => r.dataset.check === 'loud')?.querySelector('.pk-fix');
  out.loud = st.res?.loud;
  if (ok(loudFix, `a loudness fix is offered (${JSON.stringify(out.loud)})`)) {
    loudFix.click();
    await until(() => /LUFS\)\.mp4$/.test(K()?.file || '') && K()?.res, 40000);
    ok(/\(-14 LUFS\)\.mp4$/.test(K()?.file || ''), `the kit moved to the fixed copy (${K()?.file})`);
    ok(K()?.checks?.find((c) => c.id === 'loud')?.level === 'ok', `the fixed copy's loudness passes (${JSON.stringify(K()?.res?.loud)})`);
    ok(K()?.platform === 'tiktok' && /Ember Tide/.test(document.querySelector('.pk-title')?.value), 'the platform and the words stay');
  }

  // ---- 6. close; the renders list's 📮; /post; the mission ----
  dlg()?.close(); await until(() => !dlg() && !K(), 3000);
  ok(!dlg() && !K(), 'closed');
  Renders.open(); await wait(150);
  ok([...document.querySelectorAll('.rq-pop .rq-q')].some((b) => b.textContent === '📮'), 'the renders list has 📮 on finished videos');
  Renders.close();
  const said = await say(`/post ${SRC} reels`);
  out.said = said.slice(0, 300);
  ok(/Instagram Reels/.test(said) && K()?.platform === 'reels', '/post <file> reels: the summary in chat and the kit open');
  dlg()?.close(); await wait(100);
  const v = Native.view(C.id);
  Missions.set(C.id, 'post');
  const ta = v.root.querySelector('textarea'); ta.value = 'get it ready for youtube please'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  v.root.querySelector('form.composer').requestSubmit();
  await until(() => K()?.res && /Ember Tide/.test(document.querySelector('.pk-title')?.value || ''), 30000);
  ok(K()?.platform === 'youtube', `the mission: platform from the words (${K()?.platform})`);
  ok(/Ember Tide/.test(document.querySelector('.pk-title')?.value || ''), 'the mission: the words written at once');
  ok(K()?.checks?.some((c) => c.id === 'shape' && c.level === 'warn' && c.fix?.preset === 'yt1080'), 'a 9:16 video for YouTube: "make a 16:9 copy"');
  await shot('mission');
  dlg()?.close();
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: fail.length === 0, problems: fail, ...out }, null, 1);
