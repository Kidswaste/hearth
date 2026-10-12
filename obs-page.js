// Hearth → OBS Browser Source page (round 25, interop): one WebSocket to the computer it came from (127.0.0.1),
// WebP frames with alpha drawn on a transparent canvas (WebGL; a 2D canvas when WebGL is missing). Keys:
//   alpha   the Lab's own transparency (layers with no background stay see-through)
//   luma    dark becomes transparent (for scenes with a black background; lo / hi = the soft edge)
//   none    opaque, as on screen
// Fit: contain (letterboxed, transparent bars), cover, stretch. The page only draws when a frame arrives (no loop),
// says nothing back but pings, and reconnects by itself when Hearth turns the output back on.
(() => {
  const cv = document.getElementById('out'); const note = document.getElementById('note');
  const S = { frames: 0, drawn: 0, connected: false, cfg: { key: 'alpha', fit: 'contain', lo: 0.04, hi: 0.18 }, last: null, size: [0, 0] };
  window.__obs = S;
  let gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  let g2 = null; let prog = null; let tex = null; let U = {};
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; uniform vec4 box; varying vec2 uv; void main() { uv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(box.xy + p * box.zw, 0.0, 1.0); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 uv; uniform sampler2D t; uniform int key; uniform vec2 edge;
      void main() { vec4 c = texture2D(t, uv); float a = c.a;
        if (key == 1) a *= smoothstep(edge.x, max(edge.y, edge.x + 0.001), dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
        if (key == 2) a = 1.0;
        gl_FragColor = vec4(c.rgb * a, a); }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) gl = null;
  }
  if (gl) {
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    U = { box: gl.getUniformLocation(prog, 'box'), key: gl.getUniformLocation(prog, 'key'), edge: gl.getUniformLocation(prog, 'edge') };
  } else g2 = cv.getContext('2d');

  // where the picture sits in the canvas (clip space: x, y of the bottom-left corner, width, height)
  function box(w, h) {
    const W = cv.width; const H = cv.height; const f = S.cfg.fit;
    if (f === 'stretch' || !w || !h) return [0, 0, W, H];
    const k = f === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
    const bw = w * k; const bh = h * k;
    return [(W - bw) / 2, (H - bh) / 2, bw, bh];
  }
  function draw() {
    const bm = S.last; if (!bm) return;
    const dpr = devicePixelRatio || 1; const W = Math.round(innerWidth * dpr); const H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const [x, y, w, h] = box(bm.width, bm.height);
    if (gl) {
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bm);
      gl.uniform4f(U.box, (x / W) * 2 - 1, (y / H) * 2 - 1, (w / W) * 2, (h / H) * 2);
      gl.uniform1i(U.key, S.cfg.key === 'luma' ? 1 : S.cfg.key === 'none' ? 2 : 0);
      gl.uniform2f(U.edge, S.cfg.lo, S.cfg.hi);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      g2.clearRect(0, 0, W, H);
      if (S.cfg.key === 'none') { g2.fillStyle = '#000'; g2.fillRect(x, y, w, h); }
      g2.drawImage(bm, x, y, w, h);
    }
    S.drawn += 1; S.size = [bm.width, bm.height];
  }
  // (the check reads the picture: the alpha at a grid of points)
  S.sample = () => {
    draw();
    const W = cv.width; const H = cv.height; const pts = [];
    for (let j = 1; j < 8; j += 1) for (let i = 1; i < 8; i += 1) pts.push([Math.floor((W * i) / 8), Math.floor((H * j) / 8)]);
    pts.push([1, 1], [W - 2, H - 2]);
    const px = new Uint8Array(4);
    const alphas = pts.map(([x, y]) => { if (gl) { gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[3]; } return g2.getImageData(x, y, 1, 1).data[3]; });
    return { min: Math.min(...alphas), max: Math.max(...alphas), clear: alphas.filter((a) => a === 0).length, solid: alphas.filter((a) => a > 200).length, n: alphas.length, gl: Boolean(gl), size: S.size, canvas: [W, H] };
  };

  let pending = null; let raf = 0; let decoding = false;
  async function onFrame(blob) {
    S.frames += 1;
    if (decoding) { pending = blob; return; } // a slow decode: keep only the newest
    decoding = true;
    try {
      let b = blob;
      while (b) {
        pending = null;
        // eslint-disable-next-line no-await-in-loop
        const bm = await createImageBitmap(b, { premultiplyAlpha: 'none' }).catch(() => null);
        if (bm) { S.last?.close?.(); S.last = bm; if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
        b = pending;
      }
    } finally { decoding = false; }
  }
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });

  let ws = null; let ping = 0;
  function connect() {
    ws = new WebSocket(`ws://${location.host}/`);
    ws.binaryType = 'blob';
    ws.onopen = () => { S.connected = true; note.hidden = true; clearInterval(ping); ping = setInterval(() => { try { ws.send('p'); } catch { /* closed */ } }, 20000); };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') { onFrame(e.data); return; }
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'cfg') { S.cfg = { ...S.cfg, ...m }; draw(); }
    };
    ws.onclose = () => {
      S.connected = false; clearInterval(ping);
      // gone: clear the picture (OBS shows what's under it) and try again
      if (S.last) { S.last.close?.(); S.last = null; if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } else g2.clearRect(0, 0, cv.width, cv.height); }
      setTimeout(connect, 1500);
    };
  }
  // (a plain browser tab, never inside OBS where it would be streamed: a short hint after a moment with no picture)
  setTimeout(() => { if (!S.frames && !/\bOBS\//.test(navigator.userAgent) && !window.obsstudio) { note.textContent = 'Hearth · waiting for the Lab (turn the OBS output on with /obs output on, keep the Lab or the Stage window open)'; note.hidden = false; } }, 4000);
  connect();
})();
