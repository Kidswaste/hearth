// (round 136, phone136) 📱 See it on my phone: the phone's side (phoneview-page.html). No framework, no storage.
//   render  the video, full screen, looping (starts muted so it can start by itself: 🔇 Sound turns it on)
//   live    the Lab's preview as a stream of JPEGs (one long response the <img> keeps showing), with
//           "live from Hearth · 1080×1920"; the song plays on the computer
// Every request carries this page's token (it's in the address) and a random id so the computer can count phones.
(() => {
  const $ = (id) => document.getElementById(id);
  const cid = Math.random().toString(36).slice(2, 12);
  const q = `?c=${cid}`;
  const stage = $('stage'); const what = $('what'); const note = $('note'); const bar = $('bar');
  const P = (window.__phone = { mode: null, ok: false, stopped: false, frames: 0, playing: false, info: null });
  const say = (t) => { note.textContent = t || ''; note.hidden = !t; };
  let media = null; let misses = 0;

  function ended(text) {
    if (P.stopped) return;
    P.stopped = true;
    if (media?.tagName === 'IMG') media.removeAttribute('src');
    if (media?.tagName === 'VIDEO') media.pause();
    say(text || 'Stopped on the computer. Scan the new code to watch again.');
    bar.classList.remove('hide');
  }
  async function ping() {
    if (P.stopped) return;
    try {
      const r = await fetch(`ping${q}`, { cache: 'no-store' });
      if (r.status === 403 || r.status === 410) { ended(); return; }
      misses = 0;
    } catch { misses += 1; if (misses >= 3) ended('The computer can\'t be reached (same Wi-Fi?). It may have stopped.'); else setTimeout(ping, 1500); } // (a Wi-Fi hiccup gets two quick retries)
  }

  function render(info) {
    const v = document.createElement('video');
    v.src = `video${q}`; v.loop = true; v.muted = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    v.addEventListener('playing', () => { P.playing = true; say(''); });
    v.addEventListener('error', () => { if (!P.stopped) say('This video doesn\'t play on this phone (try an MP4 render).'); });
    stage.append(v); media = v;
    v.play().catch(() => say('Tap to play'));
    const sound = $('sound'); sound.hidden = false;
    sound.onclick = () => { v.muted = !v.muted; sound.textContent = v.muted ? '🔇 Sound' : '🔊 Sound'; v.play().catch(() => {}); };
    stage.onclick = () => { if (v.paused) v.play().catch(() => {}); };
    what.textContent = info.title || 'Hearth';
  }
  function live(info) {
    const img = document.createElement('img');
    img.alt = 'Live from Hearth';
    img.addEventListener('load', () => { P.frames += 1; if (P.frames === 1) say(''); });
    img.addEventListener('error', () => { if (!P.stopped) ping(); });
    img.src = `live${q}`;
    stage.append(img); media = img;
    const paint = (i) => { what.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot', textContent: '● ' }), document.createTextNode(`live from Hearth${i.label ? ` · ${i.label}` : ''}`)); };
    paint(info);
    say('Waiting for the first picture…');
    setInterval(async () => { if (P.stopped) return; try { const i = await (await fetch(`info${q}`, { cache: 'no-store' })).json(); P.info = i; paint(i); } catch { /* the ping says */ } }, 4000);
  }

  $('full').onclick = () => {
    const v = media;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
    else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };
  // the bar fades after a moment; a tap brings it back
  let hideT = 0;
  const showBar = () => { bar.classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => { if (!P.stopped) bar.classList.add('hide'); }, 3500); };
  addEventListener('pointerdown', showBar); showBar();

  (async () => {
    try {
      const r = await fetch(`info${q}`, { cache: 'no-store' });
      if (!r.ok) { ended('This link has ended. Scan the new code on the computer.'); return; }
      const info = await r.json(); P.info = info; P.mode = info.mode; P.ok = true;
      document.title = info.mode === 'live' ? 'Live from Hearth' : `${info.title} · Hearth`;
      if (info.mode === 'live') live(info); else render(info);
      setInterval(ping, 5000);
    } catch { ended('The computer can\'t be reached (same Wi-Fi?).'); }
  })();
})();
