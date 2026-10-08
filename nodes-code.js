// Code flow: any code (JS, TS, Python, GLSL) as a read-only flow of nodes. Functions, methods and callbacks are
// nodes, calls are wires, classes and modules are frames around their methods, and the top-level statements run
// down a sequence on the left. A small hand-written tokenizer and parser (no libraries) that copes with partial
// code (a reply still streaming, a snippet cut in half). Opens from a chat code block ("Nodes", ⋯ → Open in the
// node view), /code-nodes [n], /code-nodes-paste, /code-nodes-file; the side panel shows a node's code, and a
// light edit (rewrite one function) can go back to the chat, the Lab or the shader playground.
// The parser part loads in Node too (module.exports) for tests.
const CodeFlow = (() => {
  // ---------- languages ----------
  const KW = new Set('if else for while do switch case default break continue return function class extends new delete typeof instanceof in of var let const try catch finally throw yield await async import export from as void this super with debugger static get set true false null undefined interface type enum implements namespace declare abstract public private protected readonly keyof is'.split(' '));
  const PY_KW = new Set('if elif else for while try except finally with def class return yield lambda pass break continue raise import from as global nonlocal assert del in is not and or True False None async await match case print'.split(' '));
  const GLSL_KW = new Set('if else for while do return break continue discard void float int bool uint vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D samplerCube struct uniform varying attribute in out inout const precision highp mediump lowp layout true false'.split(' '));
  const GLSL_BUILTIN = new Set('sin cos tan asin acos atan pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture texture2D textureCube dFdx dFdy fwidth radians degrees round trunc transpose inverse determinant'.split(' '));
  function guessLang(code, lang = '') {
    const l = String(lang || '').toLowerCase();
    if (/^(py|python|python3)$/.test(l)) return 'py';
    if (/^(glsl|frag|vert|shader|hlsl|wgsl)$/.test(l)) return 'glsl';
    if (/^(ts|tsx|typescript)$/.test(l)) return 'ts';
    if (/^(js|jsx|javascript|mjs|cjs|node|extendscript)$/.test(l)) return 'js';
    if (/^(json|bash|sh|shell|zsh|powershell|ps1|html|css|scss|md|markdown|text|txt|yaml|yml|toml|xml|sql|diff)$/.test(l)) return null;
    const s = String(code || '');
    if (/^\s*(def |class \w+(\(.*\))?:|from [\w.]+ import |import [\w.]+$)/m.test(s) && !/[{};]\s*$/m.test(s.split('\n').slice(0, 30).join('\n'))) return 'py';
    if (/void\s+main\s*\(|mainImage\s*\(|gl_FragColor|\bfragColor\b|uniform\s+(float|vec[234]|sampler2D)/.test(s)) return 'glsl';
    if (/\binterface\s+\w+\s*\{|:\s*(string|number|boolean|void)\b|\btype\s+\w+\s*=/.test(s)) return 'ts';
    if (/\bfunction\b|=>|\bconst\b|\blet\b|\bclass\b|\bimport\b|\brequire\(/.test(s)) return 'js';
    return null;
  }
  const LANG_NAME = { js: 'JavaScript', ts: 'TypeScript', py: 'Python', glsl: 'GLSL' };

  // ---------- tokenizers ----------
  // C-like (JS, TS, GLSL): ids, numbers, strings, template literals (their ${…} parts are tokenized too),
  // regex literals, comments, punctuation. Unterminated strings / comments end at the line / the end.
  function tokenizeC(src, { glsl = false } = {}) {
    const T = []; const comments = [];
    let i = 0; let line = 1; let lineStart = true;
    const n = src.length;
    const braces = []; // '{' or 'tpl' (a template's ${)
    let inTpl = false;
    const push = (t, v, s, e, l) => T.push({ t, v, s, e, line: l });
    const regexOk = () => {
      const p = T[T.length - 1];
      if (!p) return true;
      if (p.t === 'p') return !/[)\]}]/.test(p.v);
      if (p.t === 'id') return /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(p.v);
      return false;
    };
    while (i < n) {
      if (inTpl) {
        const s = i; const l = line;
        while (i < n && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) { if (src[i] === '\\') i += 1; else if (src[i] === '\n') line += 1; i += 1; }
        if (i > s) push('str', src.slice(s, i), s, i, l);
        if (i >= n) break;
        if (src[i] === '`') { i += 1; inTpl = false; push('p', '`', i - 1, i, line); continue; }
        i += 2; braces.push('tpl'); inTpl = false; continue;
      }
      const c = src[i];
      if (c === '\n') { line += 1; i += 1; lineStart = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i += 1; continue; }
      const wasStart = lineStart; lineStart = false;
      if (glsl && c === '#' && wasStart) { const s = i; while (i < n && src[i] !== '\n') { if (src[i] === '\\' && src[i + 1] === '\n') { i += 1; line += 1; } i += 1; } push('pp', src.slice(s, i), s, i, line); continue; }
      if (c === '/' && src[i + 1] === '/') { const s = i; while (i < n && src[i] !== '\n') i += 1; comments.push({ v: src.slice(s, i), s, e: i, line }); continue; }
      if (c === '/' && src[i + 1] === '*') { const s = i; const l = line; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line += 1; i += 1; } i = Math.min(n, i + 2); comments.push({ v: src.slice(s, i), s, e: i, line: l }); continue; }
      if (c === '"' || c === "'") { const s = i; i += 1; while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i += 1; i += 1; } if (src[i] === c) i += 1; push('str', src.slice(s, i), s, i, line); continue; }
      if (c === '`' && !glsl) { push('p', '`', i, i + 1, line); i += 1; inTpl = true; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { const s = i; while (i < n && /[0-9a-zA-Z_.]/.test(src[i])) { if ((src[i] === 'e' || src[i] === 'E') && /[+-]/.test(src[i + 1] || '')) i += 1; i += 1; } push('num', src.slice(s, i), s, i, line); continue; }
      if (/[A-Za-z_$À-￿]/.test(c)) { const s = i; while (i < n && /[\w$À-￿]/.test(src[i])) i += 1; push('id', src.slice(s, i), s, i, line); continue; }
      if (c === '/' && !glsl && regexOk()) {
        const s = i; i += 1; let cls = false;
        while (i < n && src[i] !== '\n') { if (src[i] === '\\') i += 1; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i += 1; }
        if (src[i] === '/') { i += 1; while (i < n && /[a-z]/i.test(src[i])) i += 1; push('re', src.slice(s, i), s, i, line); continue; }
        i = s; // not a regex after all: a division
      }
      const three = src.substr(i, 3); const two = src.substr(i, 2);
      if (three === '...' || three === '===' || three === '!==' || three === '**=' || three === '>>>' || three === '<<=' || three === '>>=' || three === '&&=' || three === '||=' || three === '??=') { push('p', three, i, i + 3, line); i += 3; continue; }
      if (['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '::', '->'].includes(two) && !(two === '?.' && /[0-9]/.test(src[i + 2] || ''))) { push('p', two, i, i + 2, line); i += 2; continue; }
      if (c === '{') braces.push('{');
      if (c === '}') { const top = braces.pop(); if (top === 'tpl') { i += 1; inTpl = true; continue; } }
      push('p', c, i, i + 1, line); i += 1;
    }
    return { tokens: T, comments };
  }
  // Python: tokens per logical line (brackets join lines), with each line's indent.
  function tokenizePy(src) {
    const lines = []; // { ind, tokens, s, e, line, endLine }
    let cur = null; let depth = 0; let i = 0; let line = 1;
    const n = src.length;
    const comments = [];
    const start = (ind) => { cur = { ind, tokens: [], s: i, e: i, line, endLine: line }; };
    const end = () => { if (cur && cur.tokens.length) { cur.endLine = cur.tokens[cur.tokens.length - 1].line; lines.push(cur); } cur = null; };
    let atLine = true;
    while (i < n) {
      if (atLine && depth === 0) {
        let ind = 0; const s = i;
        while (i < n && (src[i] === ' ' || src[i] === '\t')) { ind += src[i] === '\t' ? 4 : 1; i += 1; }
        if (src[i] === '\n' || src[i] === '\r' || src[i] === '#' || i >= n) { if (src[i] === '#') { const cs = i; while (i < n && src[i] !== '\n') i += 1; comments.push({ v: src.slice(cs, i), s: cs, e: i, line }); } if (src[i] === '\r') i += 1; if (src[i] === '\n') { i += 1; line += 1; } continue; }
        void s;
        start(ind); atLine = false;
      }
      const c = src[i];
      if (c === '\n') { line += 1; i += 1; if (depth === 0) { end(); atLine = true; } continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i += 1; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; line += 1; continue; }
      if (c === '#') { const cs = i; while (i < n && src[i] !== '\n') i += 1; comments.push({ v: src.slice(cs, i), s: cs, e: i, line }); continue; }
      if (!cur) start(0);
      const m = /^([rRbBuUfF]{0,2})("""|'''|"|')/.exec(src.slice(i, i + 5));
      if (m && (m[1] || c === '"' || c === "'")) {
        const s = i; const l = line; const q = m[2]; i += m[0].length;
        while (i < n && src.substr(i, q.length) !== q) { if (src[i] === '\\') i += 1; else if (src[i] === '\n') { if (q.length === 1) break; line += 1; } i += 1; }
        if (src.substr(i, q.length) === q) i += q.length;
        cur.tokens.push({ t: 'str', v: src.slice(s, i), s, e: i, line: l });
        cur.e = i;
        continue;
      }
      if (/[0-9]/.test(c)) { const s = i; while (i < n && /[0-9a-zA-Z_.]/.test(src[i])) i += 1; cur.tokens.push({ t: 'num', v: src.slice(s, i), s, e: i, line }); cur.e = i; continue; }
      if (/[A-Za-z_À-￿]/.test(c)) { const s = i; while (i < n && /[\wÀ-￿]/.test(src[i])) i += 1; cur.tokens.push({ t: 'id', v: src.slice(s, i), s, e: i, line }); cur.e = i; continue; }
      if ('([{'.includes(c)) depth += 1;
      if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
      const two = src.substr(i, 2);
      const op = ['->', '**', '//', '==', '!=', '<=', '>=', ':=', '+=', '-=', '*=', '/='].includes(two) ? two : c;
      cur.tokens.push({ t: 'p', v: op, s: i, e: i + op.length, line }); cur.e = i + op.length; i += op.length;
    }
    end();
    return { lines, comments };
  }

  // ---------- parsing: units (functions, classes, callbacks, statements, imports, types) and calls ----------
  // unit: { id, kind, name, title, s, e, line, endLine, parent (unit id), group (frame key), calls: Set, sig, bodyS, bodyE }
  function matchBrackets(T) {
    const m = new Array(T.length).fill(-1); const st = [];
    const open = { '(': ')', '[': ']', '{': '}' };
    for (let k = 0; k < T.length; k += 1) {
      const t = T[k];
      if (t.t !== 'p') continue;
      if (open[t.v]) st.push(k);
      else if (t.v === ')' || t.v === ']' || t.v === '}') {
        // tolerate broken code: close the nearest opener of the same kind
        for (let j = st.length - 1; j >= 0; j -= 1) if (open[T[st[j]].v] === t.v) { m[st[j]] = k; m[k] = st[j]; st.length = j; break; }
      }
    }
    // unclosed openers (partial code) close at the end
    for (const k of st) m[k] = T.length;
    return m;
  }
  const isP = (t, v) => t && t.t === 'p' && t.v === v;
  const isId = (t, v) => t && t.t === 'id' && (v == null || t.v === v);
  function parseC(src, lang) {
    const glsl = lang === 'glsl';
    const { tokens: T, comments } = tokenizeC(src, { glsl });
    const M = matchBrackets(T);
    const units = []; const byStart = new Map();
    const endOf = (k) => (M[k] >= T.length || M[k] < 0 ? T.length - 1 : M[k]);
    const pos = (k) => (k >= T.length ? src.length : T[k].s);
    const add = (u) => { u.id = `u${units.length}`; u.calls = new Set(); units.push(u); return u; };
    // the next '{' that opens a body (skipping return types: `): Type {`, generics), or -1
    function bodyAfter(k, limit = 40) {
      for (let j = k; j < Math.min(T.length, k + limit); j += 1) {
        if (isP(T[j], '{')) return j;
        if (isP(T[j], ';') || isP(T[j], '=>') || (isP(T[j], '}')) ) return -1;
        if (isP(T[j], '(') || isP(T[j], '[') || isP(T[j], '<')) { if (isP(T[j], '<')) continue; j = endOf(j); }
      }
      return -1;
    }
    const params = (k) => src.slice(T[k].s, pos(endOf(k)) + 1).replace(/\s+/g, ' ');
    if (glsl) {
      // GLSL: functions are `type name(params) {` at the top level; the rest are declarations
      let depth = 0;
      for (let k = 0; k < T.length; k += 1) {
        const t = T[k];
        if (isP(t, '{')) depth += 1;
        if (isP(t, '}')) depth -= 1;
        if (depth === 0 && isId(t) && isId(T[k + 1]) && isP(T[k + 2], '(')) {
          const close = endOf(k + 2); const b = isP(T[close + 1], '{') ? close + 1 : -1;
          if (b < 0) continue;
          const name = T[k + 1].v;
          const be = endOf(b);
          add({ kind: name === 'main' || name === 'mainImage' ? 'entry' : 'fn', name, title: `${name}()`, sig: `${t.v} ${name}${params(k + 2)}`, s: t.s, e: pos(be) + 1, bodyS: b, bodyE: be, line: t.line, endLine: T[Math.min(be, T.length - 1)].line, parent: null });
          k = be;
          depth = 0;
        }
      }
      // inputs: uniforms, ins, varyings, defines, structs
      const decl = T.filter((t) => t.t === 'pp').map((t) => t.v.trim());
      const unis = [];
      for (let k = 0; k < T.length; k += 1) if (isId(T[k]) && /^(uniform|varying|attribute|in|out)$/.test(T[k].v) && (k === 0 || isP(T[k - 1], ';') || isP(T[k - 1], '}') || T[k - 1].t === 'pp' || isP(T[k - 1], ')'))) { let j = k; while (j < T.length && !isP(T[j], ';')) j += 1; unis.push(src.slice(T[k].s, pos(j)).replace(/\s+/g, ' ')); k = j; }
      if (unis.length || decl.length) add({ kind: 'import', name: 'inputs', title: 'Inputs & defines', text: [...unis, ...decl].slice(0, 40).join('\n'), s: 0, e: 0, line: 1, endLine: 1, parent: null, noCalls: true });
      // calls between functions
      const fns = units.filter((u) => u.kind === 'fn' || u.kind === 'entry');
      const names = new Map(fns.map((u) => [u.name, u]));
      for (const u of fns) {
        const builtins = new Set();
        for (let k = u.bodyS; k < u.bodyE; k += 1) if (isId(T[k]) && isP(T[k + 1], '(') && !GLSL_KW.has(T[k].v)) { const c = names.get(T[k].v); if (c && c !== u) u.calls.add(c.id); else if (c === u) u.recursive = true; else if (GLSL_BUILTIN.has(T[k].v)) builtins.add(T[k].v); }
        u.builtins = [...builtins];
      }
      return { lang, units, comments, tokens: T.length };
    }

    // ---- JS / TS ----
    // 1) classes, interfaces / types / enums, functions of every shape (with their body ranges)
    const containerOf = []; // stack of { kind, unit, open, close } while scanning, to know parents
    const isObjOpen = (k) => { // does T[k] = '{' open an object literal (not a block)?
      const p = T[k - 1];
      if (!p) return false;
      if (p.t === 'p') return ['=', '(', ',', ':', '[', '?', '??', '||', '&&', 'return', '...'].includes(p.v) || (p.v === '=>' && false);
      return isId(p, 'return');
    };
    const objName = (k) => { // `const api = {` / `export default {` / `name: {`
      const p = T[k - 1]; const pp = T[k - 2];
      if (isP(p, '=') && isId(pp)) return pp.v;
      if (isP(p, ':') && (isId(pp) || pp?.t === 'str')) return pp.v.replace(/['"]/g, '');
      if (isId(p, 'return')) return 'returned object';
      return null;
    };
    const blocks = []; // { open, close, kind: 'class'|'obj'|'fn'|'block', unit }
    const callbackName = (k) => { // k = index of the first token of the function (params or 'function'): is it a call argument?
      let j = k - 1;
      if (isId(T[j], 'async')) j -= 1;
      if (!(isP(T[j], '(') || isP(T[j], ','))) return null;
      // find the call's opening paren
      let o = j;
      while (o >= 0 && !(isP(T[o], '(') && M[o] > k)) { if (isP(T[o], ')') || isP(T[o], ']') || isP(T[o], '}')) o = M[o]; o -= 1; }
      if (o < 0) return null;
      const callee = []; let c = o - 1;
      while (c >= 0 && (isId(T[c]) || isP(T[c], '.') || isP(T[c], '?.'))) { callee.unshift(T[c].v); c -= 1; }
      const firstArg = T[o + 1]?.t === 'str' ? T[o + 1].v.replace(/['"`]/g, '') : null;
      const name = callee.join('').replace(/^\./, '');
      if (!name) return null; // a grouping paren, not a call: (() => { … })()
      const last = name.split('.').pop();
      if (/^(addEventListener|on|once|addListener)$/.test(last) && firstArg) return { label: `on ${firstArg}`, callee: name };
      if (/^(setAnimationLoop|requestAnimationFrame)$/.test(last)) return { label: 'every frame', callee: name };
      if (/^(setInterval)$/.test(last)) return { label: 'repeatedly (setInterval)', callee: name };
      if (/^(setTimeout)$/.test(last)) return { label: 'later (setTimeout)', callee: name };
      if (/^(then|catch|finally)$/.test(last)) return { label: `.${last}(…)`, callee: name };
      if (/^(get|post|put|delete|patch|use|route|handle|register|command|it|test|describe)$/.test(last) && firstArg) return { label: `${last} ${firstArg}`, callee: name };
      return { label: `${name}(…) callback`, callee: name };
    };
    // the name a function expression gets from where it sits: const f = …, f = …, f: …, method f() {…}
    const nameBefore = (k) => {
      let j = k - 1;
      if (isId(T[j], 'async')) j -= 1;
      if (isP(T[j], '=') && isId(T[j - 1])) { const isDecl = /^(const|let|var)$/.test(T[j - 2]?.v || ''); const owner = isP(T[j - 2], '.') && isId(T[j - 3]) ? T[j - 3].v : null; return { name: T[j - 1].v, decl: isDecl, owner }; }
      if (isP(T[j], '=') && isP(T[j - 1], ']')) return null;
      if (isP(T[j], ':') && (isId(T[j - 1]) || T[j - 1]?.t === 'str') && !isP(T[j - 2], '?')) return { name: T[j - 1].v.replace(/['"]/g, ''), prop: true };
      return null;
    };
    for (let k = 0; k < T.length; k += 1) {
      const t = T[k];
      // classes
      if (isId(t, 'class') && !isP(T[k - 1], '.')) {
        const nameTok = isId(T[k + 1]) && !/^(extends|implements)$/.test(T[k + 1].v) ? T[k + 1] : null;
        const b = bodyAfter(k + 1, 30);
        if (b < 0) continue;
        let name = nameTok?.v;
        if (!name) { const nb = nameBefore(k); name = nb?.name || 'class'; }
        const ext = (() => { const x = T.slice(k, b).findIndex((y) => isId(y, 'extends')); return x >= 0 && isId(T[k + x + 1]) ? T[k + x + 1].v : null; })();
        const u = add({ kind: 'class', name, title: `class ${name}`, sig: src.slice(t.s, T[b].s).replace(/\s+/g, ' ').trim(), s: (isId(T[k - 1], 'export') ? T[k - 1] : t).s, e: pos(endOf(b)) + 1, bodyS: b, bodyE: endOf(b), line: t.line, endLine: T[Math.min(endOf(b), T.length - 1)]?.line, ext });
        blocks.push({ open: b, close: endOf(b), kind: 'class', unit: u });
        continue;
      }
      // TS: interface / type / enum
      if (lang === 'ts' && isId(t) && /^(interface|enum)$/.test(t.v) && isId(T[k + 1])) { const b = bodyAfter(k + 1, 30); if (b >= 0) { add({ kind: 'type', name: T[k + 1].v, title: `${t.v} ${T[k + 1].v}`, text: src.slice(t.s, pos(endOf(b)) + 1), s: t.s, e: pos(endOf(b)) + 1, line: t.line, endLine: T[Math.min(endOf(b), T.length - 1)].line, noCalls: true }); k = endOf(b); } continue; }
      if (lang === 'ts' && isId(t, 'type') && isId(T[k + 1]) && (isP(T[k + 2], '=') || isP(T[k + 2], '<')) && (k === 0 || isP(T[k - 1], ';') || isP(T[k - 1], '}') || isId(T[k - 1], 'export') || T[k - 1].line < t.line)) {
        let j = k + 2; while (j < T.length && !isP(T[j], ';') && !(T[j].line > t.line && j > k + 3 && isId(T[j]) && /^(const|let|var|function|class|export|type|interface|import)$/.test(T[j].v))) { if (isP(T[j], '{') || isP(T[j], '(') || isP(T[j], '[')) j = endOf(j); j += 1; }
        add({ kind: 'type', name: T[k + 1].v, title: `type ${T[k + 1].v}`, text: src.slice(t.s, pos(j)), s: t.s, e: pos(j), line: t.line, endLine: T[Math.min(j, T.length - 1)].line, noCalls: true });
        k = j; continue;
      }
      // function declarations and expressions
      if (isId(t, 'function')) {
        let j = k + 1;
        if (isP(T[j], '*')) j += 1;
        const own = isId(T[j]) ? T[j].v : null;
        if (own) j += 1;
        while (j < T.length && !isP(T[j], '(') && j < k + 12) j += 1; // generics <T>
        if (!isP(T[j], '(')) continue;
        const b = bodyAfter(endOf(j) + 1, 20);
        if (b < 0) continue;
        const start = isId(T[k - 1], 'async') ? k - 1 : k;
        const nb = nameBefore(start);
        const cb = !nb && !own ? callbackName(start) : null;
        const isDecl = Boolean(own) && !nb && !cb && !(isP(T[start - 1], '(') || isP(T[start - 1], ',') || isP(T[start - 1], '=') || isP(T[start - 1], ':'));
        const name = nb?.name || own || cb?.label || 'function';
        const exp = isId(T[start - 1], 'export') ? T[start - 1] : isId(T[start - 1], 'default') && isId(T[start - 2], 'export') ? T[start - 2] : null;
        const declStart = nb?.decl ? (() => { let x = start - 1; while (x > 0 && !/^(const|let|var)$/.test(T[x].v)) x -= 1; return x; })() : exp ? T.indexOf(exp) : start;
        const u = add({ kind: cb ? 'callback' : 'fn', name, title: cb ? cb.label : `${name}${params(j).length > 28 ? '(…)' : params(j)}`, sig: src.slice(T[start].s, T[b].s).replace(/\s+/g, ' ').trim(), s: T[Math.max(0, declStart)].s, e: pos(endOf(b)) + 1, bodyS: b, bodyE: endOf(b), line: T[start].line, endLine: T[Math.min(endOf(b), T.length - 1)]?.line, decl: isDecl || nb?.decl, prop: nb?.prop, owner: nb?.owner, callee: cb?.callee, at: start });
        blocks.push({ open: b, close: endOf(b), kind: 'fn', unit: u });
        continue;
      }
      // arrow functions
      if (isP(t, '=>')) {
        let p0 = k - 1;
        // TS return type: (a): T => … — step back over `: Type`
        if (!isP(T[p0], ')') && !isId(T[p0])) continue;
        if (isId(T[p0]) && isP(T[p0 - 1], ':')) { let q = p0 - 1; while (q > 0 && !isP(T[q], ')')) q -= 1; if (isP(T[q], ')')) p0 = q; }
        let start = isP(T[p0], ')') ? M[p0] : p0;
        if (start < 0) continue;
        if (isId(T[start - 1], 'async')) start -= 1;
        const nb = nameBefore(start);
        const cb = !nb ? callbackName(start) : null;
        const blockBody = isP(T[k + 1], '{');
        let b; let be;
        if (blockBody) { b = k + 1; be = endOf(b); } else {
          // expression body: up to the end of the expression (an unmatched closer, a comma or ; at this level)
          b = k + 1; be = b;
          while (be < T.length) { const x = T[be]; if (isP(x, '(') || isP(x, '[') || isP(x, '{')) { be = endOf(be) + 1; continue; } if (isP(x, ')') || isP(x, ']') || isP(x, '}') || isP(x, ',') || isP(x, ';')) break; if (be > b && x.line > T[be - 1].line && !nb) break; be += 1; }
          be -= 1;
        }
        // tiny inline callbacks (x => x * 2) are not worth a node; named ones always are
        const lines = (T[Math.min(be, T.length - 1)]?.line || t.line) - t.line + 1;
        if (!nb && (!blockBody || lines < 2) && !(cb && blockBody)) continue;
        const name = nb?.name || cb?.label || 'arrow function';
        const declStart = nb?.decl ? (() => { let x = start - 1; while (x > 0 && !/^(const|let|var)$/.test(T[x].v)) x -= 1; return x; })() : start;
        const u = add({ kind: cb ? 'callback' : 'fn', name, title: cb ? cb.label : `${name}${params(isP(T[start], '(') ? start : isP(T[start + 1], '(') ? start + 1 : start).replace(/^[^(]*$/, '()').length > 28 ? '(…)' : params(isP(T[start], '(') ? start : isP(T[start + 1], '(') ? start + 1 : start).replace(/^[^(]*$/, '()')}`, sig: src.slice(T[start].s, T[k].e).replace(/\s+/g, ' ').trim(), s: T[Math.max(0, declStart)].s, e: pos(Math.min(be, T.length - 1)) + 1, bodyS: b, bodyE: be, line: T[start].line, endLine: T[Math.min(be, T.length - 1)].line, decl: nb?.decl, prop: nb?.prop, owner: nb?.owner, callee: cb?.callee, arrow: true, at: start });
        blocks.push({ open: b, close: be, kind: 'fn', unit: u });
        continue;
      }
      // object literals (their methods group under the object's name)
      if (isP(t, '{') && isObjOpen(k)) blocks.push({ open: k, close: endOf(k), kind: 'obj', name: objName(k) });
    }
    // method shorthand in classes and objects: name(params) { … }
    const inside = (k, kind) => blocks.filter((b) => b.kind === kind && b.open < k && b.close > k).sort((a, b) => b.open - a.open)[0];
    for (const blk of blocks.filter((b) => b.kind === 'class' || b.kind === 'obj')) {
      let depthOk = blk.open + 1;
      for (let k = blk.open + 1; k < blk.close; k += 1) {
        const t = T[k];
        if (k < depthOk) continue;
        if (isP(t, '{') || isP(t, '(') || isP(t, '[')) {
          // a member: (mods) name ( … ) [: T] {
          const nameTok = isP(t, '(') ? T[k - 1] : null;
          if (nameTok && (isId(nameTok) || nameTok.t === 'str' || nameTok.t === 'num') && !KW.has(nameTok.v) || (nameTok && isId(nameTok) && /^(get|set|static|constructor|delete|new|default)$/.test(nameTok.v) && isP(T[k], '('))) {
            const b = bodyAfter(endOf(k) + 1, 12);
            const prev = T[k - 2];
            const memberStart = !prev || isP(prev, '{') || isP(prev, ',') || isP(prev, ';') || isP(prev, '}') || isP(prev, '*') || (isId(prev) && /^(static|async|get|set|public|private|protected|readonly|override|abstract)$/.test(prev.v)) || prev.line < nameTok.line;
            if (b >= 0 && memberStart && !units.some((u) => u.bodyS === b)) {
              let s0 = k - 1; while (s0 > blk.open + 1 && isId(T[s0 - 1]) && /^(static|async|get|set|public|private|protected|readonly|override|abstract)$/.test(T[s0 - 1].v)) s0 -= 1;
              const name = nameTok.v.replace(/['"]/g, '');
              const u = add({ kind: blk.kind === 'class' ? 'method' : 'fn', name, title: `${name}${params(k).length > 28 ? '(…)' : params(k)}`, sig: src.slice(T[s0].s, T[b].s).replace(/\s+/g, ' ').trim(), s: T[s0].s, e: pos(endOf(b)) + 1, bodyS: b, bodyE: endOf(b), line: T[s0].line, endLine: T[Math.min(endOf(b), T.length - 1)].line, member: true, objName: blk.name, at: s0 });
              blocks.push({ open: b, close: endOf(b), kind: 'fn', unit: u });
              depthOk = endOf(b) + 1;
              continue;
            }
          }
          depthOk = endOf(k) + 1;
        }
      }
    }
    // 2) parents: the innermost function / class around each unit
    const fnBlocks = blocks.filter((b) => (b.kind === 'fn' || b.kind === 'class') && b.unit);
    for (const u of units) {
      if (u.kind === 'type') continue;
      const at = u.bodyS ?? 0;
      const host = fnBlocks.filter((b) => b.unit !== u && b.open < at && b.close >= (u.bodyE ?? at)).sort((a, b) => b.open - a.open)[0];
      u.parent = host?.unit.id || null;
      const obj = inside(u.at ?? at, 'obj');
      if (obj?.name && (!host || obj.open > host.open)) u.objName = u.objName || obj.name;
    }
    // modules: `const X = (() => { … })()` / `(function () { … })()`: an IIFE gets the name it's assigned to
    for (const u of units) {
      if (u.kind !== 'fn' || u.parent) continue;
      const after = T[u.bodyE + 1]; const after2 = T[u.bodyE + 2];
      const iife = (isP(after, ')') && isP(after2, '(')) || (isP(after, '(') && isP(T[u.bodyE + 2], ')'));
      if (!iife) continue;
      u.kind = 'module';
      let j = u.at - 1; while (j >= 0 && isP(T[j], '(')) j -= 1;
      if (isP(T[j], '=') && isId(T[j - 1])) u.name = T[j - 1].v; else if (u.name === 'arrow function' || u.name === 'function') u.name = 'module';
      u.title = `${u.name} (module)`;
    }
    // 3) imports
    const imps = [];
    for (let k = 0; k < T.length; k += 1) {
      if (isId(T[k], 'import') && !isP(T[k + 1], '(') && !isP(T[k - 1], '.')) { let j = k; while (j < T.length && !isP(T[j], ';') && !(j > k && T[j].line > T[k].line && T[j - 1].t === 'str')) j += 1; imps.push(src.slice(T[k].s, pos(j)).replace(/\s+/g, ' ')); k = j; }
      else if (isId(T[k], 'require') && isP(T[k + 1], '(') && T[k + 2]?.t === 'str') imps.push(`require(${T[k + 2].v})`);
    }
    if (imps.length) add({ kind: 'import', name: 'imports', title: 'Imports', text: imps.slice(0, 40).join('\n'), s: 0, e: 0, line: 1, endLine: 1, parent: null, noCalls: true });
    // 4) top-level statements (outside every function and class), split into statements
    // which tokens sit inside a top-level function / class (one pass over sorted ranges)
    const covered = units.filter((u) => u.kind !== 'import' && !u.parent && u.s != null && u.e > u.s).map((u) => [u.s, u.e]).sort((a, b) => a[0] - b[0]);
    const cov = new Uint8Array(T.length);
    for (let k = 0, c = 0, reach = -1; k < T.length; k += 1) {
      while (c < covered.length && covered[c][0] <= T[k].s) { reach = Math.max(reach, covered[c][1]); c += 1; }
      if (T[k].e <= reach) cov[k] = 1;
    }
    const tokIndex = new Map(T.map((t, k) => [t, k]));
    const isCovered = (t) => cov[tokIndex.get(t)] === 1;
    const topCbs = units.filter((u) => u.kind === 'callback' && !u.parent);
    const steps = [];
    let cur = null;
    const CONT = new Set(['.', '?.', ',', '=', '+', '-', '*', '/', '%', '&&', '||', '??', '?', ':', '=>', '(', '[', '{', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '+=', '-=', '|', '&', '**']);
    for (let k = 0; k < T.length; k += 1) {
      const t = T[k];
      if (isCovered(t)) {
        // a covered callback inside a statement stays part of the statement (it registers it)
        const cbu = topCbs.find((u) => t.s >= u.s && t.e <= u.e);
        if (cbu && cur) { cur.cbs.add(cbu.id); cur.e = Math.max(cur.e, cbu.e); while (k + 1 < T.length && T[k + 1].e <= cbu.e) k += 1; continue; }
        if (cur) { steps.push(cur); cur = null; }
        continue;
      }
      if (t.t === 'p' && t.v === ';') { if (cur) { cur.e = t.e; steps.push(cur); cur = null; } continue; }
      if (!cur) cur = { s: t.s, e: t.e, line: t.line, endLine: t.line, toks: [], cbs: new Set() };
      if (isP(t, '(') || isP(t, '[') || isP(t, '{')) {
        const close = endOf(k);
        // callbacks inside count as registered by this statement
        const mine = topCbs.filter((u) => u.s >= t.s && u.e <= pos(close) + 1);
        for (const u of mine) cur.cbs.add(u.id);
        for (let j = k; j <= Math.min(close, T.length - 1); j += 1) if (!cov[j] || mine.some((u) => T[j].s >= u.s && T[j].e <= u.e)) cur.toks.push(j);
        cur.e = pos(Math.min(close, T.length - 1)) + 1; cur.endLine = T[Math.min(close, T.length - 1)].line;
        k = close;
      } else { cur.toks.push(k); cur.e = t.e; cur.endLine = t.line; }
      const nx = T[k + 1];
      const last = T[Math.min(k, T.length - 1)];
      if (!nx || (nx.line > last.line && !(last.t === 'p' && CONT.has(last.v)) && !(nx.t === 'p' && CONT.has(nx.v) && nx.v !== '(' && nx.v !== '[' && nx.v !== '{') && !/^(else|catch|finally)$/.test(nx.v))) { steps.push(cur); cur = null; }
    }
    if (cur) steps.push(cur);
    const stepUnits = steps.filter((s) => s.toks.length).map((s) => {
      const text = src.slice(s.s, s.e).trim();
      const first = T[s.toks[0]];
      const declared = isId(first) && /^(const|let|var)$/.test(first.v) ? (isId(T[s.toks[1]]) ? T[s.toks[1]].v : '{…}') : null;
      return { kind: 'step', s: s.s, e: s.e, line: s.line, endLine: s.endLine, text, declared, cbs: s.cbs, toks: s.toks, keyword: isId(first) && /^(if|for|while|switch|try|do|export|return)$/.test(first.v) ? first.v : null };
    });
    // group short neighbouring statements into steps of a few lines (never across a function between them);
    // a statement that registers a callback stands alone; imports live in their own node
    const tops = units.filter((u) => !u.parent && u.kind !== 'import' && u.e > u.s).map((u) => u.s);
    const between = (a, b) => tops.some((x) => x >= a && x < b);
    const grouped = [];
    for (const s of stepUnits.filter((x) => !/^import\b(?!\s*\()/.test(x.text))) {
      const g = grouped[grouped.length - 1];
      const lines = s.endLine - s.line + 1;
      if (g && !between(g.e, s.s) && !g.cbs.size && !s.cbs.size && !s.keyword && !g.keyword && g.count < 5 && (g.endLine - g.line + 1) + lines <= 8) { g.e = s.e; g.endLine = s.endLine; g.count += 1; g.text = src.slice(g.s, g.e).trim(); if (s.declared) g.declared.push(s.declared); g.toks.push(...s.toks); continue; }
      grouped.push({ ...s, count: 1, declared: s.declared ? [s.declared] : [] });
    }
    for (const g of grouped) {
      const head = g.text.split('\n')[0].replace(/\s+/g, ' ');
      const title = g.declared.length >= 2 || (g.declared.length && g.count > 1) ? g.declared.slice(0, 4).join(', ') + (g.declared.length > 4 ? '…' : '') : head.length > 34 ? `${head.slice(0, 33)}…` : head;
      add({ kind: 'step', name: title, title, text: g.text, s: g.s, e: g.e, line: g.line, endLine: g.endLine, parent: null, cbs: g.cbs, toks: g.toks, count: g.count });
    }
    // 5) calls: in each body, outside nested functions; `this.x(` → the method of the same class
    const fnUnits = units.filter((u) => ['fn', 'method', 'callback', 'module'].includes(u.kind));
    const named = new Map();
    for (const u of [...fnUnits, ...units.filter((x) => x.kind === 'class')]) { if (!named.has(u.name)) named.set(u.name, []); named.get(u.name).push(u); }
    const classOf = (u) => { let p = units.find((x) => x.id === u.parent); while (p && p.kind !== 'class') p = units.find((x) => x.id === p.parent); return p; };
    const nested = (u) => fnUnits.filter((x) => x.parent === u.id && x.bodyS != null);
    const pick = (list, from) => {
      if (!list?.length) return null;
      if (list.length === 1) return list[0];
      // prefer the same parent chain, then the same object, then top level
      let p = from.parent;
      while (p) { const hit = list.find((x) => x.parent === p); if (hit) return hit; p = units.find((x) => x.id === p)?.parent; }
      return list.find((x) => x.objName && x.objName === from.objName) || list.find((x) => !x.parent) || list[0];
    };
    function scanCalls(u, toks) {
      for (const k of toks) {
        const t = T[k];
        if (!isId(t) || KW.has(t.v)) { if (!(isId(t, 'this') || isId(t, 'super'))) continue; }
        const next = T[k + 1];
        const prev = T[k - 1];
        let target = null;
        if (isP(next, '(') || (isP(next, '?.') && isP(T[k + 2], '('))) {
          if (isP(prev, '.') || isP(prev, '?.')) {
            const obj = T[k - 2];
            if (isId(obj, 'this')) { const cls = classOf(u); target = pick((named.get(t.v) || []).filter((x) => !cls || classOf(x) === cls || x.kind === 'fn'), u); }
            else target = pick((named.get(t.v) || []).filter((x) => x.kind === 'method' || x.member || x.prop || x.parent || x.owner), u);
          } else target = pick((named.get(t.v) || []).filter((x) => x.kind !== 'callback'), u);
          if (isId(prev, 'new')) target = pick((named.get(t.v) || []).filter((x) => x.kind === 'class'), u) || target;
        } else if ((isP(prev, '(') || isP(prev, ',')) && (isP(next, ')') || isP(next, ','))) {
          // a function passed along (setTimeout(tick, …), list.map(fmt)) counts too
          target = pick((named.get(t.v) || []).filter((x) => x.kind === 'fn' && x.decl !== undefined), u);
        }
        if (!target) continue;
        if (target === u) { u.recursive = true; continue; }
        u.calls.add(target.id);
      }
    }
    for (const u of fnUnits) {
      const inner = nested(u).map((x) => [x.bodyS, x.bodyE]);
      const toks = [];
      for (let k = u.bodyS; k <= Math.min(u.bodyE, T.length - 1); k += 1) { const hole = inner.find(([a, b]) => k >= a && k <= b); if (hole) { k = hole[1]; continue; } toks.push(k); }
      scanCalls(u, toks);
    }
    for (const u of units.filter((x) => x.kind === 'step')) { scanCalls(u, u.toks); for (const c of u.cbs) u.calls.add(c); }
    // a class extends another class of this code
    for (const u of units.filter((x) => x.kind === 'class' && x.ext)) { const base = pick(named.get(u.ext)?.filter((x) => x.kind === 'class'), u); if (base) u.calls.add(base.id); }
    return { lang, units, comments, tokens: T.length };
  }

  function parsePy(src) {
    const { lines, comments } = tokenizePy(src);
    const units = [];
    const add = (u) => { u.id = `u${units.length}`; u.calls = new Set(); units.push(u); return u; };
    // defs and classes with their line ranges (a body ends at the first line indented as much as the header)
    const stack = []; // open defs/classes
    const imps = [];
    const steps = [];
    let pendingDeco = [];
    const closeTo = (ind) => { while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop(); };
    lines.forEach((ln, li) => {
      closeTo(ln.ind);
      const t0 = ln.tokens[0]; const t1 = ln.tokens[1]; const t2 = ln.tokens[2];
      if (isP(t0, '@')) { pendingDeco.push(src.slice(ln.s, ln.e).trim()); return; }
      const isAsync = isId(t0, 'async') && isId(t1, 'def');
      const d0 = isAsync ? t1 : t0; const d1 = isAsync ? t2 : t1;
      if ((isId(d0, 'def') || isId(d0, 'class')) && isId(d1)) {
        const parent = stack[stack.length - 1]?.unit || null;
        const kind = d0.v === 'class' ? 'class' : parent?.kind === 'class' ? 'method' : 'fn';
        const sigEnd = ln.tokens.findIndex((x) => isP(x, ':') && x === ln.tokens[ln.tokens.length - 1]) ;
        const sig = src.slice(ln.s, ln.e).trim().replace(/\s+/g, ' ');
        const pOpen = ln.tokens.findIndex((x) => isP(x, '('));
        const ps = pOpen >= 0 ? sig.slice(sig.indexOf('('), sig.lastIndexOf(')') + 1) : '';
        const u = add({ kind, name: d1.v, title: kind === 'class' ? `class ${d1.v}` : `${d1.v}${ps.length > 28 ? '(…)' : ps || '()'}`, sig, deco: pendingDeco, s: ln.s, e: ln.e, line: ln.line, endLine: ln.endLine, parent: parent?.id || null, li, ind: ln.ind, bodyLines: [] });
        void sigEnd;
        if (kind === 'class') { const ext = ln.tokens.slice(2).find((x, i, a) => isP(a[i - 1], '(') && isId(x)); if (ext) u.ext = ext.v; }
        pendingDeco = [];
        stack.push({ ind: ln.ind, unit: u });
        return;
      }
      pendingDeco = [];
      const owner = stack[stack.length - 1]?.unit;
      if (owner) { owner.bodyLines.push(li); for (const s of stack) { s.unit.e = Math.max(s.unit.e, ln.e); s.unit.endLine = Math.max(s.unit.endLine, ln.endLine); } return; }
      if (isId(t0, 'import') || (isId(t0, 'from') && ln.tokens.some((x) => isId(x, 'import')))) { imps.push(src.slice(ln.s, ln.e).trim()); return; }
      // a top-level statement; compound ones (if / for / with …) keep their indented block
      const st = { s: ln.s, e: ln.e, line: ln.line, endLine: ln.endLine, li: [li], keyword: isId(t0) && /^(if|for|while|with|try|match|async)$/.test(t0.v) ? t0.v : null, main: isId(t0, 'if') && src.slice(ln.s, ln.e).includes('__main__') };
      const prev = steps[steps.length - 1];
      if (prev && prev.open && ln.ind > 0) { prev.e = ln.e; prev.endLine = ln.endLine; prev.li.push(li); return; }
      if (prev?.open && /^(else|elif|except|finally)$/.test(t0?.v || '')) { prev.e = ln.e; prev.endLine = ln.endLine; prev.li.push(li); return; }
      st.open = isP(ln.tokens[ln.tokens.length - 1], ':');
      steps.push(st);
    });
    if (imps.length) add({ kind: 'import', name: 'imports', title: 'Imports', text: imps.slice(0, 40).join('\n'), s: 0, e: 0, line: 1, endLine: 1, parent: null, noCalls: true });
    // group statements
    const grouped = [];
    for (const s of steps) {
      const g = grouped[grouped.length - 1];
      const lns = s.endLine - s.line + 1;
      const defBetween = g && units.some((u) => (u.kind === 'fn' || u.kind === 'class') && !u.parent && u.line > g.endLine && u.line < s.line);
      if (g && !defBetween && !g.keyword && !s.keyword && g.count < 5 && (g.endLine - g.line + 1) + lns <= 8) { g.e = s.e; g.endLine = s.endLine; g.count += 1; g.li.push(...s.li); continue; }
      grouped.push({ ...s, count: 1, li: [...s.li] });
    }
    for (const g of grouped) {
      const text = src.slice(g.s, g.e).trim();
      const head = text.split('\n')[0];
      const declared = g.li.map((i) => lines[i].tokens).filter((tk) => isId(tk[0]) && isP(tk[1], '=')).map((tk) => tk[0].v);
      const title = g.main ? 'if __name__ == "__main__"' : declared.length >= 2 ? declared.slice(0, 4).join(', ') : head.length > 34 ? `${head.slice(0, 33)}…` : head;
      add({ kind: 'step', name: title, title, text, s: g.s, e: g.e, line: g.line, endLine: g.endLine, parent: null, li: g.li, count: g.count });
    }
    // calls
    const named = new Map();
    for (const u of units.filter((x) => ['fn', 'method', 'class'].includes(x.kind))) { if (!named.has(u.name)) named.set(u.name, []); named.get(u.name).push(u); }
    const classOf = (u) => { let p = units.find((x) => x.id === u.parent); while (p && p.kind !== 'class') p = units.find((x) => x.id === p.parent); return p; };
    const pick = (list, from) => { if (!list?.length) return null; if (list.length === 1) return list[0]; return list.find((x) => x.parent === from.parent) || list.find((x) => !x.parent) || list[0]; };
    const scan = (u, lis) => {
      for (const i of lis) {
        const tk = lines[i].tokens;
        tk.forEach((t, k) => {
          if (!isId(t) || PY_KW.has(t.v) && t.v !== 'print') return;
          if (!isP(tk[k + 1], '(')) return;
          let target = null;
          if (isP(tk[k - 1], '.')) {
            const obj = tk[k - 2];
            if (isId(obj, 'self') || isId(obj, 'cls')) { const cls = classOf(u); target = pick((named.get(t.v) || []).filter((x) => classOf(x) === cls), u); } else target = pick((named.get(t.v) || []).filter((x) => x.kind === 'method'), u);
          } else target = pick(named.get(t.v), u);
          if (!target) return;
          if (target === u) { u.recursive = true; return; }
          u.calls.add(target.id);
        });
      }
    };
    for (const u of units) {
      if (u.kind === 'fn' || u.kind === 'method') scan(u, u.bodyLines);
      if (u.kind === 'class') { scan(u, u.bodyLines); if (u.ext) { const b = pick(named.get(u.ext)?.filter((x) => x.kind === 'class'), u); if (b) u.calls.add(b.id); } }
      if (u.kind === 'step') scan(u, u.li);
    }
    // body text for each def (its lines without nested defs' bodies is fine to show whole)
    return { lang: 'py', units, comments, tokens: lines.length };
  }

  function parse(code, lang) {
    const L = guessLang(code, lang) || 'js';
    const src = String(code || '').replace(/\r\n/g, '\n');
    const r = L === 'py' ? parsePy(src) : parseC(src, L);
    r.src = src;
    r.lang = L;
    // the source text of each unit (for the side panel and light edits)
    for (const u of r.units) if (u.text == null) u.text = src.slice(u.s, u.e);
    return r;
  }
  // a short text outline (chat): functions with what they call
  function outlineText(r, { max = 60 } = {}) {
    const by = new Map(r.units.map((u) => [u.id, u]));
    const rows = r.units.filter((u) => u.kind !== 'step' && u.kind !== 'import').slice(0, max).map((u) => {
      const calls = [...u.calls].map((id) => by.get(id)?.name).filter(Boolean);
      const parent = by.get(u.parent);
      return `- ${u.kind === 'class' ? '**class** ' : u.kind === 'callback' ? '↳ ' : ''}\`${u.title}\`${parent ? ` in ${parent.name}` : ''} · L${u.line}${u.endLine > u.line ? `–${u.endLine}` : ''}${calls.length ? ` → ${calls.slice(0, 8).join(', ')}${calls.length > 8 ? '…' : ''}` : ''}${u.recursive ? ' ↻' : ''}`;
    });
    const steps = r.units.filter((u) => u.kind === 'step').length;
    return `${LANG_NAME[r.lang] || r.lang}: ${r.units.filter((u) => ['fn', 'method', 'callback', 'entry'].includes(u.kind)).length} functions, ${r.units.filter((u) => u.kind === 'class').length} classes, ${steps} top-level steps, ${r.units.reduce((s, u) => s + u.calls.size, 0)} calls.\n${rows.join('\n')}`;
  }

  if (typeof NodeView === 'undefined') return { parse, guessLang, outlineText, tokenizeC, tokenizePy };

  // ---------- the node view ----------
  const reg = NodeView.createRegistry({
    name: 'code', types: { call: { color: '#48ddff', label: 'Calls' }, flow: { color: '#c9b79c', label: 'Then' } }, sliderLabel: null, bypass: false,
  });
  const KINDS = {
    fn: ['Function', '#48ddff'], method: ['Method', '#bd8bff'], callback: ['Callback', '#ff8c42'], class: ['Class', '#ffd75e'], module: ['Module', '#7cd992'],
    entry: ['Entry point', '#ff6b9d'], step: ['Statements', '#c9b79c'], import: ['Imports', '#7ad0ff'], type: ['Type', '#7cd992'],
  };
  const lineBadge = (n) => (n.values?.l1 ? `L${n.values.l1}${n.values.l2 > n.values.l1 ? `–${n.values.l2}` : ''}` : '');
  for (const [kind, [title, color]] of Object.entries(KINDS)) {
    const isStep = kind === 'step';
    reg.define({
      type: `c-${kind}`, title, category: 'Code', color, width: 260, desc: kind === 'step' ? 'Top-level code, in the order it runs' : `A ${title.toLowerCase()} of this code`,
      inputs: isStep ? [{ name: 'prev', type: 'flow', kind: null, label: 'after' }] : kind === 'import' || kind === 'type' ? [] : [{ name: 'callers', type: 'call', kind: null, multi: true, label: kind === 'class' ? 'used by' : 'called by' }],
      outputs: [...(isStep ? [{ name: 'next', type: 'flow', label: 'then' }] : []), ...(kind === 'import' || kind === 'type' ? [] : [{ name: 'calls', type: 'call', label: kind === 'class' ? 'uses' : 'calls' }])],
      widgets: [{ name: 'code', kind: 'info', mono: true, value: '' }],
      badge: lineBadge,
    });
  }
  const preview = (text, max = 7) => { const ls = String(text || '').replace(/\t/g, '  ').split('\n'); const ind = Math.min(...ls.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length), 99); const out = [ls[0], ...ls.slice(1).map((l) => l.slice(ind === 99 ? 0 : Math.min(ind, 2)))]; return out.slice(0, max).map((l) => (l.length > 64 ? `${l.slice(0, 63)}…` : l)).join('\n') + (ls.length > max ? `\n… ${ls.length - max} more lines` : ''); };
  const MAX_NODES = 160;
  // parse result → graph (custom layout: statements down the left, what they call in columns to the right,
  // classes / modules / outer functions as frames around their members)
  function toGraph(r) {
    const g = NodeView.emptyGraph('code');
    let units = r.units.filter((u) => u.kind !== 'class' || true);
    // big files: keep the top level and the biggest members
    if (units.length > MAX_NODES) {
      const score = (u) => (u.kind === 'step' || u.kind === 'import' ? 1e9 : !u.parent ? 1e6 : 0) + (u.endLine - u.line);
      const keep = new Set(units.slice().sort((a, b) => score(b) - score(a)).slice(0, MAX_NODES).map((u) => u.id));
      units = units.filter((u) => keep.has(u.id));
      g.meta = { trimmed: r.units.length - units.length };
    }
    const byId = new Map(units.map((u) => [u.id, u]));
    // classes show as a node (the class itself: fields, constructor use) + a frame around their methods
    for (const u of units) {
      const kind = u.kind === 'module' ? 'module' : u.kind;
      const values = { code: u.kind === 'step' || u.kind === 'import' || u.kind === 'type' ? preview(u.text, 9) : preview(`${u.sig || u.title}${u.builtins?.length ? `\n// uses ${u.builtins.slice(0, 8).join(', ')}` : ''}${u.kind === 'class' ? '' : `\n${String(u.text || '').split('\n').slice(1).join('\n')}`}`, 7), l1: u.line, l2: u.endLine };
      g.nodes.push({ id: u.id, type: `c-${kind}`, x: 0, y: 0, title: u.title.length > 40 ? `${u.title.slice(0, 39)}…` : u.title, values, ...(u.recursive ? { badge: `↻ ${lineBadge({ values })}` } : {}) });
    }
    const steps = units.filter((u) => u.kind === 'step');
    for (let i = 1; i < steps.length; i += 1) g.links.push({ from: [steps[i - 1].id, 'next'], to: [steps[i].id, 'prev'] });
    for (const u of units) for (const c of u.calls) if (byId.has(c) && byId.get(c).kind !== 'import' && byId.get(c).kind !== 'type') g.links.push({ from: [u.id, 'calls'], to: [c, 'callers'] });
    // ---- layout ----
    // head + port rows + the code excerpt (capped like the widget's max height)
    const H = (u) => 40 + (u.kind === 'step' ? 3 : u.kind === 'import' || u.kind === 'type' ? 0 : 2) * 22 + Math.min(140, g.nodes.find((n) => n.id === u.id)?.values.code.split('\n').length * 14 || 28);
    const depth = new Map();
    const queue = [];
    for (const s of steps) { depth.set(s.id, 0); queue.push(s.id); }
    const entries = units.filter((u) => u.kind === 'entry' || (u.kind === 'module'));
    for (const e of entries) if (!depth.has(e.id)) { depth.set(e.id, 1); queue.push(e.id); }
    while (queue.length) { const id = queue.shift(); const u = byId.get(id); for (const c of u?.calls || []) if (byId.has(c) && !depth.has(c)) { depth.set(c, depth.get(id) + 1); queue.push(c); } }
    // members sit with their container; unreached ones go one column right of their container (or column 1)
    const groupOf = (u) => { let p = byId.get(u.parent); let top = null; while (p) { if (p.kind === 'class' || p.kind === 'module' || p.kind === 'fn' || p.kind === 'method') top = p; p = byId.get(p.parent); } return top; };
    const groups = new Map(); // key → { key, title, units: [], container }
    for (const u of units) {
      if (u.kind === 'step' || u.kind === 'import' || u.kind === 'type') continue;
      const top = groupOf(u);
      const key = top ? top.id : u.kind === 'class' || u.kind === 'module' ? u.id : `solo-${u.id}`;
      if (!groups.has(key)) groups.set(key, { key, container: top || (u.kind === 'class' || u.kind === 'module' ? u : null), units: [] });
      groups.get(key).units.push(u);
    }
    for (const gr of groups.values()) {
      if (gr.container && !gr.units.includes(gr.container)) gr.units.unshift(gr.container);
      gr.units.sort((a, b) => (a === gr.container ? -1 : b === gr.container ? 1 : a.line - b.line));
      const ds = gr.units.map((u) => depth.get(u.id)).filter((d) => d != null);
      gr.depth = ds.length ? Math.max(1, Math.min(...ds)) : 1;
    }
    const pos = new Map();
    const COL = 310; const GAP = 22;
    let y = 0;
    for (const u of units.filter((x) => x.kind === 'import' || x.kind === 'type')) { pos.set(u.id, { x: 0, y }); y += H(u) + GAP; }
    for (const s of steps) { pos.set(s.id, { x: 0, y }); y += H(s) + GAP; }
    const cols = new Map();
    const ordered = [...groups.values()].sort((a, b) => a.depth - b.depth || a.units[0].line - b.units[0].line);
    const frames = [];
    for (const gr of ordered) {
      const c = gr.depth;
      // sit near the first caller already placed
      const callerY = (() => { const ys = []; for (const u of gr.units) for (const [id, p] of pos) { const caller = byId.get(id); if (caller?.calls.has(u.id)) ys.push(p.y); } return ys.length ? Math.min(...ys) : 0; })();
      let cy = Math.max(cols.get(c) ?? 0, callerY);
      const framed = gr.container && gr.units.length > 1;
      const y0 = cy;
      if (framed) cy += 40;
      for (const u of gr.units) { pos.set(u.id, { x: c * COL + (framed ? 16 : 0), y: cy }); cy += H(u) + GAP; }
      if (framed) { frames.push({ id: `f${gr.key}`, x: c * COL - 8, y: y0, w: 260 + 48, h: cy - y0 + 4, title: gr.container.kind === 'class' ? `class ${gr.container.name}` : gr.container.kind === 'module' ? gr.container.name : `inside ${gr.container.name}()`, color: KINDS[gr.container.kind]?.[1] || '#9a9187' }); cy += 24; }
      cols.set(c, cy + GAP);
    }
    for (const n of g.nodes) { const p = pos.get(n.id); if (p) { n.x = Math.round(p.x); n.y = Math.round(p.y); } }
    g.frames = frames;
    return g;
  }

  // ---------- the dialog ----------
  function open(code, lang = '', { agentId = null, title = '' } = {}) {
    let r;
    try { r = parse(code, lang); } catch (err) { console.error(err); r = null; }
    if (!r || !r.units.length) {
      const o = NodeView.outline(code);
      if (!o.graph.nodes.length) { toast('Nothing to show as nodes in this code', { timeout: 2000 }); return null; }
      NodeView.autoLayout(o.graph, o.registry, { colW: 280 });
      return NodeView.showGraph(o.graph, o.registry, { title: 'Code outline', note: `${lang || 'code'} · read-only` });
    }
    let src = r.src; let L = r.lang; let res = r;
    const isThree = () => L === 'js' && /from\s+['"]three['"]|\bTHREE\./.test(src);
    const isShader = () => L === 'glsl' && /void\s+main|mainImage/.test(src);
    // side panel: the selected node's code, what it calls, what calls it, and a light edit
    const head = el('div', { class: 'cf-head' });
    const links = el('div', { class: 'cf-links' });
    const pre = el('pre', { class: 'cf-code' });
    const area = el('textarea', { class: 'cf-edit', spellcheck: false, hidden: true });
    const bar = el('div', { class: 'cf-bar' });
    const side = el('div', { class: 'cf-side' }, head, links, pre, area, bar);
    let selected = null; let editing = false;
    const unitOf = (id) => res.units.find((u) => u.id === id);
    function showUnit(id) {
      selected = unitOf(id) || null;
      editing = false; area.hidden = true; pre.hidden = false;
      if (!selected) {
        head.replaceChildren(el('b', { text: `${LANG_NAME[L] || L} · ${src.split('\n').length} lines` }), el('span', { class: 'cf-muted', text: 'Click a node to see its code. Double-click (or Enter) edits it.' }));
        links.replaceChildren(el('div', { class: 'cf-muted', text: statusText() }));
        pre.innerHTML = highlight(src.slice(0, 6000), L === 'ts' ? 'js' : L);
        bar.replaceChildren();
        return;
      }
      const u = selected;
      const callers = res.units.filter((x) => x.calls.has(u.id));
      const callees = [...u.calls].map(unitOf).filter(Boolean);
      head.replaceChildren(el('b', { text: u.title }), el('span', { class: 'cf-muted', text: `${KINDS[u.kind]?.[0] || u.kind} · line ${u.line}${u.endLine > u.line ? `–${u.endLine}` : ''}${u.recursive ? ' · calls itself' : ''}` }));
      const chip = (x) => el('button', { class: 'cf-chip', text: x.name.length > 26 ? `${x.name.slice(0, 25)}…` : x.name, title: `${x.title} · line ${x.line}`, on: { click: () => { dlg.view.select([x.id]); dlg.view.center(x.id); showUnit(x.id); } } });
      links.replaceChildren(
        callees.length ? el('div', { class: 'cf-row' }, el('span', { class: 'cf-muted', text: u.kind === 'step' ? 'runs' : 'calls' }), ...callees.slice(0, 16).map(chip)) : null,
        callers.length ? el('div', { class: 'cf-row' }, el('span', { class: 'cf-muted', text: 'called by' }), ...callers.slice(0, 16).map(chip)) : null);
      pre.innerHTML = highlight(u.text, L === 'ts' ? 'js' : L);
      bar.replaceChildren(
        el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(u.text, 'Code copied') } }),
        u.kind !== 'import' && u.s < u.e ? el('button', { class: 'ghost small', text: 'Edit', title: 'Rewrite this part (light edit): the whole code updates', on: { click: () => startEdit() } }) : null);
    }
    function startEdit() {
      if (!selected) return;
      editing = true;
      area.value = src.slice(selected.s, selected.e);
      area.hidden = false; pre.hidden = true;
      area.focus();
      bar.replaceChildren(
        el('button', { class: 'primary small', text: 'Apply', title: 'Put it back into the code (Ctrl+Enter)', on: { click: () => applyEdit() } }),
        el('button', { class: 'ghost small', text: 'Cancel', on: { click: () => showUnit(selected.id) } }));
    }
    area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEdit(); } if (e.key === 'Escape') { e.preventDefault(); showUnit(selected?.id); } });
    function applyEdit() {
      if (!selected || !editing) return;
      const name = selected.name; const kind = selected.kind;
      src = src.slice(0, selected.s) + area.value + src.slice(selected.e);
      edited = true;
      reparse();
      const again = res.units.find((u) => u.name === name && u.kind === kind);
      if (again) { dlg.view.select([again.id]); showUnit(again.id); } else showUnit(null);
      toast('Edited: Copy code, Insert in my message or Open in… use the new code', { timeout: 3000 });
    }
    let edited = false;
    function reparse() {
      res = parse(src, L);
      dlg.view.setGraph(toGraph(res), { keepView: true });
      dlg.view.setStatus(statusText());
    }
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;
    const statusText = () => `${LANG_NAME[L]} · ${count(res.units.filter((u) => ['fn', 'method', 'callback', 'entry'].includes(u.kind)).length, 'function')} · ${count(res.units.filter((u) => u.kind === 'class').length, 'class')} · ${count(res.units.filter((u) => u.kind === 'step').length, 'step')} · ${count(res.units.reduce((s, u) => s + u.calls.size, 0), 'call')}${res.graphTrimmed ? ` · ${res.graphTrimmed} small ones hidden` : ''}${edited ? ' · edited' : ''}`;
    const actions = [
      { label: 'Copy code', title: 'The whole code (with your edits)', run: () => copyText(src, 'Code copied'), close: false },
      agentId ? { label: 'Insert in my message', title: 'Into the chat box (with your edits)', run: () => { Native.insertDraft(agentId, `\`\`\`${lang || L}\n${src.replace(/\s+$/, '')}\n\`\`\`\n`); }, close: true } : null,
      isThree() ? { label: 'Open in the Lab', title: 'A new Lab sketch with this code', run: () => ThreeLab.openCode(src), close: true } : null,
      isShader() ? { label: 'Shader playground', title: 'Open it in the shader playground', run: () => ThreeLab.openShader(src), close: true } : null,
    ];
    const g = toGraph(res);
    res.graphTrimmed = g.meta?.trimmed || 0;
    const dlg = NodeView.showGraph(g, reg, {
      title: title || 'Code flow', note: `${LANG_NAME[L]} · read-only (drag to arrange; Edit in the side panel)`, className: 'cf-dialog', side, roMove: true, actions, storeKey: 'code.flow',
      onSelect: (ids) => { if (!editing || ids[0] !== selected?.id) showUnit(ids.length === 1 ? ids[0] : null); },
      onOpen: (id) => { dlg.view.select([id]); showUnit(id); startEdit(); },
      nodeMenu: (n) => [
        'Code',
        ['Copy its code', '', () => copyText(unitOf(n.id)?.text || '', 'Code copied')],
        ['Edit it…', 'A light edit of this part', () => { showUnit(n.id); startEdit(); }],
      ],
      menuItems: () => [
        'Code flow',
        ['Copy code', '', () => copyText(src, 'Code copied')],
        ['Copy the outline (text)', 'Functions and what they call, as Markdown', () => copyText(outlineText(res), 'Outline copied')],
        ['Statements only / everything', 'Hide or show the functions that nothing at the top level reaches', () => toggleUnreached()],
      ],
    });
    let hideUnreached = false;
    function toggleUnreached() {
      hideUnreached = !hideUnreached;
      if (!hideUnreached) { dlg.view.setGraph(toGraph(res), { keepView: true }); return; }
      const g2 = toGraph(res);
      const reach = new Set(dlg.view.chain(res.units.filter((u) => u.kind === 'step' || u.kind === 'entry').map((u) => u.id), 'down'));
      g2.nodes = g2.nodes.filter((n) => reach.has(n.id) || n.type === 'c-import');
      dlg.view.setGraph(g2, { keepView: true });
    }
    dlg.view.setStatus(statusText());
    showUnit(null);
    return { ...dlg, get code() { return src; }, result: () => res, select: (name) => { const u = res.units.find((x) => x.name === name || x.title === name); if (u) { dlg.view.select([u.id]); dlg.view.center(u.id); showUnit(u.id); } return Boolean(u); } };
  }

  // NodeView.openCode: code without a graph of its own lands here (a low priority catch-all)
  NodeView.registerAdapter({
    id: 'code', label: 'Code flow', kinds: ['code'], priority: -10,
    detect: (code, lang) => Boolean(guessLang(code, lang)),
    open: (code, lang) => open(code, lang, { agentId: H?.activeId && H.agent?.(H.activeId) ? H.activeId : null }),
  });

  // ---------- chat ----------
  // the code blocks of a chat, newest last (an unfinished block of a streaming reply counts too)
  function codeBlocks(chat) {
    const out = [];
    for (const m of chat?.messages || []) {
      const text = String(m.text || '');
      for (const b of text.matchAll(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g)) if (b[2].trim()) out.push({ lang: b[1] || '', code: b[2].replace(/\n$/, ''), role: m.role });
    }
    return out;
  }
  const area = 'Messages';
  const cmd = (def) => { if (typeof Commands === 'undefined' || Commands.get(def.name)) return; Commands.register({ area, ...def }); };
  cmd({ name: 'code-nodes', args: '[n]', desc: 'Open a code block of this chat as a flow of nodes (1 = the last one, 2 = the one before…)', complete: () => [{ value: '1', hint: 'the last code block' }, { value: '2' }, { value: '3' }],
    run: async (a, ctx) => {
      const chat = ctx?.chat || Native.current?.(ctx?.agentId);
      const blocks = codeBlocks(chat);
      if (!blocks.length) return 'No code blocks in this chat.';
      const n = Math.max(1, Number(a) || 1);
      const b = blocks[blocks.length - n];
      if (!b) return `There are only ${blocks.length} code blocks.`;
      const hit = NodeView.extract(b.code);
      if (hit) { NodeView.openCode(b.code, b.lang); return null; }
      open(b.code, b.lang, { agentId: ctx?.agentId, title: `Code flow · block ${blocks.length - n + 1} of ${blocks.length}` });
      return null;
    } });
  cmd({ name: 'code-nodes-paste', desc: 'Open the code on your clipboard as a flow of nodes', run: async (a, ctx) => { const t = await navigator.clipboard.readText().catch(() => ''); if (!t.trim()) return 'The clipboard has no text.'; open(t, a.trim(), { agentId: ctx?.agentId, title: 'Code flow · clipboard' }); return null; } });
  cmd({ name: 'code-nodes-file', args: '<path>', desc: 'Open a code file (JS, TS, Python, GLSL) as a flow of nodes',
    run: async (a, ctx) => {
      const p = a.trim().replace(/^["']|["']$/g, '');
      if (!p) return 'Give the full path of a file.';
      const text = await window.hub.fs.read(p);
      const ext = (p.match(/\.(\w+)$/) || [])[1] || '';
      open(String(text), ext, { agentId: ctx?.agentId, title: `Code flow · ${p.split(/[\\/]/).pop()}` });
      return null;
    } });
  cmd({ name: 'code-outline', args: '[n]', desc: 'A code block of this chat as a text outline: functions, classes and what calls what',
    run: async (a, ctx) => {
      const blocks = codeBlocks(ctx?.chat || Native.current?.(ctx?.agentId));
      const b = blocks[blocks.length - Math.max(1, Number(a) || 1)];
      if (!b) return blocks.length ? `There are only ${blocks.length} code blocks.` : 'No code blocks in this chat.';
      return outlineText(parse(b.code, b.lang));
    } });
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Code: the clipboard as a flow of nodes', () => Commands.run('code-nodes-paste', ''));

  const api = { parse, guessLang, outlineText, toGraph, open, codeBlocks, registry: reg };
  window.CodeFlow = api;
  return api;
})();
if (typeof module !== 'undefined') module.exports = CodeFlow;
