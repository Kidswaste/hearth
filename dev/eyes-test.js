#!/usr/bin/env node
// Board eyes, Node side (round 14): the board MCP server hands pictures to the engines as MCP image content (a fake hub
// answers board_look / board_watch like the page does), the tools stay lean and small-by-default, the Pinterest
// searches made from a vibe / an aesthetic, the Pinterest window's address rules (only Pinterest or a local test page,
// pins checked before they reach the board), and the vibe text carrying a caption and a credit.
//   node dev/eyes-test.js
const fs = require('fs');
const http = require('http');
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  // ---------- the tools ----------
  const def = require(path.join(root, 'mcp', 'board-mcp.js'));
  // (round 41, toolslim) board_watch is a board_do op now (the hub still gets board_watch); its whole words are in def.all
  const look = def.tools.find((t) => t.name === 'board_look'); const watch = def.all.find((t) => t.name === 'board_watch');
  check(look && watch && /watch \{item/.test(def.tools.find((t) => t.name === 'board_do').description), 'board_look is a tool, board_do watch reaches board_watch');
  // (round 35, bugbash2) since round 31 (tokensaver) the words are shorter: "size small|medium|large", small when left out
  check(/size small\|medium\|large/.test(look.description) && look.inputSchema.properties.size.enum.join() === 'small,medium,large', 'small by default, the model asks for more');
  check(JSON.stringify(look).length < 700 && JSON.stringify(watch).length < 700, `lean definitions (${JSON.stringify(look).length} + ${JSON.stringify(watch).length} chars)`);
  // (round 31, tokensaver) board_do's ops are named in its description (no enum)
  check(/\bfind\b.*\bcaption\b.*\bpinterest\b/.test(def.tools.find((t) => t.name === 'board_do').description), 'board_do has find / caption / pinterest');
  check(/source/.test(def.tools.find((t) => t.name === 'board_add').description), 'board_add takes a source and a credit');
  check(/name items by id/.test(def.guide), 'the guide line says to name items by id');

  // ---------- pictures travel as MCP image content ----------
  const infoPath = path.join(root, 'data', 'game-bridge.json');
  const hadInfo = fs.existsSync(infoPath) ? fs.readFileSync(infoPath, 'utf8') : null;
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { tool, args } = JSON.parse(body); calls.push({ tool, args });
      if (tool === 'board_look') res.end(JSON.stringify({ ok: true, value: { board: '"Refs" (3 items)', sent: '1 picture 512×384 ≈ 262 tokens' }, images: [{ data: PNG, mime: 'image/png' }], eyes: { board: 'b1', items: [] } }));
      else if (tool === 'board_watch' && args.item !== 'nope') res.end(JSON.stringify({ ok: true, value: { frames: '#1 0:00.00 f0 · #2 0:01.20 f30', sent: '2 pictures 512×288 ≈ 394 tokens' }, images: [{ data: PNG, mime: 'image/jpeg' }, { data: PNG, mime: 'image/jpeg' }] }));
      else res.end(JSON.stringify({ ok: false, error: `No clip "${args.item}"` }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  fs.writeFileSync(infoPath, JSON.stringify({ port: server.address().port, token: 'tok', pid: process.pid }));
  try {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', 'board-mcp.js')], env: { HUB_CHAT_ID: 'chat-9' } });
    const r = await c.call('board_look', { item: 'i3' });
    const img = r.content.filter((x) => x.type === 'image');
    check(!r.isError && img.length === 1 && img[0].data === PNG && img[0].mimeType === 'image/png', 'board_look: the picture is an MCP image');
    check(/sent: 1 picture 512×384 ≈ 262 tokens/.test(r.content.at(-1).text), 'the text says what was sent');
    check(!/eyes/.test(r.content.at(-1).text), 'the chat card record stays in the hub (not sent to the model)');
    const w = await c.call('board_watch', { item: 'i4', count: 2 });
    check(w.content.filter((x) => x.type === 'image').length === 2 && /f30/.test(w.content.at(-1).text), 'board_watch: frames as images with timestamps');
    const e = await c.call('board_watch', { item: 'nope' });
    check(e.isError && /No clip/.test(e.content[0].text), 'errors come back as tool errors');
    check(calls.every((x) => x.args.hubChatId === 'chat-9'), 'the chat id rides along (the card lands in the right chat)');
    c.close();
  } finally {
    server.close();
    if (hadInfo != null) fs.writeFileSync(infoPath, hadInfo); else fs.rmSync(infoPath, { force: true });
  }

  // ---------- Pinterest searches ----------
  const P = require(path.join(root, 'board-pins.js'));
  const neon = { byKind: { picture: 3, clip: 1 }, palette: [{ hex: '#0b0f1a', share: 0.5 }, { hex: '#ff2e88', share: 0.2 }, { hex: '#2de2e6', share: 0.1 }], light: 0.25, warmth: -0.2, contrast: 0.7, sat: 0.65, grain: 0.5, edges: 0.3, moods: ['nocturnal', 'cold', 'neon-lit'], tags: ['night'], fonts: ['Impact'] };
  const s = P.suggest(neon);
  check(s.phrases.length >= 4 && s.phrases.length <= 6, `a few searches (${s.phrases.join(' | ')})`);
  check(s.colors.includes('vivid pink') && s.styles.includes('low key') && s.styles.includes('film grain'), 'color words and styles from the vibe');
  check(s.phrases.every((p) => p.split(' ').length <= 7 && p === p.toLowerCase()), 'short, plain search phrases');
  const y = P.suggest(neon, { words: 'Y2K' });
  check(y.phrases[0] === 'y2k aesthetic' && y.phrases.includes('y2k chrome aesthetic') && y.phrases.some((p) => /nocturnal/.test(p)), 'an aesthetic leads; the board still shows');
  const clip = P.suggest({ byKind: { clip: 4 }, moods: ['frantic'] });
  check(clip.subject === 'cinematography' && clip.phrases.some((p) => /cinematography/.test(p)), 'clips → cinematography searches');
  check(P.suggest({}).phrases.length === 1, 'an empty board still has a search');
  check(Object.keys(P.AESTHETICS).length >= 20 && Object.values(P.AESTHETICS).every((l) => l.length === 2), `${Object.keys(P.AESTHETICS).length} aesthetics, two searches each`);
  check(P.clean('<script>Neon</script>  NIGHT!!') === 'script neon script night', 'phrases are cleaned');

  // ---------- the window's rules ----------
  const M = require(path.join(root, 'boardpinsmain.js'));
  check(M.searchUrl('neon night') === 'https://www.pinterest.com/search/pins/?q=neon%20night', 'Pinterest search address');
  check(M.searchUrl('x', 'https://evil.example/?q={q}') === 'https://www.pinterest.com/search/pins/?q=x', 'other sites can\'t be the window');
  check(M.okBase('https://fr.pinterest.com/search/pins/?q={q}') && M.okBase('http://127.0.0.1:8123/?q={q}') && !M.okBase('http://example.com/'), 'Pinterest (any country) or a local test page');
  check(M.searchUrl('') === 'https://www.pinterest.com/', 'no words: Pinterest\'s home (sign in, browse)');
  check(M.clean({ image: 'javascript:alert(1)' }) === null && M.clean({ image: 'data:text/html,x' }) === null, 'pins with odd addresses are dropped');
  const pin = M.clean({ image: 'https://i.pinimg.com/736x/a.jpg', link: 'https://www.pinterest.com/pin/1/', title: `  A\n${'x'.repeat(400)}` });
  check(pin.image.startsWith('https://i.pinimg') && pin.link.endsWith('/pin/1/') && pin.title.length <= 160 && !/\n/.test(pin.title), 'a pin: picture, link and a short title');
  check(M.PARTITION === 'persist:pinterest', 'its own signed-in session');
  const pre = fs.readFileSync(path.join(root, 'board-pin-preload.js'), 'utf8');
  check(/isTrusted/.test(pre) && !/contextBridge|exposeInMainWorld/.test(pre), 'the preload acts only on real clicks and exposes nothing to the page');

  // ---------- captions and credit in the vibe text ----------
  const V = require(path.join(root, 'board-vibe.js'));
  const t = V.text({ type: 'image', title: 'Hill', alt: 'an orange sky over a dark hill', credit: 'Jane Doe', vibe: { light: 0.6, contrast: 0.4, sat: 0.5, warmth: 0.3, edges: 0.2, grain: 0.1, palette: [] } });
  check(/seen "an orange sky over a dark hill"/.test(t) && /by Jane Doe/.test(t), 'the vibe text carries what a chat saw and the credit');

  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
