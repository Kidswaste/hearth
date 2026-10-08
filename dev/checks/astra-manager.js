// The agent editor with Astra's options: no horizontal overflow, the right fields per engine.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const A = H.agents().find((a) => a.engine === 'codex');
const C = H.agents().find((a) => a.engine === 'claude');
const form = document.getElementById('agent-form');
const wide = () => [...form.querySelectorAll('*')].filter((n) => n.getBoundingClientRect().right > form.getBoundingClientRect().right + 1 && n.offsetParent).slice(0, 6).map((n) => `${n.tagName}.${n.className}[${n.name || ''}] ${Math.round(n.getBoundingClientRect().width)}`);
for (const [who, agent] of [['claude', C], ['astra', A]]) {
  Manager.open(agent.id);
  await sleep(300);
  out[who] = { overflow: form.scrollWidth - form.clientWidth, wide: wide(), fileMode: !form.elements.codexFiles.hidden, astraOpts: !form.querySelector('.astra-opts').hidden, connectors: !form.querySelector('.connectors').hidden };
  document.getElementById('agent-dialog').close();
  await sleep(100);
}
Manager.open(A.id);
await sleep(300);
return JSON.stringify(out, null, 1);
