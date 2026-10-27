const QuestJournal = (() => {
  const C = QuestCore, KEY = 'quest-journal';
  const E = (tag, props = {}, ...children) => { const node = el(tag, props, ...children); for (const [key, value] of Object.entries(props.style || {})) if (key.startsWith('--')) node.style.setProperty(key, value); return node; };
  let root, content, status, state, writable = false, page = 'adventure', saving = Promise.resolve(), ticker, legacy;
  let atlasView = null, worldKeep = null; // worldKeep: (round 65, questperf65) the mounted map page's { layout, map, panel }, kept across re-renders of the map page
  let needsRender = true, paintFrame = 0, searchFrame = 0;
  let scrolledDown = false; // (round 71, studioperf71) the Studio is scrolled past its top (a passive scroll listener, mount): a page change at the top skips scrollTo, which forced a layout of the whole new page inside the click
  const visible = () => !document.hidden && (H.surfaceIdFor?.(H.activeId) || H.activeId) === 'tool:quests';
  function scheduleRender() { needsRender = true; if (!visible() || paintFrame) return; paintFrame = requestAnimationFrame(() => { paintFrame = 0; render(); }); }
  function scheduleMapSearch() {
    if (!visible()) { needsRender = true; return; }
    if (!searchFrame) searchFrame = requestAnimationFrame(() => { searchFrame = 0; if (page !== 'world') return; if (visible() && worldKeep?.search) worldKeep.search(); else needsRender = true; });
  }
  // (round 61, showsync61) Map layers: other modules add pins and one head icon to the Paris map without editing it
  // (showsync.js: this week's Shotgun / DICE venues with their logos). A layer: { id, icon(kit), pins(), owns(id), select(id, kit), lines() } (lines: round 63, questwalk63: [{ id, color, points: [{ lat, lon, label? }] }]). (round 64, parisjournal64: below(kit) → a node shown under the map; chip(kit) → a labelled toggle in the filter row.)
  const mapLayers = [];
  // (round 62, showprep62) quest detail hooks: fn({ quest, campaign, close, kit }) → a node shown under the quest's title
  // (e.g. a show quest's "Get ready" / "How was it?"); a hook that throws is skipped
  const detailHooks = [];
  function addDetailHook(fn) { if (typeof fn === 'function' && !detailHooks.includes(fn)) detailHooks.push(fn); }
  function addMapLayer(layer) { const i = mapLayers.findIndex(l => l.id === layer.id); if (i >= 0) mapLayers[i] = layer; else mapLayers.push(layer); if (state && page === 'world' && root?.isConnected) scheduleRender(); }
  let mapFilter = {kind:'all',saved:false,query:''}, tooltipSeq=0;
  let daySeen = C.day(), lastCelebration = null;
  const reviewJobs = new Map();
  const proofJobs = new Set();
  const pathOf = id => C.paths.find(p => p.id === id) || C.paths[0];
  const p = (text, cls = '') => E('p', { class: `qj-copy ${cls}`, text });
  const label = text => E('span', { class: 'qj-label', text });
  const row = (...nodes) => E('div', { class: 'qj-actions' }, ...nodes);
  // Original studio illustrations. Only these authored constants enter the SVG parser;
  // quest names, notes and imported data always go through textContent.
  function art(kind) {
    const drawings = {
      terminal: `<path d="M19 12h123v82H19Z" fill="#212123" stroke="#49494b" stroke-width="4"/><path d="M27 21h107v60H27Z" fill="#09090b"/><path d="M36 33h28M36 41h16M36 50h44M36 66h11l6-13 9 18 10-23 9 14h42" stroke="#ff8c42" fill="none"/><path d="M62 95v12h35V95M45 113h70" stroke="#6b6b6d" stroke-width="5"/><circle class="qj-art-led" cx="129" cy="88" r="2" fill="#ffd75e"/><path d="m114 34 5 8-5 8-5-8Z" fill="#bd8bff"/>`,
      forge: `<path d="m26 54 91-3 24 9-27 17-18 1-7 20 17 10-58 3 14-16-7-15-22-7Z" fill="#a1a1a3"/><path d="m27 54 84-3-10 16-64 3Z" fill="#cfcfd1"/><path d="m59 91 29-2M42 112l69-4"/><path d="m85 19 12 11-29 32-9-8Z" fill="#c48b5c"/><path d="m83 10 34 28-13 15-36-29Z" fill="#e4bf70"/><path d="m77 21 33 26"/><path d="m28 26 5-10 5 10 10 5-10 5-5 10-5-10-10-5Z" fill="#e9c780"/><path d="m124 15 6 10-6 13-6-13Z" fill="#b6a2d2"/><path d="m70 74 6 9 5-10" stroke="#313133"/>`,
      deck: `<path d="m34 26 77-9 15 88-78 10Z" fill="#a7a7a9"/><path d="m24 40 90-12 10 82-90 10Z" fill="#dfaa79"/><g class="qj-art-lift"><path d="m41 34 94 8-8 75-94-8Z" fill="#eadcbc"/><path d="m49 46 73 6-3 39-73-6Z" fill="#363638"/><circle cx="65" cy="67" r="12" fill="#e9c577"/><circle cx="102" cy="70" r="12" fill="#b3a4cd"/><path d="m61 66 8 1m29 3 8 1M62 99l38 3"/><path d="m74 90 18 1 6 12-31-2Z" fill="#b77b58"/></g><path d="m17 26 5-11 5 11 11 5-11 4-5 11-5-11-11-4Z" fill="#eed59a"/>`,
      room: `<path d="M16 16h128v100H16Z" fill="#1d1d1f" stroke="#858587" stroke-width="5"/><path d="M20 91 43 63 64 83 93 48 140 88v24H20Z" fill="#343436" stroke="none"/><path d="M20 104 56 84 80 94 116 76 140 99v13H20Z" fill="#49494b" stroke="none"/><circle cx="112" cy="40" r="13" fill="#e9d9ab" stroke="none"/><g class="qj-night-stars" fill="#d6dcb3" stroke="none"><circle cx="35" cy="37" r="2"/><circle cx="72" cy="30" r="1.5"/><circle cx="53" cy="52" r="1.5"/><circle cx="132" cy="67" r="2"/></g><path d="M80 18v94M18 70h124" stroke="#939395" stroke-width="4"/><path d="M11 119h139" stroke="#bd9c70" stroke-width="7"/>`,
      adventure: `<path d="M35 110 29 27Q29 20 38 19L113 12 125 105Z" fill="#323234"/><g class="qj-art-lift"><path d="m33 22 77-8 8 87-78 10Z" fill="#eedfbc"/><path d="m43 22 8 87M49 42l49-5M51 49l35-3"/><path d="m59 64 15-2 2 15-15 2Z" fill="#e98e6b"/><path d="m83 63 7 5 10-15M60 91l39-4"/><path d="m88 13 2 23 7-6 7 4-2-23" fill="#d96951"/></g><path d="m117 46 8-2 10 49-7 7-5-5Z" fill="#dfb953"/><path d="m128 100 5 7 2-14" fill="#eedfbc"/>`,
      campaigns: `<path d="m20 48 21-10 94 1 7 70-111 4Z" fill="#c38257"/><path d="m28 56 108-6M31 99l105-4M45 56l3 42M119 52l2 43"/><g class="qj-art-lift"><path d="m42 42-3-22 54-5 8 28" fill="#e5dbba"/><path d="m52 29 30-3M55 36l20-2"/><path d="m78 47 4-18 47 7-2 12" fill="#a4a4a6"/><path d="m92 38 21 3"/></g><path d="m62 65 47-2 1 21-47 2Z" fill="#eedfbc"/><path d="m74 76 25-1"/><circle cx="37" cy="65" r="2" fill="#29292b"/><circle cx="130" cy="61" r="2" fill="#29292b"/>`,
      skills: `<path d="m23 26 108-5 7 87-108 5Z" fill="#78787a"/><path d="m31 33 91-4 3 57-90 4Z" fill="#2b2b2d"/><path d="m62 32 3 56M94 30l3 56" stroke="#a2a2a4"/><g fill="#e4c56a"><circle cx="47" cy="47" r="7"/><circle cx="78" cy="45" r="7"/><circle cx="109" cy="44" r="7"/></g><path d="M47 42v5M78 40v5M109 39v5"/><g fill="#b0b0b2"><circle cx="47" cy="72" r="4"/><circle cx="79" cy="70" r="4"/><circle cx="110" cy="69" r="4"/></g><path class="qj-art-cable" d="M47 72C22 120 102 131 79 70" fill="none" stroke="#e78e70" stroke-width="5"/><path d="m102 97 22-1" stroke="#eadcb9"/><circle class="qj-art-led" cx="118" cy="101" r="2" fill="#dce39b"/>`,
      rewards: `<path d="M39 17h82l5 95H34Z" fill="#be6f57"/><path d="M47 26h65v55H44Z" fill="#2b2b2d"/><g class="qj-art-lift"><path d="m51 34 18-2 2 16-19 1Z" fill="#ebce79"/><path d="m82 34 21 2-2 16-21-3Z" fill="#aeaeb0"/><path d="m52 60 19-3 1 16-19 2Z" fill="#e78f71"/><path d="m82 60 20 1-1 15-20-1Z" fill="#b9adcb"/></g><path d="M43 54h69M48 91h47v13H47Z" fill="#2b2b2d"/><circle class="qj-art-led" cx="109" cy="96" r="6" fill="#ecd98f"/><path d="m30 112 101 1M44 116v6M117 116v6"/><path d="M64 10h31" stroke="#e9cc87" stroke-width="5"/>`,
      collection: `<path d="m24 27 111-5 3 91-113 3Z" fill="#6b6b6d"/><path d="m34 36 90-4 1 68-89 3Z" fill="#262628"/><path d="m34 70 91-3" stroke="#bb9270" stroke-width="6"/><path d="m43 61 6-16 19 1 4 16Z" fill="#b5accb"/><path d="m48 47 16 14M66 47 48 61"/><path d="m86 43 16-3 5 18-16 4Z" fill="#e8c666"/><path d="m47 83 25-2 2 15-26 1Z" fill="#d98a6d"/><path d="m85 94 4-16 18 1 2 13Z" fill="#aaaaac"/><path class="qj-art-door" d="m80 33 44-1 1 68-43 2Z" fill="#cdcdcf" fill-opacity=".12"/><circle cx="88" cy="68" r="2" fill="#e6ce8e"/><path d="M31 116v5M129 115v5"/>`,
      visual: `<path d="m25 39 74-18 39 28-75 23Z" fill="#b7a4ce"/><path d="m25 39 38 33v40L25 78Z" fill="#949496"/><path d="m63 72 75-23-2 40-73 23Z" fill="#dbc778"/><path d="m44 35 39 31M63 30l38 30M83 25l37 29M45 56l73-23M63 72v40M83 66v40M103 60v40M122 54v39M26 59l37 33 73-23" fill="none" stroke="#313133"/><path d="m30 15 4-8 4 8 8 3-8 3-4 8-4-8-8-3Z" fill="#e5d9b7"/>`,
      music: `<path d="m21 38 113-6 7 67-114 7Z" fill="#c99065"/><path d="m31 45 93-4 2 32-93 5Z" fill="#2f2f31"/><g class="qj-art-reel"><circle cx="53" cy="60" r="11" fill="#e5d6ae"/><path d="m53 50 0 20M43 60h20"/></g><g class="qj-art-reel"><circle cx="103" cy="57" r="11" fill="#e5d6ae"/><path d="M103 47v20M93 57h20"/></g><path d="m61 91 9-12 23-2 11 12Z" fill="#e5d6ae"/><path d="m40 91 9-1M116 87l9-1" stroke="#2f2f31" stroke-width="5"/>`,
      game: `<path d="M40 43Q17 46 20 90T53 93l11-8 37-2 15 15q27 14 25-18l-8-31q-6-18-30-10l-39 2Z" fill="#a5a5a7"/><path d="m40 56 11-1 1 11 11-1 1 11-12 1 1 12-11 1-1-12-11 1-1-11 12-1Z" fill="#323234"/><circle cx="112" cy="60" r="7" fill="#df8c6d"/><circle cx="126" cy="75" r="7" fill="#e4c56a"/><path d="M75 71h13M76 41Q70 14 98 14" fill="none"/>`,
      life: `<path d="m42 54 56-3-4 54-41 2Z" fill="#e6cf94"/><path d="M98 60c35-10 29 33-3 26" fill="none" stroke="#e6cf94" stroke-width="8"/><path d="M60 42c-15-13 13-19 0-32M78 40c-10-11 10-14 2-24" fill="none" stroke="#acacae"/><path d="m29 111 88-3"/><path d="m58 69 9 8 17-15" fill="none" stroke="#747476" stroke-width="4"/>`
    };
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130" fill="none" stroke="#2a2a2c" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="80" cy="117" rx="61" ry="6" fill="#131315" opacity=".23" stroke="none"/>${drawings[kind] || drawings.adventure}</svg>`;
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    svg.classList.add('qj-art'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    return document.importNode(svg, true);
  }
  const destinations = [
    ['adventure', 'The notebook', 'Your next quest', 'One page. One next step.'],
    ['campaigns', 'Project crate', 'Campaigns', 'Loops, little worlds & unfinished business.'],
    ['skills', 'Patch bay', 'Skill tree', 'Connect the things you’re getting good at.'],
    ['rewards', 'Treat machine', 'Rewards', 'Something good on the other side of done.'],
    ['collection', 'The shelf', 'Collection', 'You made these. Keep the evidence.']
  ];
  function menuNote(id) {
    const destination = destinations.find(d => d[0] === id) || destinations[0];
    const note = root?.querySelector('.qj-bench-caption');
    if (note) note.textContent = id === 'world' ? 'Paris field map / Real streets, small adventures.' : id === 'life' ? 'Life expeditions / Your real world has side quests too.' : id === 'deck' ? 'The mixtape / Find something that makes you want to begin.' : id === 'commissions' ? 'The commission wall / Make it. Show it. Take the next step.' : `${destination[1]} / ${destination[3]}`;
  }
  function syncMotion() {
    if (root) root.dataset.motion = state?.motion !== false && !document.hidden && H.activeId === 'tool:quests' ? 'on' : 'off';
  }
  const notice = text => { if (status) status.textContent = text; const local = [...(root?.querySelectorAll('dialog[open]')||[])].at(-1)?.querySelector('.qj-dialog-status'); if (local) local.textContent = text; };
  // Semantic actions only: user-authored quest titles and confirmation copy stay intact.
  const actionGroups = [
    ['settings','#bd8bff',['Journal options','Tune desk','Set my budget']],
    ['compass','#ff6b9d',['Paris after hours','Open the world map →']],
    ['reset','#e7a0ff',['Life expeditions','Life expeditions →','Explore life quests →']],
    ['dice','#ff8c42',['Pick next mission','Find my next move','Deal three more ↻','Deal again','Deal me in →']],
    ['lamp','#ffd75e',['Lamp on','Lamp off']], ['motion','#bd8bff',['Motion on','Motion off']],
    ['small','#bd8bff',['Make this smaller']],
    ['skip','#ff8c42',['Skip for now →','Skip quest','Not today','Not my thing','Park this side quest']],
    ['bookmark','#ffd75e',['Leave a starting note','Plan this next','Clear bookmark','Pin this route','Unpin route']],
    ['star','#ffd75e',['Save ♡','Saved ♥','Equip title','Equipped ✓']],
    ['edit','#bd8bff',['Edit idea','Edit friend','Edit plan','Edit','Add or edit keepsake']],
    ['pause','#ff8c42',['Pause','Let plan rest','End focus']],
    ['play','#ff6b9d',['Resume','Resume plan','Resume campaign','Resume this quest','Revisit quest']],
    ['undo','#ffd75e',['Restore card','Back to notebook','Back to my desk','Back to your adventure →']],
    ['chat','#ff6b9d',['Prepare Astra draft','Research in Astra','Prepare invitation','From a Hearth chat','Open source chat']],
    ['clock','#ff8c42',['Focus for 5 minutes']],
    ['folder','#ffd75e',['Show file','Show source file','Open proof file','Open file','View your collection','See your collection →']],
    ['shield','#bd8bff',['Show review','Review & version history','Review quest']],
    ['upload','#ff6b9d',['Upload a creation']],
    ['download','#ffd75e',['Export backup','Export pre-restore recovery copy']],
    ['plus','#bd8bff',['+ Suggest a quest','Suggest a different quest','+ Your own campaign','Create my own','+ Add a reward','+ Add a friend']],
    ['gift','#ff6b9d',['Browse reward ideas','Your treat is ready →']],
    ['target','#bd8bff',['Explore your skill tree ↗','Open my route →','Browse matching cards']],
    ['notebook','#ffd75e',['View quest','Open quest','Open quest →','Browse campaigns','Find a campaign','Browse commissions →']],
    ['close','#bfc0c8',['×','Dismiss']]
  ];
  const actionHints = {
    'Make this smaller':'Try a two-minute first step. The full finish line stays intact.',
    'Skip for now →':'Set this quest aside. Keep earlier progress; earn no completion XP.',
    'Skip quest':'Set this quest aside and return to it later.',
    'Not today':'Hide this suggestion without accepting it.',
    'Not my thing':'Tuck this card away. You can restore it below.',
    'Park this side quest':'Free a side-quest slot while keeping this quest and its progress.',
    'Leave a starting note':'Bookmark one small action for your next session.',
    'Plan this next':'Save this suggestion as the next session’s starting point.',
    'Clear bookmark':'Remove the starting note. Keep the quest and its progress.',
    'Pin this route':'Keep this specialization on your desk as a practice goal.',
    'Unpin route':'Remove the practice goal from your desk. Keep all earned titles.',
    'Save ♡':'Save this card for another day.', 'Saved ♥':'This card is saved. Click to remove its favorite.',
    'Prepare Astra draft':'Prepare an editable quest-help draft in Astra. Nothing is sent.',
    'Research in Astra':'Prepare a research draft in Astra using this plan’s dates and budget.',
    'Prepare invitation':'Write an invitation you can edit and copy. Nothing is sent.',
    'Focus for 5 minutes':'Start a five-minute focus timer for this quest.',
    'Pause':'Pause without losing your progress.', 'End focus':'Stop the timer. Keep your quest ready to resume.',
    'From a Hearth chat':'Choose an actual chat message and preview its media before keeping it.',
    'Upload a creation':'Keep an exported image, audio, video or text file on your shelf.',
    'Show file':'Reveal the original file in its folder.', 'Show source file':'Reveal the original media file in its folder.',
    'Review & version history':'See submitted evidence, critique and earlier versions.',
    'Tune desk':'Choose your callsign, accent color and workstation settings.',
    'Motion on':'Animations are on. Click to turn them off.', 'Motion off':'Animations are off. Click to turn them on.',
    'Lamp on':'The desk lamp is on. Click to dim it.', 'Lamp off':'The desk lamp is off. Click to light it.',
    'Journal options':'Back up or restore your journal, and read how XP and rewards work.',
    'Set my budget':'Set a monthly allowance for paid treats. No payment is made.',
    'Export backup':'Save your progress and reward history as a journal backup.',
    'Pick next mission':'Find a quest that fits your time and energy.',
    'Deal three more ↻':'Draw three matching briefs. Unseen cards come first.'
  };
  function decorateAction(b,text) {
    const found=actionGroups.find(g=>g[2].includes(text));
    const primary=b.classList.contains('qj-primary');
    if(!text||(!found&&!primary)||b.classList.contains('qj-field-card')||b.classList.contains('qj-field-feature'))return;
    const [kind,color]=found||[/^(Save|Create|Accept|Add|Keep)/.test(text)?'check':/proof|review/i.test(text)?'shield':'arrow','#bd8bff'];
    // Keep meaningful actions readable. Only the universal close control is icon-only;
    // an illustration or tooltip should never be needed to discover the next step.
    const compact=!!found&&!primary&&text==='×';
    b.classList.add('qj-action');b.classList.toggle('qj-action-icon',compact);b.style.setProperty('--action-color',color);
    b.setAttribute('aria-label',text==='×'?'Close dialog':text);const help=actionHints[text]||(compact?text:'');if(help&&text!=='×')b.dataset.help=help;else delete b.dataset.help;if(text==='×')b.title='Close dialog';
    b.replaceChildren(QuestAtlas.icon(kind),E('span',{class:'qj-action-text',text}),E('span',{class:'qj-glint',attrs:{'aria-hidden':'true'}}));
  }
  function actionLabel(b,text) {b.textContent=text;decorateAction(b,text);if(hintTarget===b)showHint(b);}
  function button(text, fn, cls = '', key) {
    const b=E('button', { type: 'button', class: `qj-button ${cls}`, text, ...(key ? { dataset: { focus: key } } : {}), on: { click: async e => { const b = e.currentTarget;if(b.disabled)return;let busy;try { const result=fn(e);if(result?.then){b.disabled=true;b.setAttribute('aria-busy','true');busy=setTimeout(()=>b.dataset.working='true',200);await result;} } catch (err) { notice(err.message || 'That action could not be saved.'); } finally { clearTimeout(busy);b.disabled=false;b.removeAttribute('aria-busy');delete b.dataset.working; } } } }, E('span', { class: 'qj-glint', attrs: { 'aria-hidden': 'true' } }));
    decorateAction(b,text);return b;
  }
  function glaze(parent) {
    parent.querySelectorAll('.qj-button').forEach(b => { if (!b.querySelector(':scope > .qj-glint')) b.append(E('span', { class: 'qj-glint', attrs: { 'aria-hidden': 'true' } })); });
  }
  let hintLayer, hintTarget, hintTimer;
  function hideHint() {
    clearTimeout(hintTimer);if(hintLayer?.matches(':popover-open'))hintLayer.hidePopover();
    hintTarget?.removeAttribute('aria-describedby');hintTarget=null;
  }
  function showHint(target) {
    if(!target?.dataset.help||target.disabled||!target.isConnected)return;
    clearTimeout(hintTimer);hintTarget?.removeAttribute('aria-describedby');hintTarget=target;
    hintLayer.textContent=target.dataset.help;hintLayer.style.setProperty('--hint-color',getComputedStyle(target).getPropertyValue('--action-color')||getComputedStyle(target).getPropertyValue('--path')||'#bd8bff');
    target.setAttribute('aria-describedby',hintLayer.id);if(!hintLayer.matches(':popover-open'))hintLayer.showPopover();
    const r=target.getBoundingClientRect(),t=hintLayer.getBoundingClientRect(),gap=9;
    hintLayer.style.left=Math.max(10,Math.min(window.innerWidth-t.width-10,r.left+(r.width-t.width)/2))+'px';
    hintLayer.style.top=(r.top-t.height-gap>=10?r.top-t.height-gap:Math.min(window.innerHeight-t.height-10,r.bottom+gap))+'px';
  }
  function setupHints() {
    hintLayer=E('div',{class:'qj-help-tooltip',attrs:{id:'qj-shared-help',popover:'manual',role:'tooltip'}});root.append(hintLayer);
    const schedule=()=>{clearTimeout(hintTimer);hintTimer=setTimeout(()=>{if(!hintTarget?.matches(':hover,:focus-visible')&&!hintLayer.matches(':hover'))hideHint();},160);};
    root.addEventListener('pointerover',e=>{const target=e.target.closest('[data-help]');if(target&&target!==hintTarget)showHint(target);});
    root.addEventListener('focusin',e=>{const target=e.target.closest('[data-help]');if(target)showHint(target);else hideHint();});
    root.addEventListener('pointerout',schedule);root.addEventListener('focusout',schedule);
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&hintTarget){hideHint();e.preventDefault();e.stopPropagation();}},true);
    root.addEventListener('click',()=>hideHint());root.addEventListener('scroll',e=>{if(e.target!==hintLayer)hideHint();},true);
    window.addEventListener('resize',hideHint);
  }
  function explain(title,text) {
    const b=button('',()=>dialog(title,body=>body.append(p(text))),'qj-explain');
    b.append(QuestAtlas.icon('info'));b.setAttribute('aria-label','About '+title);b.dataset.help=text;return b;
  }
  function statChip(kind,value,meaning) {
    const b=button('',()=>dialog(meaning,body=>body.append(p(value+' · '+meaning))),'qj-stat-chip');
    b.append(QuestAtlas.icon(kind),E('span',{text:value}));b.setAttribute('aria-label',value+' · '+meaning);b.dataset.help=meaning;return b;
  }
  function field(title, opts = {}) {
    const input = E(opts.multiline ? 'textarea' : 'input', { ...(opts.multiline ? {} : { type: opts.type || 'text' }), value: opts.value || '', attrs: { 'aria-label': title, maxlength: opts.max || 500, ...(opts.multiline ? { rows: opts.rows || 3 } : {}), ...(opts.placeholder ? { placeholder: opts.placeholder } : {}), ...(opts.type === 'number' ? { min: 1, max: 10000 } : {}) } });
    return { input, node: E('label', { class: 'qj-field' }, label(title), input) };
  }
  function meter(value, max, title, cls = '') {
    return E('div', { class: `qj-meter ${cls}`, attrs: { role: 'progressbar', 'aria-label': title, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value } }, E('i', { style: { width: `${Math.min(100, Math.max(0, value / Math.max(1, max) * 100))}%` } }));
  }
  let dialogHome = null;
  function dialog(title, build, subtitle = '') {
    // Chat/show actions may open a journal dialog while its surface is parked.
    // Keep project helpers and proof review above the workspace. Moving the journal
    // root keeps its scoped styles, nested dialogs and proof status handlers intact.
    const inProject = Boolean(window.ProjectWorkspace?.current?.());
    if (inProject && !dialogHome) { dialogHome = root.parentNode; root.classList.add('qj-portal'); document.body.append(root); }
    if (!inProject && !dialogHome && H.activeId !== 'tool:quests') activate('tool:quests');
    hideHint();const opener = document.activeElement;
    const d = E('dialog', { class: 'qj-dialog', attrs: { 'aria-label': title } });
    // (round 71, studioperf71) Chromium fires a dialog's 'close' event with the next drawn frame. When frames stall (a hidden
    // or minimized window, a slow software-GL frame under the blurred backdrop: 1 frame in 500 ms on the test box) the
    // cleanup below waited with it, and closed dialogs (the Outing desk's above all, which swaps its views) stayed in the
    // page. Closed by code, the cleanup now also runs 120 ms later if the event hasn't come yet (it runs once; the event
    // and the other listeners are unchanged). Normally the event comes first and nothing changes.
    let cleaned = false;
    const closeNow = d.close; d.close = function (...a) { const r = closeNow.apply(this, a); setTimeout(() => { if (!cleaned && !d.open) cleanup(); }, 120); return r; };
    const body = E('div', { class: 'qj-dialog-body' });
    d.append(E('header', { class: 'qj-dialog-head' }, E('div', {}, label(subtitle || 'QUEST JOURNAL'), E('h2', { text: title })), button('×', () => d.close(), 'qj-close')), body);
    // (round 65, questperf65) a modal dialog makes the whole page inert, which restyles every element drawn behind it,
    // twice (open and close): ≈ 1,150 elements on the Paris map, 20–35 ms of style forced inside the click here, 71–107 ms
    // on the owner's PC. Under the near-opaque backdrop the Studio's own page isn't drawn while a dialog is up
    // (.qj-under-dialog: content-visibility hidden, its size kept, quest-journal.css), so opening restyles only the
    // dialog; on closing the page comes back in the next frame and focus returns after it (no forced restyle in the click).
    root.append(d); d.addEventListener('close', () => cleanup());
    function cleanup() { if (cleaned) return; cleaned = true; hideHint();d.remove(); // (studioperf71) once: the 'close' event, or the fallback above
      const last = !root.querySelector('dialog.qj-dialog[open]'); if (last) { root.classList.remove('qj-under-dialog'); document.documentElement.classList.remove('qj-modal-up'); } // (dialogperf68) html.qj-modal-up: tools/quest-mapfirst.css
      if (last && dialogHome) { dialogHome.append(root); dialogHome = null; root.classList.remove('qj-portal'); }
      const back = () => { if (root.querySelector('dialog[open]')) return; const now = document.activeElement; if (now && now !== document.body && now.isConnected) return; /* (questfix65) only when nothing has focus yet: a control focused in the meantime (or one in another dialog) keeps it */ if (opener?.isConnected) opener.focus(); else root.querySelector('[data-focus="current"]')?.focus(); };
      if (last) requestAnimationFrame(() => setTimeout(back)); else if (opener?.isConnected) opener.focus(); }
    build(body, d); body.append(E('p', { class: 'qj-dialog-status', attrs: { role: 'status', 'aria-live': 'polite' } })); glaze(d); root.classList.add('qj-under-dialog'); if (!dialogHome && window.QuestMapFirst?.modalSkip?.()) document.documentElement.classList.add('qj-modal-up'); /* (dialogperf68) the rail, side panel, bars and other surfaces skip style under the dialog too (tools/quest-mapfirst.css) */ d.showModal(); return d;
  }
  function mutate(fn, message = 'Progress saved.', { paint = true } = {}) {
    const task = saving.catch(() => {}).then(async () => {
      if (!writable) throw Error('The journal is read-only until it can be loaded safely.');
      const draft = C.clone(state), result = await fn(draft); draft.updatedAt = new Date().toISOString();
      const checked = C.validate(draft);
      const r = await window.hub.kvSet(KEY, checked); if (r?.error) throw Error(r.error);
      state = checked; if(paint)render(); if(message)notice(message); announce('studio'); return result;
    });
    saving = task; return task;
  }
  // (round 61, questhud61) the rail's quest tracker (questhud.js) follows the journal live: every save and load is
  // announced as 'hearth:quests' { state, source }. A save announced by someone else (the tracker writes the journal
  // itself only while the Studio isn't holding it) is adopted after any save in flight, so the two never overwrite.
  function announce(source) { try { document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: C.clone(state), source } })); } catch { /* a listener's problem never blocks a save */ } }
  document.addEventListener('hearth:quests', e => { const next = e.detail?.state; if (!next || String(e.detail.source).startsWith('studio') || !writable) return; saving = saving.catch(() => {}).then(() => { try { state = C.validate(next); render(); } catch { /* keep ours */ } }); });
  async function load() {
    writable = false;
    try {
      const result = await window.hub.kvGet(KEY, null, { status: true });
      if (result?.state === 'missing') state = C.initial();
      else if (result?.state === 'ok') state = C.validate(result.value);
      else throw Error(result?.error || 'The journal could not be read.');
      state = C.upgrade(state);
      writable = true; render(); notice('Journal saved on this computer.'); announce('studio-load');
    } catch (err) { content.replaceChildren(E('section', { class: 'qj-empty' }, label('YOUR PROGRESS IS PRESERVED'), E('h2', { text: 'Let’s reconnect your journal' }), p(`${calmError(err)} Nothing has been overwritten.`), button('Try loading again', load))); notice('Saving is disabled while the journal is unavailable.'); }
  }
  function celebrate(title, text, gains = []) {
    lastCelebration = { title, text, gains };
    const card = E('div', { class: 'qj-celebrate', attrs: { role: 'status' } }, E('span', { class: 'qj-celebrate-mark', text: '✦' }), E('div', {}, E('strong', { text: title }), p(text), gains.length ? E('div', { class: 'qj-gains' }, ...gains.map(text => E('span', { text }))) : null), button('Dismiss', () => card.remove(), 'qj-quiet'));
    if (gains.some(x => x.startsWith('Title earned:'))) card.querySelector('.qj-gains').append(button('See titles →', () => { card.remove(); navigate('skills'); }, 'qj-quiet'));
    root.querySelector('.qj-celebrate')?.remove(); root.append(card);
    setTimeout(() => card.remove(), gains.length ? 12000 : 6500);
  }
  function render() {
    if (!state || !content) return;
    needsRender = true; if (!visible()) return;
    cancelAnimationFrame(paintFrame); paintFrame = 0; needsRender = false;
    cancelAnimationFrame(searchFrame); searchFrame = 0;
    hideHint();
    root.dataset.view = page;
    root.style.setProperty('--qj-signal', C.consoleAccents.find(a => a.id === state.workstation.accent).color);
    root.dataset.lamp = state.workstation.lamp ? 'on' : 'off';
    const title = C.activeTitle(state), consoleName = root.querySelector('.qj-console-name'), trophy = root.querySelector('.qj-desk-trophy'), lamp = root.querySelector('.qj-lamp-toggle');
    if (consoleName) consoleName.textContent = `${state.workstation.callsign} / ${title?.name || 'Independent creator'}`;
    if (trophy) { trophy.replaceChildren(...(title ? [art(title.art), label(title.name)] : [])); trophy.hidden = !title; }
    if (lamp) { actionLabel(lamp,state.workstation.lamp ? 'Lamp on' : 'Lamp off'); lamp.setAttribute('aria-pressed', String(state.workstation.lamp)); }
    const focused = root.contains(document.activeElement) ? document.activeElement?.dataset.focus : null;
    const totals = C.stats(state), lv = totals.level;
    root.querySelector('.qj-profile')?.remove();
    const profile = E('div', { class: 'qj-profile' }, E('div', { class: 'qj-level', attrs: { 'aria-label': `Level ${lv.n}` }, text: String(lv.n) }), E('div', { class: 'qj-level-info' }, label(`LEVEL ${lv.n} · ${lv.n < 3 ? 'THE BEGINNING' : lv.n < 6 ? 'FINDING YOUR WAY' : 'MAKING YOUR MARK'}`), E('div', { class: 'qj-xp-line' }, E('strong', { text: `${totals.xp.toLocaleString()} XP` }), E('span', { text: `${lv.left} to level ${lv.n + 1}` })), meter(totals.xp - lv.base, lv.end - lv.base, 'Level progress')), E('div', { class: 'qj-wallet', attrs: { title: 'Earn one spark for every five XP. Redeeming rewards never spends XP.' } }, E('b', { text: `✧ ${totals.sparks}` }), label('SPARKS')));
    root.querySelector('.qj-top').append(profile);
    root.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
    root.querySelectorAll('[data-nav-group]').forEach(b => b.classList.toggle('is-current', b.dataset.navGroup === navGroup(page)));
    menuNote(page);refreshNavigation();
    const rewardCount = root.querySelector('[data-page="rewards"] .qj-object-count');
    if (rewardCount) rewardCount.textContent = `${totals.sparks} sparks`;
    const motion = root.querySelector('.qj-motion');
    if (motion) { actionLabel(motion,state.motion === false ? 'Motion off' : 'Motion on'); motion.setAttribute('aria-pressed', String(state.motion !== false)); }
    syncMotion();
    // (round 65, questperf65) the map page re-rendered while on the map page (a save, a layer chip, a show list arriving)
    // keeps its mounted map: everything around it is rebuilt, its pins are diffed (QuestAtlas update) instead of the
    // whole map torn down and rebuilt, which cost a full page layout on every click (87–131 ms on the owner's PC).
    const keepWorld = page === 'world' && atlasView && worldKeep?.layout.parentNode === content ? worldKeep : null; worldKeep = null;
    if (keepWorld) { for (const n of [...content.childNodes]) if (n !== keepWorld.layout) n.remove(); }
    else { atlasView?.destroy(); atlasView = null; content.replaceChildren(); }
    content.classList.toggle('qj-dashboard', page === 'adventure');
    if (page === 'catalog') catalog(); else if (page === 'adventure') adventure(); else if (page === 'life') lifeBoard(); else if (page === 'world') worldMap(keepWorld); else if (page === 'deck') mixtape(); else if (page === 'commissions') commissions(); else if (page === 'campaigns') campaigns(); else if (page === 'skills') tree(); else if (page === 'rewards') rewards(); else collection();
    if (focused && !root.querySelector('dialog[open]')) [...root.querySelectorAll('[data-focus]')].find(b => b.dataset.focus === focused)?.focus({ preventScroll: true });
    glaze(root); tick();
  }
  function sectionHeading(eyebrow, title, description, action) {
    return E('header', { class: 'qj-section-head' }, E('div', {}, label(eyebrow), E('h2', { text: title }), description ? explain(title,description) : null), action || null);
  }
  function track(c) { return mutate(s => { const found = s.campaigns.find(x => x.id === c.id); found.paused = false; s.active = c.id; }, 'Main quest tracked. You only need the next step.'); }
  function guidedSummary(q) {
    const progress = window.QuestGuide?.summary?.(q.id);
    const node = E('div', {class:'qj-guided-summary', dataset:{guidedQuest:q.id}});
    if (progress?.total) node.append(label(`${progress.completed} / ${progress.total} STEPS`), p(typeof progress.next === 'string' ? progress.next : progress.next?.title || 'Ready for your next step.'), meter(progress.completed, progress.total, 'Guided quest progress'));
    else node.hidden = true;
    return node;
  }
  document.addEventListener('questguide:changed', () => {
    if (!state || !root?.isConnected) return;
    root.querySelectorAll('[data-guided-quest]').forEach(node => {
      const q = C.find(state, node.dataset.guidedQuest); if (q) node.replaceWith(guidedSummary(q));
    });
  });
  const navGroup = id => id === 'world' ? 'map' : ['skills','rewards','collection'].includes(id) ? 'progress' : 'quests';
  let refreshNavigation = () => {};
  function navigation(menu) {
    const nav=E('nav',{class:'qj-command-nav qj-life-nav',attrs:{'aria-label':'Life sections'}}),tabs=E('div',{class:'qj-command-tabs'}),panels=E('div',{class:'qj-command-panels'});
    const extra=pattern=>window.ClickFirst?.questItems?.().find(x=>x?.action&&pattern.test(x.label))?.action();
    const recaps=()=>dialog('Your memories',body=>{for(const item of window.ClickFirst?.questItems?.()||[])if(item?.action&&/review|month|went to/i.test(item.label))body.append(button(item.label,()=>{body.closest('dialog').close();return item.action();},'qj-command-link'));});
    const groups=[
      {id:'quests',name:'Today',icon:'notebook',page:'adventure',items:[['Find a quest','catalog'],['Find a small step',sessionPicker],['This week',()=>extra(/Plan my week/)]]},
      {id:'map',name:'Map',icon:'compass',page:'world',items:[['Plan an outing',()=>window.OutingGuide?.open()],['My plans',savedPlans],['Friends',()=>mapNotebook('friends')],['Places',()=>mapNotebook('places')],['Add a place',()=>placeForm(atlasView?.center()||{})]/* (lifechecks70) the redesign left only a double-click on the map to pin your own place: its link is back */,['Events',()=>outingDesk()],['Make a walk',()=>extra(/Make a walk/)]]},
      {id:'progress',name:'Progress',icon:'spark',page:'collection',items:[['Collection','collection'],['Skills','skills'],['Rewards','rewards'],['Memories',recaps]]}
    ];
    for(const g of groups){
      const tab=button(g.name,()=>navigate(g.page),'qj-command-tab');tab.dataset.navGroup=g.id;tab.prepend(QuestAtlas.icon(g.icon));tabs.append(tab);
      const panel=E('div',{class:'qj-command-panel',dataset:{group:g.id},hidden:true});
      for(const [name,action] of g.items){const b=button(name,typeof action==='string'?()=>navigate(action):action,'qj-command-link');if(typeof action==='string')b.dataset.page=action;panel.append(b);}
      if(g.id==='map')panel.append(E('div',{class:'qj-command-map-extras'}));panels.append(panel);
    }
    tabs.append(button('Settings',()=>dialog('Life settings',body=>body.append(button('Personalize',deskSettings),button(state.workstation.lamp?'Dim lamp':'Light lamp',()=>mutate(s=>{s.workstation.lamp=!s.workstation.lamp;})),button(state.motion===false?'Enable motion':'Reduce motion',()=>mutate(s=>{s.motion=s.motion===false;})),button('Journal & backups',()=>{body.closest('dialog').close();menu.click();}))), 'qj-life-settings'));
    refreshNavigation=()=>{const id=navGroup(page);nav.dataset.open=id;for(const tab of tabs.querySelectorAll('[data-nav-group]'))tab.setAttribute('aria-current',tab.dataset.navGroup===id?'page':'false');for(const panel of panels.children)panel.hidden=panel.dataset.group!==id;};
    tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;const all=[...tabs.querySelectorAll('[data-nav-group]')],i=all.indexOf(e.target);if(i<0)return;e.preventDefault();all[(i+(e.key==='ArrowRight'?1:all.length-1))%all.length].focus();});
    nav.append(tabs,panels);refreshNavigation();return nav;
  }
  async function savedPlans(){
    dialog('My plans',async body=>{
      body.append(button('+ Plan an outing',()=>{body.closest('dialog').close();return window.OutingGuide?.open();},'qj-primary'));
      const list=E('div',{class:'qj-plan-list'});body.append(list);
      const add=(title,detail,fn)=>list.append(button(title+' · '+detail,()=>{body.closest('dialog').close();return fn();},'qj-field-list-item'));
      for(const plan of state.world.plans){const c=state.campaigns.find(c=>c.id===`c-world-${plan.id}`);add(plan.title,plan.status==='archived'?'Resting':c?c.quests.filter(q=>C.done(state,q.id)).length+'/3 done':plan.date||'Date open',()=>worldPlanDetail(plan.id));list.lastChild.dataset.plan=plan.id;} /* (lifechecks70) a plan made into a quest shows its progress (and a resting plan says so), as the old Saved plans notebook did */
      try{
        const r=await window.hub.kvGet('sidequest-outings-v1');
        for(const plan of r?.saved||[])add(plan.event.title,'Saved outing',()=>outingDesk({tab:'saved',eventId:plan.event.id}));
        if(window.OutingGuide){const r=await OutingGuide.call({op:'state'});for(const plan of r.plans||[])add(plan.title,'Route & reminders',()=>OutingGuide.open({id:plan.id}));}
        if(!list.children.length)list.append(p('Save a place or a night from the map to start planning.'));
      }catch(err){list.append(p('Some plans could not load. '+calmError(err)));}
    });
  }
  let catalogFilter={path:'all',format:'all',query:''};
  function catalog(){
    content.append(sectionHeading('LIFE / QUESTS','Find your next thing',null,button('+ Your own',newCampaign,'qj-primary')));
    const filters=E('div',{class:'qj-catalog-filters'}),grid=E('div',{class:'qj-catalog-grid'});
    const query=E('input',{type:'search',value:catalogFilter.query,placeholder:'Search quests…',attrs:{'aria-label':'Search quests'}});
    const category=selection('Interest',[['all','All interests'],...C.paths.map(p=>[p.id,p.name])],catalogFilter.path);
    const format=selection('Length',[['all','Any length'],['small','Single quest'],['project','Several steps']],catalogFilter.format);
    filters.append(query,category.node,format.node);content.append(filters,grid);
    function paint(){
      catalogFilter={path:category.input.value,format:format.input.value,query:query.value};grid.replaceChildren();
      const matches=(path,title,text,kind)=>(catalogFilter.path==='all'||path===catalogFilter.path)&&(catalogFilter.format==='all'||kind===catalogFilter.format)&&(title+' '+text).toLowerCase().includes(query.value.trim().toLowerCase());
      const card=(id,title,text,path,meta,fn)=>{grid.append(E('article',{class:'qj-card qj-catalog-card',dataset:{catalogId:id},style:{'--path':pathOf(path).color}},E('div',{class:'qj-catalog-art'},art(path)),E('div',{},label(meta),E('h3',{text:title}),p(text),button('Open',fn,'qj-primary'))));};
      for(const c of state.campaigns){if(!matches(c.path,c.title,c.why,'project'))continue;const done=c.quests.filter(q=>C.done(state,q.id)).length;
        card(c.id,c.title,c.why,c.path,(c.paused?'Resting · ':'')+done+' / '+c.quests.length+' finished',()=>dialog(c.title,(body,d)=>{
          const next=C.next(state,c);body.append(p(c.why),E('ol',{},...c.quests.map(q=>E('li',{},C.done(state,q.id)||C.skipped(state,q.id)?button((C.done(state,q.id)?'✓ ':'↷ ')+q.title,()=>{d.close();questDetail(q.id);},'qj-quiet'):E('span',{text:q.title})))));
          body.append(button(next?(c.paused?'Resume':'Continue'):'View results',async()=>{d.close();if(!next)return navigate('collection');await track(c);questDetail(next.id);},'qj-primary'));
          if(next&&!c.paused)body.append(button('Let this rest',async()=>{await mutate(s=>{s.campaigns.find(x=>x.id===c.id).paused=true;if(s.active===c.id)s.active=null;},'Progress kept.');d.close();},'qj-quiet'));
          if(C.lifeArcs.some(x=>x.id===c.id))body.append(button('Personalize this route',()=>{d.close();lifeDetail(c.id);},'qj-quiet'));
        }));
      }
      for(const c of C.lifeArcs)if(!state.campaigns.some(x=>x.id===c.id)&&matches('life',c.title,c.why,'project'))card(c.id,c.title,c.why,'life',c.quests.length+' steps',()=>lifeDetail(c.id));
      const view={...state,deck:{...state.deck,filters:{lane:'any',mood:'any',minutes:60,shelf:'all'}}};
      for(const c of C.deckPool(view))if(matches(c.path,c.title,c.done,'small'))card(c.id,c.title,c.done,c.path,c.minutes+' min',()=>deckBrief(c.id));
      for(const q of C.daily())if(!C.find(state,q.id)&&matches(q.path,q.title,q.done,'small'))card(q.id,q.title,q.done,q.path,q.minutes+' min',()=>dialog(q.title,(body,d)=>body.append(p(q.done),button('Start',async()=>{await mutate(s=>C.trackSide(s,q));d.close();questDetail(q.id);},'qj-primary'))));
      if(!grid.children.length)grid.append(p('No quests match. Try another interest or search.'));
    }
    query.oninput=paint;category.input.onchange=format.input.onchange=paint;paint();
    const kept=E('details',{class:'qj-fold qj-catalog-kept'},E('summary',{text:'Saved ideas & cards'}));
    const before=content.children.length;ideaBox();while(content.children.length>before)kept.append(content.children[before]);
    for(const cid of new Set([...state.deck.saved,...state.deck.hidden])){const c=C.deckCard(cid);if(!c)continue;const hidden=state.deck.hidden.includes(cid);kept.append(E('div',{class:'qj-idea-row'},E('strong',{text:c.title}),button(hidden?'Restore card':'Open saved card',()=>hidden?mutate(s=>C.markCard(s,cid,'hidden'),'Card restored.'):deckBrief(cid),'qj-quiet')));}
    filters.before(kept);
  }
  function adventure() {
    const campaign = state.campaigns.find(c => c.id === state.active && !c.paused), quest = C.next(state, campaign);
    if (state.workstation.target) {
      const m = C.mastery(state, state.workstation.target);
      content.append(E('section', { class: 'qj-goal-strip qj-specialty-target', style: { '--path': pathOf(m.route.path).color } }, E('div', {}, label('PINNED SPECIALIZATION'), E('strong', { text: m.route.name }), p(m.next ? `${m.count} / ${m.next.required} reviewed finishes toward ${m.next.name}` : 'All three titles earned. The work is yours to keep.')), button('Open my route →', () => specializationDetail(m.route.id), 'qj-quiet')));
    }
    const goal = state.rewards.find(r => r.id === state.rewardGoal);
    if (goal) content.append(E('section', { class: 'qj-goal-strip' }, E('div', {}, label('SAVING TOWARD'), E('strong', { text: goal.name }), meter(Math.min(C.balance(state), goal.cost), goal.cost, 'Reward goal')), button(C.balance(state) >= goal.cost ? 'Your treat is ready →' : `${goal.cost - C.balance(state)} sparks to go →`, () => navigate('rewards'), 'qj-quiet')));
    const grid = E('div', { class: 'qj-adventure-grid' });
    const hero = E('section', { class: 'qj-hero' });
    if (quest) {
      const q = C.find(state, quest.id), path = pathOf(q.path), index = campaign.quests.findIndex(x => x.id === q.id), completed = campaign.quests.filter(x => C.done(state, x.id)).length, skipped = campaign.quests.filter(x => C.skipped(state, x.id)).length;
      hero.style.setProperty('--path', path.color);
      hero.append(E('div', { class: 'qj-hero-copy' }, label(`MAIN QUEST · ${path.name.toUpperCase()}`), E('h2', { text: q.title }), p(campaign.why), E('div', { class: 'qj-pills' }, statChip('clock',q.minutes+'m','Estimated session length'),statChip('spark',String(q.xp),'XP for completing the reviewed quest'),statChip('gift',String(q.xp/5),'Sparks earned with this quest; spend them on chosen treats')),
        guidedSummary(q), row(button(C.record(state, q.id).acceptedAt || C.record(state, q.id).startedAt || window.QuestGuide?.summary?.(q.id) ? 'Continue quest →' : 'View quest →', () => window.QuestGuide?.open ? window.QuestGuide.open(q) : questDetail(q.id), 'qj-primary', 'current'), button('Quest details', () => questDetail(q.id), 'qj-quiet'), button('Skip for now →', () => skipQuest(q.id), 'qj-quiet')),
        E('div', { class: 'qj-chapter-progress' }, E('span', { text: campaign.title }), E('b', { text: `${completed} / ${campaign.quests.length} done${skipped ? ` · ${skipped} set aside` : ''}` })), meter(completed, campaign.quests.length, 'Campaign progress')),
      E('div', { class: 'qj-quest-object', attrs: { 'aria-hidden': 'true' } }, art(q.path), E('span', { text: `FIELD KIT / ${String(index + 1).padStart(2, '0')}` })));
    } else {
      const finished = campaign && C.campaignDone(state, campaign);
      hero.append(E('div', { class: 'qj-hero-copy' }, label(finished ? 'CAMPAIGN COMPLETE' : 'A FRESH PAGE'), E('h2', { text: finished ? 'Finished. That one is yours.' : campaign ? 'A different route is fine.' : 'What’s going on the workbench?' }), p(finished ? `${campaign.title} is yours to keep. Rest here, or choose your next adventure.` : campaign ? 'Your skipped quests are in Set aside below. Revisit one whenever it fits, or choose another campaign.' : 'Pick one project from the crate, or bring your own.'), row(button('Choose a campaign →', () => navigate('campaigns'), 'qj-primary', 'current'), button('Create my own', newCampaign))), E('div', { class: 'qj-quest-object', attrs: { 'aria-hidden': 'true' } }, art('adventure')));
    }
    grid.append(hero); content.append(grid);
    if (!quest || state.plan) sessionDesk();
    const activeSides = state.sideQuests.filter(q => !q.parked && !C.done(state, q.id) && !C.skipped(state, q.id));
    const candidates = [];
    if(activeSides.length)content.append(sectionHeading('IN PROGRESS', 'Your other quests'));
    const sides = E('div', { class: 'qj-side-grid' });
    for (const q of [...activeSides, ...candidates].slice(0, Math.max(3, activeSides.length))) {
      const accepted = activeSides.includes(q), path = pathOf(q.path);
      sides.append(E('article', { class: 'qj-card qj-side', style: { '--path': path.color } }, E('div', { class: 'qj-card-top' }, E('span', { class: 'qj-path-icon', text: path.icon }), label(accepted ? 'ACCEPTED' : 'TODAY’S INVITATION')), E('h3', { text: q.title }), p(q.done), E('div', { class: 'qj-card-bottom' }, label(`${q.minutes} MIN · ${q.xp} XP`), button(accepted ? 'Continue quest →' : 'View quest →', async () => { if(window.QuestGuide?.open)return window.QuestGuide.open(q);if (!accepted) await mutate(s => C.trackSide(s, q), 'Side quest accepted.'); questDetail(q.id); }, 'qj-quiet'), button(accepted ? 'Skip quest' : 'Not today', () => accepted ? skipQuest(q.id) : mutate(s => C.dismiss(s, q), 'Suggestion set aside. No XP added.'), 'qj-quiet'))));
    }
    content.append(sides);
    const setAside = C.allQuests(state).filter(q => C.skipped(state, q.id));
    if (setAside.length) {
      const fold = E('details', { class: 'qj-fold qj-skipped' }, E('summary', { text: `Set aside · ${setAside.length} ${setAside.length === 1 ? 'quest' : 'quests'} you can revisit` }));
      for (const q of setAside) fold.append(E('div', { class: 'qj-idea-row' }, E('div', {}, E('strong', { text: q.title }), p('Skipped · no completion XP')), button('Revisit quest', async () => { await mutate(s => C.revisit(s, q.id), 'Quest restored. Your earlier progress is kept.'); navigate('adventure'); }, 'qj-quiet')));
      content.append(fold);
    }
    if (state.sideQuests.some(q => q.parked && !C.done(state, q.id) && !C.skipped(state, q.id))) {
      const parked = E('details', { class: 'qj-fold' }, E('summary', { text: 'Parked side quests · ready when you are' }));
      for (const q of state.sideQuests.filter(q => q.parked && !C.done(state, q.id) && !C.skipped(state, q.id))) parked.append(row(p(q.title), button('Resume', () => mutate(s => { if (C.sideCount(s) >= 3) throw Error('Park, skip or finish a side quest first.'); s.sideQuests.find(x => x.id === q.id).parked = false; }))));
      content.append(parked);
    }
  }
  function sessionDesk() {
    const plan = state.plan, q = plan && C.find(state, plan.quest), ready = q && C.available(state, q.id) && !C.done(state, q.id);
    const desk = E('section', { class: `qj-session-desk ${plan ? 'has-plan' : ''}` }, E('div', { class: 'qj-session-mark', attrs: { 'aria-hidden': 'true' } }, art('music')), E('div', { class: 'qj-session-copy' }, label(plan ? 'YOUR NEXT SESSION / BOOKMARKED' : 'TUNE IN / FIND YOUR NEXT MOVE'), E('h3', { text: plan ? q?.title || 'Saved session' : 'How much room have you got today?' }), p(plan ? plan.action : 'Two quiet minutes or a proper session. Pick something that fits.'), plan ? label(`${plan.minutes} MIN${ready ? ' · READY WHEN YOU ARE' : ' · QUEST PAUSED OR WAITING FOR AN EARLIER STEP'}`) : null));
    desk.append(row(ready ? button('Pick up here →', () => questDetail(q.id, plan.minutes === 2 ? 'tiny' : 'normal'), 'qj-primary') : null, button('Find my next move', sessionPicker, ready ? 'qj-quiet' : 'qj-primary'), plan ? button('Clear bookmark', () => mutate(s => { s.plan = null; }, 'Bookmark cleared. Quest progress is unchanged.'), 'qj-quiet') : null));
    content.append(desk);
  }
  function sessionPicker() {
    dialog('Find your next move', (body, d) => {
      const minutes = E('select', { attrs: { 'aria-label': 'Time available' } }, ...[2, 5, 15, 30].map(n => E('option', { value: String(n), text: `${n} minutes` }))); minutes.value = '5';
      const energy = E('select', { attrs: { 'aria-label': 'Energy today' } }, E('option', { value: 'steady', text: 'Ready to make something' }), E('option', { value: 'low', text: 'Just help me start' }));
      const path = E('select', { attrs: { 'aria-label': 'What sounds good' } }, E('option', { value: 'any', text: 'Any path' }), ...C.paths.map(p => E('option', { value: p.id, text: p.name })));
      const results = E('div', { class: 'qj-picks', attrs: { 'aria-label': 'Suggested next moves', 'aria-live': 'polite' } });
      const paint = () => {
        const picks = C.recommend(state, { minutes: Number(minutes.value), energy: energy.value, path: path.value });
        results.replaceChildren();
        for (const pick of picks) {
          const open = async planned => {
            const q = await mutate(s => { const chosen = C.choose(s, pick); if (planned) C.planQuest(s, chosen.id, pick.action, pick.minutes); return chosen; }, planned ? 'Next session bookmarked. No XP added.' : 'Quest ready. No XP added.');
            d.close(); if (planned) navigate('adventure'); else questDetail(q.id, pick.mode);
          };
          results.append(E('article', { class: 'qj-pick', style: { '--path': pathOf(pick.path).color } }, label(`${pathOf(pick.path).name} · ${pick.minutes} MIN${pick.mode === 'tiny' ? ' START' : ''}`), E('h3', { text: pick.title }), p(pick.action, 'qj-pick-action'), p(pick.reason), row(button('Try this now', () => open(false), 'qj-primary'), button('Plan this next', () => open(true), 'qj-quiet'))));
        }
        if (!picks.length) results.append(p('No available quest on this path right now. Free a side-quest slot, resume a campaign, or try another path.'), button('Browse campaigns', () => { d.close(); navigate('campaigns'); }, 'qj-quiet'));
      };
      for (const select of [minutes, energy, path]) select.addEventListener('change', paint);
      body.append(E('div', { class: 'qj-picker-controls' }, E('label', { class: 'qj-field' }, label('TIME'), minutes), E('label', { class: 'qj-field' }, label('ENERGY'), energy), E('label', { class: 'qj-field' }, label('PATH'), path)), p('Picks come from your available quests, saved ideas and today’s suggestions. Choosing an idea or daily suggestion accepts it onto your side-quest board; no XP is earned just for choosing.'), results); paint();
    }, 'ONE GOOD NEXT STEP');
  }
  function planNote(qid) {
    const q = C.find(state, qid), old = state.plan?.quest === qid ? state.plan : null;
    dialog('Leave yourself a starting note', (body, d) => {
      const action = field('When I come back, start by…', { value: old?.action || state.tiny[qid] || q.tiny, max: 500, multiline: true });
      const minutes = E('select', { attrs: { 'aria-label': 'Next session length' } }, ...[...new Set([2, 5, 15, 30, old?.minutes || 5])].sort((a, b) => a - b).map(n => E('option', { value: String(n), text: `${n} minutes` }))); minutes.value = String(old?.minutes || 5);
      body.append(action.node, E('label', { class: 'qj-field' }, label('SESSION LENGTH'), minutes), p('One bookmark at a time. It replaces the previous starting note, keeps your quest progress, and waits here without a deadline.'), button('Save starting note', async () => { await mutate(s => C.planQuest(s, qid, action.input.value, Number(minutes.value)), 'Starting note saved for your next session.'); d.close(); navigate('adventure'); }, 'qj-primary'));
    }, 'MAKE COMING BACK EASIER');
  }
  async function skipQuest(qid) { await mutate(s => C.skip(s, qid), 'Quest set aside. No completion XP added. You can revisit it below.'); if (!root.querySelector('dialog[open]')) root.querySelector('[data-focus="current"]')?.focus({ preventScroll: true }); }
  function ideaBox() {
    const ideas = (state.ideas || []).filter(i => !i.questId);
    const box = E('section', { class: 'qj-idea-box' }, E('header', {}, E('div', {}, label('NEXT TIME / YOUR IDEA BOX'), E('h3', { text: ideas.length ? `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} waiting for you` : 'Leave yourself a good next quest.' }), explain('Your next ideas','A sample to chop, a scene to try, something outside the studio. Save it here for when you feel like it.')), button('+ Suggest a quest', () => ideaForm(), 'qj-primary')));
    const extra = E('details', { class: 'qj-fold' }, E('summary', { text: `See ${Math.max(0, ideas.length - 3)} more ideas` }));
    ideas.forEach((i, n) => {
      const item = E('article', { class: 'qj-idea-row', style: { '--path': pathOf(i.path).color } }, E('span', { class: 'qj-path-icon', text: pathOf(i.path).icon }), E('div', {}, E('strong', { text: i.title }), p(`${i.minutes} min · ${i.goal}`)), row(button('Make this my quest', async () => { const q = await mutate(s => C.startIdea(s, i.id), 'Your idea is now a side quest.'); questDetail(q.id); }), button('Edit idea', () => ideaForm(i), 'qj-quiet')));
      (n < 3 ? box : extra).append(item);
    });
    if (ideas.length > 3) box.append(extra); content.append(box);
  }
  function ideaForm(idea) {
    dialog(idea ? 'Edit your next quest' : 'What would you like to try next?', (body, d) => {
      const title = field('Quest idea', { value: idea?.title, max: 150, placeholder: 'Make a drum loop from sounds in my kitchen' }), goal = field('A small finish line', { value: idea?.goal, max: 500, multiline: true, placeholder: 'Save one eight-bar loop. Rough is fine.' });
      const path = E('select', { attrs: { 'aria-label': 'Idea skill path' } }, ...C.paths.map(p => E('option', { value: p.id, text: p.name }))); path.value = idea?.path || 'music';
      const minutes = E('select', { attrs: { 'aria-label': 'Idea quest size' } }, ...[5, 15, 30].map(n => E('option', { value: String(n), text: `${n} minutes · ${n === 5 ? 20 : n === 15 ? 35 : 50} XP when finished` }))); minutes.value = String(idea?.minutes || 15);
      body.append(title.node, goal.node, E('label', { class: 'qj-field' }, label('PATH'), path), E('label', { class: 'qj-field' }, label('SIZE'), minutes), p('This stays in Next time until you choose it. Saving or accepting an idea earns no XP.'), button('Save for next time', async () => { await mutate(s => C.saveIdea(s, { id: idea?.id, title: title.input.value, goal: goal.input.value, path: path.value, minutes: Number(minutes.value) }), 'Idea tucked away for next time.'); d.close(); }, 'qj-primary'));
      if (idea) body.append(button('Remove idea', async () => { await mutate(s => { s.ideas = s.ideas.filter(i => i.id !== idea.id); }, 'Unused idea removed.'); d.close(); }, 'qj-quiet'));
    }, 'NO DEADLINE. JUST A POSSIBILITY.');
  }
  function mapDrawing() {
    // Authored geometry only. Names and saved notes are separate text nodes.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" fill="none" aria-hidden="true">
      <defs><pattern id="qj-city-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" stroke="#ffffff06"/></pattern><linearGradient id="qj-river" x2="1" y2="1"><stop stop-color="#65506e"/><stop offset="1" stop-color="#352f40"/></linearGradient></defs>
      <rect width="1000" height="600" fill="#15171e"/><rect width="1000" height="600" fill="url(#qj-city-grid)"/>
      <g fill="#292b34" stroke="#4a4654" stroke-width="2"><path d="M70 70 270 50 290 210 95 235Z"/><path d="m335 45 190 10-30 120-160 25Z"/><path d="m560 50 245 10-20 130-240 30Z"/><path d="m60 380 255-40 60 195-245 30Z"/><path d="m375 375 175 15 30 160-200-5Z"/><path d="m620 370 260-35 50 190-250 35Z"/></g>
      <g stroke="#ffffff15" stroke-width="11"><path d="M40 260 290 225 560 230 960 155M300 0 310 215M540 0 515 240M50 335 315 300 600 330 950 300M340 345 350 580M605 355 630 600M900 0 840 250"/></g>
      <path d="M-30 460C120 440 150 280 310 285S540 355 660 270 810 240 1030 170" stroke="#9a7c9d33" stroke-width="65"/><path d="M-30 460C120 440 150 280 310 285S540 355 660 270 810 240 1030 170" stroke="url(#qj-river)" stroke-width="52"/>
      <path class="qj-map-current" d="M-30 460C120 440 150 280 310 285S540 355 660 270 810 240 1030 170" stroke="#dab8e1" stroke-opacity=".35" stroke-dasharray="3 22" stroke-width="2"/>
      <g stroke="#a59c9a" stroke-width="14"><path d="m205 278 38 70M505 277l-8 73M738 215l18 63"/></g><g stroke="#292932" stroke-width="3"><path d="m205 278 38 70M505 277l-8 73M738 215l18 63"/></g>
      <g fill="#4b4454" stroke="#797080"><path d="m355 245 18-69 18 69-18-10Z"/><path d="m363 208 21 0m-25 20h29"/><path d="m800 91 22-16 22 16v35h-44Z"/><path d="m80 495 30-18 30 18v27H80Z"/></g>
      <g fill="#443e42" stroke="#7a6b6c"><circle cx="580" cy="120" r="22"/><circle cx="610" cy="102" r="17"/><circle cx="630" cy="132" r="20"/><circle cx="145" cy="86" r="16"/><circle cx="111" cy="96" r="20"/><circle cx="874" cy="472" r="23"/></g>
      <g fill="#f4c77d"><rect x="113" y="181" width="7" height="9"/><rect x="130" y="181" width="7" height="9"/><rect x="400" y="100" width="7" height="9"/><rect x="416" y="100" width="7" height="9"/><rect x="808" y="98" width="7" height="9"/><rect x="829" y="98" width="7" height="9"/><rect x="95" y="500" width="7" height="9"/><rect x="115" y="500" width="7" height="9"/></g>
      <g stroke="#8c7b96" stroke-width="2" stroke-dasharray="5 7"><path d="M870 250 960 320 1005 300M865 262l95 70 45-20"/></g>
      <path d="m924 45 0 35m-9-20 9-15 9 15" stroke="#d2b6db" stroke-width="2"/><text x="924" y="99" text-anchor="middle" fill="#a895b1" font-family="monospace" font-size="12">N</text>
      <text x="36" y="570" fill="#8a8095" font-family="monospace" font-size="11" letter-spacing="3">PARIS // REIMAGINED</text><text x="565" y="292" fill="#cbb3d0" font-family="serif" font-style="italic" font-size="17" transform="rotate(-18 565 292)">la Seine des songes</text>
    </svg>`;
    return document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true);
  }
  function mapIcon(kind, title, fn, color, pressed, focusKey) {
    const b=button('',fn,'qj-icon-button'); b.append(QuestAtlas.icon(kind)); b.setAttribute('aria-label',title);if(focusKey)b.dataset.focus=focusKey;
    if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
    const tip=E('span',{class:'qj-icon-tip',text:title,attrs:{role:'tooltip',id:'qj-tip-'+(++tooltipSeq)}});
    b.setAttribute('aria-describedby',tip.id);
    const wrap=E('span',{class:'qj-tip-wrap',style:{'--icon-color':color||'#bd8bff'}},b,tip);
    wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){wrap.dataset.dismissed='true';e.stopPropagation();}});
    wrap.addEventListener('pointerleave',()=>delete wrap.dataset.dismissed);
    b.addEventListener('blur',()=>delete wrap.dataset.dismissed);
    return wrap;
  }
  const mapKind = place => C.mapKinds.find(k=>k.id===C.placeKind(place));
  let previewPlace=null,paintActivePlace=null;
  function paintPlace(id){hideHint();paintActivePlace?.(id);atlasView?.select(id);}
  function mapPick(id, center=false) {
    const place=state.atlas.places.find(p=>p.id===id);if(!place)return Promise.reject(Error('Place not found.'));
    previewPlace=id;paintPlace(id);if(center)atlasView?.focus(place);
    const pinButton=root.querySelector('.qj-atlas [data-place="'+id+'"]');if(pinButton&&pinButton!==document.activeElement)pinButton.focus({preventScroll:true}); // (round 65, questperf65) a clicked pin already has focus: no second focus (it forced a style pass)
    return mutate(s=>{s.atlas.selected=id;},'',{paint:false}).then(()=>{if(previewPlace===id)previewPlace=null;},err=>{if(previewPlace===id){previewPlace=null;paintPlace(state.atlas.selected);}throw err;});
  }
  // (round 64, mapfirst64) QuestMapFirst.keep: the map's layer chips (Places off hides untouched guide pins, Visited off hides visited ones).
  // parisquests61: mapFilter.guide (a Paris guide word: tag, arrondissement…) and guide words in search come from tools/quest-paris-ui.js.
  function mapPlaces() {const query=mapFilter.query.toLocaleLowerCase(),PG=window.QuestParisUI;return state.atlas.places.filter(p=>(mapFilter.kind==='all'||C.placeKind(p)===mapFilter.kind)&&(!mapFilter.saved||p.favorite)&&(!mapFilter.guide||!PG||PG.keep(p,mapFilter.guide))&&(!window.QuestMapFirst||QuestMapFirst.keep(p,state,mapFilter))&&(!query||(p.name+' '+p.quest+' '+(PG?.words(p)||'')).toLocaleLowerCase().includes(query)));}
  function centerMapSelection() {const places=mapPlaces(),place=places.find(p=>p.id===state.atlas.selected)||places[0];if(place)atlasView?.focus(place);}
  function outingDesk(options = {}) {
    return OutingDesk.open({dialog,button,field,explain,friends:()=>state.world.friends,openQuest:questDetail,
      quest:async plan=>{const c=await mutate(s=>OutingCore.campaign(s,plan,C),'Take-home quest ready. Proof and review unlock its XP.');return c.quests[0].id;},
      pin:async event=>{await mutate(s=>{const existing=s.atlas.places.find(p=>Math.abs(p.lat-event.lat)<.0002&&Math.abs(p.lon-event.lon)<.0002)||window.QuestParis?.spotPin?.(s,{name:event.venue||event.title,lat:event.lat,lon:event.lon});/* (round 64, parisdedupe64) the same venue already on the map or in the Paris guide (≤ 120 m, same name word) → that pin, not a second one */if(existing)s.atlas.selected=existing.id;else C.savePlace(s,{name:event.venue||event.title,lat:event.lat,lon:event.lon,kind:['music','visual','game'].includes(event.kind)?event.kind:'reset',quest:'Find one detail here to bring into your next creation.'});},'Venue pinned.');mapFilter={kind:'all',saved:false,query:''};navigate('world');}
    },options);
  }
  function worldMap(keep = null) {
    const before = n => { if (keep) content.insertBefore(n, keep.layout); else content.append(n); }; // (round 65, questperf65) above a kept map
    OutingDesk.ensureMap().catch(err=>notice(err.message));
    window.QuestMapFirst?.open(); // (round 64, mapfirst64) the guide's places + this week's shows come by default when the map opens (tools/quest-mapfirst.js)
    const kind=mapFilter.kind,visible=mapPlaces();
    const selected=visible.find(p=>p.id===(previewPlace||state.atlas.selected))||visible[0];
    const head=row();
    // (round 61, showsync61) map layers: their icon joins this row, their pins join the map
    const layerKit={dialog,mapIcon,button,p,label,E,mutate,questDetail,navigate,notice},layerPins=[],layerLines=[]; // layerLines: (round 63, questwalk63) a layer's lines() → polylines on the map
    for(const layer of mapLayers){try{const icon=layer.icon?.(layerKit);if(icon)head.append(icon);if(window.QuestMapFirst?.off(layer.id))continue;/* (round 64, mapfirst64) a layer chip that's off */layerPins.push(...(layer.pins?.(mapFilter)||[]));layerLines.push(...(layer.lines?.()||[]));}catch(err){console.warn('[quest map layer]',layer.id,err);}}
    const extras=root.querySelector('.qj-command-map-extras');
    if(extras){extras.replaceChildren(...head.children);extras.querySelectorAll('button').forEach(b=>{const text=b.getAttribute('aria-label')||b.title;if(text&&!b.querySelector('.qj-command-label'))b.append(E('span',{class:'qj-command-label',text}));});}
    before(sectionHeading('FH / FIELD KIT','Paris, at your pace.'));
    const todayEntry=window.QuestParisUI?.todayEntry();if(todayEntry)before(todayEntry);
    const filters=E('div',{class:'qj-map-filters qj-command-map-filters',attrs:{'aria-label':'Filter map places'}});
    const category=E('select',{attrs:{'aria-label':'Place category'},dataset:{focus:'map-category'}},...[{id:'all',name:'All places'},...C.mapKinds].map(k=>E('option',{value:k.id,text:k.name})));
    category.value=kind;category.addEventListener('change',()=>{mapFilter.kind=category.value;navigate('world');centerMapSelection();});
    const saved=button(mapFilter.saved?'Favorites only ✓':'Favorites',()=>{mapFilter.saved=!mapFilter.saved;navigate('world');centerMapSelection();},'qj-command-link','map-favorites');saved.setAttribute('aria-pressed',String(mapFilter.saved));
    filters.append(category,saved);
    // Keep the actual input (focus, caret and IME composition) across filtered map updates.
    const search=root.querySelector('[data-focus="map-search"]') || E('input',{type:'search',value:mapFilter.query,attrs:{'aria-label':'Find a saved place',placeholder:'Find a place…',maxlength:120},dataset:{focus:'map-search'}});
    if(search.value!==mapFilter.query)search.value=mapFilter.query;
    search.oninput=event=>{mapFilter.query=search.value;if(!event.isComposing)scheduleMapSearch();};
    search.oncompositionend=()=>{mapFilter.query=search.value;scheduleMapSearch();};
    const matches=E('div',{class:'qj-map-matches',attrs:{'aria-label':'Matching places'}});
    const clearSearch=()=>{search.value='';mapFilter.query='';worldKeep?.search();search.focus({preventScroll:true});};
    search.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'&&search.value){event.preventDefault();event.stopPropagation();clearSearch();}else if(['Enter','ArrowDown'].includes(event.key)&&search.value.trim()){event.preventDefault();worldKeep?.search();const first=matches.querySelector('[data-map-match]');if(event.key==='Enter')first?.click();else first?.focus();}};
    const surprise=mapIcon('dice','Pick somewhere for me',async()=>{const visible=mapPlaces(),pool=visible.filter(p=>p.id!==(previewPlace||state.atlas.selected)&&!p.visitedAt),fallback=visible.filter(p=>p.id!==(previewPlace||state.atlas.selected)),choices=pool.length?pool:fallback;if(choices.length)await mapPick(choices[Math.floor(Math.random()*choices.length)].id,true);},'#ff8c42');
    surprise.querySelector('button').disabled=visible.length<2;
    filters.append(search,surprise);
    for(const layer of mapLayers){try{if(window.QuestMapFirst?.ownsChip(layer.id))continue;/* (round 64, mapfirst64) My Paris is the map strip's Visited chip */const c=layer.chip?.(layerKit);if(c)filters.append(c);}catch(err){console.warn('[quest map layer]',layer.id,err);}} // (round 64, parisjournal64) a layer's chip(kit) → one labelled toggle in this row (My Paris)
    if(mapFilter.guide&&window.QuestParisUI)filters.append(QuestParisUI.chip(mapFilter.guide,()=>{delete mapFilter.guide;render();centerMapSelection();})); // parisquests61
    filters.append(matches);
    const mapPanel=root.querySelector('[data-group="map"]');mapPanel?.querySelector('.qj-command-map-filters')?.remove();if(mapPanel)mapPanel.append(filters);else before(filters);
    const layout=keep?.layout||E('div',{class:'qj-world-layout qj-field-layout'}),map=keep?.map||E('section'),panel=keep?.panel||E('aside',{class:'qj-place-panel qj-field-panel'});if(keep)panel.replaceChildren(); // (round 65, questperf65) a kept map page: only its side panel is redrawn
    function placePanel(selected,panel){
    if(selected){
      const k=mapKind(selected),emblem=E('div',{class:'qj-field-emblem',style:{'--icon-color':k.color}},QuestAtlas.icon(k.id));
      panel.append(E('div',{class:'qj-field-place-head'},emblem,E('div',{},label(k.name),E('h3',{text:selected.name}))),
        E('div',{class:'qj-field-place-tools'},mapIcon('star',selected.favorite?'Remove favorite':'Save favorite',()=>mutate(s=>{const place=s.atlas.places.find(p=>p.id===selected.id);place.favorite=!place.favorite;}),'#ffd75e',!!selected.favorite,'map-favorite-place'),mapIcon('check',selected.visitedAt?'Undo visit stamp':'Stamp my visit',()=>mutate(s=>{const place=s.atlas.places.find(p=>p.id===selected.id);place.visitedAt=place.visitedAt?null:new Date().toISOString();},'Visit saved. Quest XP still needs proof.'),'#ff6b9d',!!selected.visitedAt,'map-visit-place'),mapIcon('edit','Edit place & mission',()=>placeForm(selected),'#bd8bff'),mapIcon('info','Place details',()=>dialog(selected.name,body=>body.append(p(selected.quest||'No personal mission yet.'),p(selected.visitedAt?'You stamped a visit on '+new Date(selected.visitedAt).toLocaleDateString()+'.':'No visit stamped yet.'))),'#bfc0c8')));
      window.QuestParisUI?.panel(selected,panel); // parisquests61: Paris guide notes + its go → do → proof quest
      const accepted=state.campaigns.find(c=>c.mapPlace===selected.id&&!C.campaignDone(state,c)&&!c.paused);
      const mission=C.mapMissions.find(m=>m.kind===k.id);
      if(accepted){const q=C.next(state,accepted)||accepted.quests[0],b=button('',()=>questDetail(q.id),'qj-field-feature');b.append(label('IN YOUR NOTEBOOK'),E('strong',{text:accepted.title}),E('span',{text:q.minutes+' min · '+q.xp+' XP'}));panel.append(b);}
      else if(mission){const feature=button('',()=>mapMissionDetail(selected,mission),'qj-field-feature');feature.append(label('TRY THIS'),E('strong',{text:mission.title}),E('span',{text:mission.minutes+' min · '+mission.xp+' XP'}));panel.append(feature);}
      panel.append(button('Choose a quest',()=>mapMissionRack(selected),'qj-primary'),button('My own route',async()=>{await mutate(s=>C.placeQuest(s,selected.id),'Route saved.');navigate('adventure');},'qj-quiet'));
      if(k.id==='travel')panel.append(button('Plan Toulouse',()=>worldPlanForm({district:'gare',kind:'trip',destination:'Toulouse',title:'A little trip to Toulouse'}),'qj-quiet'));
      const goal=state.rewards.find(r=>r.id===state.rewardGoal);
      if(goal)panel.append(E('div',{class:'qj-field-goal'},label('NEXT TREAT'),button(goal.name,mapRewards,'qj-quiet'),meter(Math.min(C.balance(state),goal.cost),goal.cost,'Reward progress')));
      else panel.append(button('Pick a little reward',mapRewards,'qj-quiet'));
    }else panel.append(QuestAtlas.icon('compass'),E('h3',{text:'A quiet corner.'}),p('No places match.'),button('Show all places',()=>{mapFilter={kind:'all',saved:false,query:''};render();},'qj-primary'));
  }
    placePanel(selected,panel);
    paintActivePlace=id=>{const p=mapPlaces().find(p=>p.id===id);if(!p||!panel.isConnected)return;panel.replaceChildren();placePanel(p,panel);glaze(panel);};
    if(!keep){layout.append(map,panel);content.append(layout);}
    const optionsFor=(visible,selected,layerPins)=>({places:[...visible.map(p=>({...p,kind:window.QuestParis?.of(p)?.tags.includes('food')?'food':C.placeKind(p),color:window.QuestParis?.of(p)?.tags.includes('food')?'#ffb759':mapKind(p).color,tone:window.QuestMapFirst?.tone(p,state)})),...layerPins.filter(p=>!p.show || !visible.some(v=>window.QuestParis?.of(v) && typeof ShowSyncCore!=='undefined' && QuestParis.metres(p,v)<250 && ShowSyncCore.venueKey(p.name)===ShowSyncCore.venueKey(QuestParis.of(v).name)))],selected:selected?.id,onSelect:id=>{const layer=mapLayers.find(l=>l.owns?.(id));if(layer)return layer.select(id,layerKit);mapPick(id).catch(e=>notice(e.message));},onAdd:point=>placeForm(point),lines:layerLines});
    const atlasOptions=optionsFor(visible,selected,layerPins);
    function showMatches(options){
      matches.replaceChildren();matches.hidden=!mapFilter.query.trim();if(matches.hidden)return;
      const found=options.places;
      matches.append(E('span',{class:'qj-map-match-count',text:found.length?`${found.length} found`:'No matches',attrs:{role:'status'}}));
      for(const place of found.slice(0,8)){
        const b=button(place.name,()=>{atlasView.focus(place);options.onSelect(place.id);},'qj-quiet');b.dataset.mapMatch=place.id;b.title=place.name;b.prepend(QuestAtlas.icon(place.kind));matches.append(b);
      }
      if(found.length)matches.append(mapIcon('small','Fit all matches',()=>atlasView.fit(found),'#ffd75e'));
      matches.append(mapIcon('close','Clear map search',clearSearch,'#ff6b9d'));
    }
    showMatches(atlasOptions);
    if(keep){atlasView.update(atlasOptions);map.querySelectorAll(':scope>.qmf-strip,:scope>.qmf-status').forEach(n=>n.remove());}else atlasView=QuestAtlas.mount(map,atlasOptions); // (round 65, questperf65) same map, pins diffed
    if(keep)keep.search=null; // (round 72, longrun72) the kept page's old search goes: each one held the one before it (and its filters), a chain one longer per map redraw
    worldKeep={layout,map,panel,search:()=>{
      const places=mapPlaces(),selected=places.find(p=>p.id===(previewPlace||state.atlas.selected))||places[0],pins=[];
      for(const layer of mapLayers){try{if(!window.QuestMapFirst?.off(layer.id))pins.push(...(layer.pins?.(mapFilter)||[]));}catch(err){console.warn('[quest map search]',layer.id,err);}}
      const options=optionsFor(places,selected,pins);atlasView.update(options);showMatches(options);
      surprise.querySelector('button').disabled=places.length<2;
      const count=content.querySelector('.qj-field-footer>span');if(count)count.textContent=places.length+' places';
    }};
    window.QuestMapFirst?.overlay(map,layerKit); // (round 64, mapfirst64) one strip on the map: Places · Shows · My walks · Visited · Plan a walk (+ the shows' status line)
    for(const layer of mapLayers){try{const below=layer.below?.(layerKit);if(below)content.append(below);}catch(err){console.warn('[quest map layer]',layer.id,err);}} // (round 64, parisjournal64) a layer's below(kit) → one node under the map (My Paris's timeline strip)
    const stamps=state.atlas.places.filter(p=>p.visitedAt).length;
    content.append(E('div',{class:'qj-field-footer'},E('span',{text:visible.length+' places'}),mapIcon('check',stamps+' visit stamps · your own record, no XP',()=>mapNotebook('places'),'#ffd75e'),E('span',{text:stamps+'/'+state.atlas.places.length}),window.QuestParisUI?.footer()||null,button('Quest notebook →',()=>navigate('adventure'),'qj-quiet'))); // parisquests61: the Paris guide's one footer button
  }
  function mapMissionDetail(place,mission) {
    dialog(mission.title,(body,d)=>{
      body.append(label(place.name+' / '+mission.minutes+' MIN / '+mission.xp+' XP'),p(mission.done),E('div',{class:'qj-starting-note'},label('FIRST MOVE'),p(mission.tiny)),button('Add to my notebook',async()=>{const c=await mutate(s=>C.startMapMission(s,place.id,mission.id),'Field quest saved.');d.close();questDetail(c.quests[0].id);},'qj-primary'));
    },'FIELD QUEST / PROOF + REVIEW');
  }
  function mapMissionRack(place) {
    dialog('Choose your field quest',(body,d)=>{
      const toggle=E('input',{type:'checkbox',attrs:{'aria-label':'Only quick quests'}}),grid=E('div',{class:'qj-field-rack'});
      const draw=()=>{grid.replaceChildren();const matches=C.mapMissions.filter(m=>!toggle.checked||m.minutes<=15).sort((a,b)=>Number(b.kind===C.placeKind(place))-Number(a.kind===C.placeKind(place)));for(const m of matches){const k=C.mapKinds.find(k=>k.id===m.kind),c=state.campaigns.find(c=>c.mapPlace===place.id&&c.mapMission===m.id);const b=button('',()=>{d.close();mapMissionDetail(place,m);},'qj-field-card');b.style.setProperty('--icon-color',k.color);b.append(QuestAtlas.icon(m.kind),E('strong',{text:m.title}),E('span',{text:(c?(C.campaignDone(state,c)?'Finished · ':'In notebook · '):'')+m.minutes+' min · '+m.xp+' XP'}));grid.append(b);}};
      toggle.addEventListener('change',draw);body.append(E('label',{class:'qj-actions'},toggle,E('span',{text:'15 minutes or less'})),grid);draw();
    },place.name);
  }
  function mapRewards() {
    dialog('A little loot for later',(body,d)=>{
      const goal=state.rewards.find(r=>r.id===state.rewardGoal);
      if(goal)body.append(label('SAVING TOWARD'),E('h3',{text:goal.name}),meter(Math.min(C.balance(state),goal.cost),goal.cost,'Reward progress'));
      body.append(p('Choose a treat. Any € amount is your editable allowance.'),button('Open my treat machine',()=>{d.close();navigate('rewards');},'qj-primary'));
      const grid=E('div',{class:'qj-field-rack'});
      for(const r of C.rewardBlueprints.filter(r=>r.id.startsWith('field-'))){const old=state.rewards.find(x=>x.blueprint===r.id),b=button('',()=>{d.close();rewardForm(old||null,r);},'qj-field-card');b.append(QuestAtlas.icon(r.art==='music'?'music':r.art==='game'?'game':r.art==='visual'?'visual':'gift'),E('strong',{text:r.name}),E('span',{text:r.cost+' sparks · '+(r.amount?'€'+r.amount:'No spend')}));grid.append(b);}body.append(grid);
    },'FORGEHEART / REWARD DROPS');
  }
  function mapNotebook(tab) {
    dialog(tab==='friends'?'Friends & dates':tab==='plans'?'Outing plans':'My places',(body,d)=>{
      if(tab==='places'){
        for(const place of state.atlas.places){const k=mapKind(place),b=button('',async()=>{mapFilter={kind:'all',saved:false,query:''};d.close();await mapPick(place.id,true);},'qj-field-list-item');b.style.setProperty('--icon-color',k.color);b.append(QuestAtlas.icon(k.id),E('strong',{text:place.name}),E('span',{text:place.visitedAt?'✓':place.favorite?'★':''}));body.append(b);}return;
      }
      if(tab==='friends'){
        const friends=E('div',{class:'qj-field-rack'});
        for(const friend of state.world.friends){const b=button('',()=>{d.close();worldPlanForm({friendId:friend.id,title:C.friendSuggestion(friend),district:'cafe',destination:'Paris'});},'qj-field-card');b.dataset.friend=friend.id;b.append(QuestAtlas.icon('social'),E('strong',{text:friend.name}),E('span',{text:C.friendSuggestion(friend)}));friends.append(b);}
        body.append(friends,button('Edit friends & birthdays',()=>{d.close();friendsBook();},'qj-quiet'));
        for(const event of C.occasions(state).slice(0,6)){const existing=state.world.plans.find(p=>p.kind===event.kind&&p.friendId===event.friendId&&p.date===event.date&&p.status!=='archived');body.append(button(event.title+' · '+event.date,()=>{d.close();existing?worldPlanDetail(existing.id):worldPlanForm({...event,id:undefined,district:'quai',destination:'Paris'});},'qj-field-list-item'));}return;
      }
      body.append(button('+ Plan an outing',()=>{d.close();worldPlanForm();},'qj-primary'));
      if(!state.world.plans.length)body.append(p('A coffee, a birthday, a weekend away.'));
      for(const plan of state.world.plans){const c=state.campaigns.find(c=>c.id===`c-world-${plan.id}`),b=button('',()=>{d.close();worldPlanDetail(plan.id);},'qj-field-list-item');b.dataset.plan=plan.id;b.append(QuestAtlas.icon(plan.kind==='trip'?'travel':'calendar'),E('strong',{text:plan.title}),E('span',{text:plan.status==='archived'?'Resting':c?c.quests.filter(q=>C.done(state,q.id)).length+'/3':plan.date||'Date open'}));body.append(b);}
    },'PARIS / POCKET NOTEBOOK');
  }
  function placeForm(value={}) {
    dialog(value.id?'Edit map pin':'A place you want to go',(body,d)=>{
      const category=selection('Map category',C.mapKinds.map(k=>[k.id,k.name]),C.placeKind(value));
      const name=field('Place name',{value:value.name,max:120}),lat=field('Latitude',{value:String(value.lat??48.862),type:'number'}),lon=field('Longitude',{value:String(value.lon??2.35),type:'number'}),quest=field('What do you want to do here?',{value:value.quest,max:500,multiline:true,placeholder:'Meet Thomas, listen to a demo, bring back one field recording…'});lat.input.step=lon.input.step='.000001';
      body.append(name.node,category.node,E('div',{class:'qj-form-pair'},lat.node,lon.node),quest.node,p('Tip: double-click the street map to fill the coordinates. Pins cover Paris and its nearby surroundings.'),button('Save place',async()=>{await mutate(s=>C.savePlace(s,{id:value.id,name:name.input.value,kind:category.input.value,lat:lat.input.value,lon:lon.input.value,quest:quest.input.value}),'Map pin saved.');d.close();atlasView?.focus(state.atlas.places.find(p=>p.id===state.atlas.selected));},'qj-primary'));
    },'FIELD NOTE / PARIS');
  }
  function selection(title, entries, value) {
    const input = E('select', { attrs: { 'aria-label': title } }, ...entries.map(([value,text]) => E('option', { value,text }))); input.value = value;
    return { input,node:E('label',{class:'qj-field'},label(title),input) };
  }
  function friendsBook() {
    dialog('Your co-op notebook', (body,d) => {
      body.append(p('Nicknames, shared interests and birthdays. Stored locally in this journal; no contacts are imported or messaged.'),button('+ Add a friend', () => { d.close(); friendForm(); }, 'qj-primary'));
      for (const f of state.world.friends) body.append(E('section',{class:'qj-life-brief'}, E('h3',{text:f.name}),p(f.interests || 'Add something you enjoy together.'),label(f.birthday ? `BIRTHDAY / ${f.birthday}` : 'BIRTHDAY UNKNOWN'),row(button('Plan together', () => { d.close(); worldPlanForm({friendId:f.id,title:C.friendSuggestion(f),district:'cafe',destination:'Paris'}); }),button('Edit friend', () => { d.close(); friendForm(f); },'qj-quiet'))));
    },'PARIS / GOOD COMPANY');
  }
  function friendForm(friend) {
    dialog(friend ? 'Edit your co-op friend' : 'Add a co-op friend', (body,d) => {
      const name = field('Nickname',{value:friend?.name,max:80}), birthday = field('Birthday · MM-DD',{value:friend?.birthday,max:5,placeholder:'12-31 (optional)'}), interests = field('Things you enjoy together',{value:friend?.interests,max:300,multiline:true,placeholder:'Games, music, a café, exhibitions…'});
      body.append(name.node,birthday.node,interests.node,button('Save friend',async () => { await mutate(s => C.saveFriend(s,{id:friend?.id,name:name.input.value,birthday:birthday.input.value,interests:interests.input.value}),'Friend saved in your local notebook.');d.close(); },'qj-primary'));
    },'NO OUTREACH / JUST YOUR NOTES');
  }
  function worldPlanForm(seed = {}) {
    dialog(seed.id ? 'Edit your adventure' : 'Plan a real little adventure', (body,d) => {
      const title=field('Plan name',{value:seed.title,max:120}),kind=selection('Kind',[['outing','Small outing'],['birthday','Birthday'],['nye','New Year’s Eve'],['trip','Trip']],seed.kind||'outing'),district=selection('Map district',C.districts.map(x=>[x.id,x.name]),seed.district||state.world.selected),friend=selection('Who with',[['','Solo / decide later'],...state.world.friends.map(f=>[f.id,f.name])],seed.friendId||''),date=field('Date',{value:seed.date,type:'date'}),end=field('Return date · optional',{value:seed.endDate,type:'date'}),destination=field('City',{value:seed.destination||'Paris',max:100}),venue=field('Real place or meeting point',{value:seed.venue,max:160}),budget=field('Budget · EUR',{value:seed.budget==null?'':String(seed.budget),type:'number'}),note=field('Make the plan yours',{value:seed.note,max:500,multiline:true}); budget.input.min='0';budget.input.step='.01';
      body.append(title.node,E('div',{class:'qj-form-pair'},kind.node,district.node),friend.node,E('div',{class:'qj-form-pair'},date.node,end.node),destination.node,venue.node,budget.node,note.node,p('Dates and budget can stay open. Accepted quest briefs keep their original scope if you edit this plan later.'),button('Save adventure',async () => { await mutate(s=>C.saveWorldPlan(s,{id:seed.id,title:title.input.value,kind:kind.input.value,district:district.input.value,friendId:friend.input.value,date:date.input.value,endDate:end.input.value,destination:destination.input.value,venue:venue.input.value,budget:budget.input.value,note:note.input.value}),'Plan saved.');d.close();navigate('world'); },'qj-primary'));
    },'A DATE TO LOOK FORWARD TO');
  }
  function worldPlanDetail(pid) {
    const plan=state.world.plans.find(p=>p.id===pid);if(!plan)return;
    dialog(plan.title,(body,d)=>{
      body.append(label(`${plan.date||'DATE OPEN'}${plan.endDate?' → '+plan.endDate:''} / ${plan.budget===null?'BUDGET OPEN':'€'+plan.budget+' BUDGET'}`),p([plan.destination,plan.venue].filter(Boolean).join(' / ')),p(plan.note||'Choose one small next step.'),row(button('Edit plan',()=>{d.close();worldPlanForm(plan);},'qj-quiet'),button(plan.status==='archived'?'Resume plan':'Let plan rest',async()=>{await mutate(s=>{const resting=plan.status!=='archived';s.world.plans.find(p=>p.id===pid).status=resting?'archived':'planning';const c=s.campaigns.find(c=>c.id==='c-world-'+pid);if(c){c.paused=resting;if(resting&&s.active===c.id)s.active=null;}},'Plan status saved; quest progress is kept.');d.close();},'qj-quiet')));
      if(plan.status==='archived')return;
      body.append(row(button('Prepare invitation',()=>{d.close();invitationDialog(pid);}),button('Make this a quest →',async()=>{const c=await mutate(s=>C.planCampaign(s,pid),'Three checkpoints ready. XP follows reviewed work, not creating a plan.');d.close();navigate('adventure');const next=C.next(state,c);if(next)questDetail(next.id);},'qj-primary')));
      if(plan.kind==='trip'){
        body.append(E('section',{class:'qj-life-brief'},label('FARE SCOUT / PARIS DEPARTURE'),p('Compare exact dates, journey time, luggage and transfers. A saved price is a note, not live availability. The budget below compares transport only; include accommodation and other costs in your plan.'),row(button('Research in Astra',()=>{d.close();draftWorld(C.tripResearch(plan));},'qj-primary'),button('Train options ↗',()=>window.hub.openExternal(plan.destination.toLowerCase()==='toulouse'?'https://www.sncf-connect.com/train/trajet/paris/toulouse':'https://www.sncf-connect.com/'),'qj-quiet'),button('Coach options ↗',()=>window.hub.openExternal(plan.destination.toLowerCase()==='toulouse'?'https://www.flixbus.fr/voyages-car/paris-toulouse':'https://www.flixbus.fr/'),'qj-quiet')),p('Provider pages open separately. Enter your dates there; Hearth does not prefill them or monitor prices.'),button('+ Save a fare quote',()=>{d.close();fareForm(pid);},'qj-quiet')));
        for(const fare of plan.fares){const status=C.fareStatus(plan,fare);body.append(E('article',{class:'qj-fare'},label(status.label),E('h3',{text:`€${fare.amount} / ${fare.scope==='return'?'return':'one-way'} · ${fare.label}`}),p(`${fare.destination} · ${fare.date}${fare.endDate?' → '+fare.endDate:''} · recorded ${new Date(fare.checkedAt).toLocaleString()}`),p(status.withinBudget?'This saved transport quote fits your budget. Recheck before deciding.':'Compare the total trip cost before deciding.'),row(button('Recheck source ↗',()=>window.hub.openExternal(fare.url),'qj-quiet'),button('Remove quote',async()=>{await mutate(s=>{const p=s.world.plans.find(p=>p.id===pid);p.fares=p.fares.filter(f=>f.id!==fare.id);},'Quote removed.');d.close();worldPlanDetail(pid);},'qj-quiet'))));}
      }
    },'PARIS / YOUR OUTGOING LOG');
  }
  function invitationDialog(pid){dialog('An invitation in your own voice',(body)=>{const draft=field('Invitation draft',{value:C.invitation(state,pid),multiline:true,max:1500,rows:5});body.append(draft.node,p('Edit this, then copy it into the conversation you choose. Nothing is sent from here.'),button('Copy invitation',async()=>{await navigator.clipboard.writeText(draft.input.value);notice('Invitation copied. Send it yourself when it feels right.');},'qj-primary'));},'DRAFT / NOT SENT');}
  function draftWorld(text){const agent=H.agents().find(a=>a.mode==='native'&&a.engine==='codex'&&!a.dock);if(!agent)throw Error('Add an Astra native chat to prepare a draft.');const previous=Native.view(agent.id)?.input?.value||'';Native.setDraft(agent.id,`${previous?previous+'\n\n':''}${text}`);activate(agent.id);notice('Research draft prepared in Astra. Nothing was sent.');}
  function fareForm(pid){dialog('Keep a real quote',(body,d)=>{const name=field('Operator / option',{max:120}),amount=field('Quoted price · EUR',{type:'number'}),scope=selection('Price covers',[['return','Return journey'],['one-way','One-way only']],state.world.plans.find(p=>p.id===pid).endDate?'return':'one-way'),url=field('Source URL',{max:2000,placeholder:'https://…'});amount.input.min='0';amount.input.step='.01';body.append(name.node,amount.node,scope.node,url.node,p('Use a quote you just checked for this plan’s dates. Quotes are marked for rechecking after 24 hours or whenever the trip dates or destination change.'),button('Save quote',async()=>{await mutate(s=>C.addFare(s,pid,{label:name.input.value,amount:amount.input.value,scope:scope.input.value,url:url.input.value}),'Dated quote saved; availability is not monitored.');d.close();worldPlanDetail(pid);},'qj-primary'));},'MANUAL PRICE NOTE / EUR');}
  function lifeBoard() {
    content.append(sectionHeading('FH / EXPEDITION TERMINAL', 'A little more life. One small mission.', 'Pick what would make today easier or more interesting. Three short checkpoints, a keepsake badge, and room to stop. No streaks. No overdue quests.', button('Back to my desk', () => navigate('adventure'), 'qj-quiet')));
    const completed = C.lifeArcs.filter(t => { const c = state.campaigns.find(c => c.id === t.id); return c && C.campaignDone(state, c); });
    content.append(E('div', { class: 'qj-life-log' }, label('EXPEDITION PASSPORT'), E('strong', { text: `${completed.length} / ${C.lifeArcs.length} keepsakes` }), p(completed.length ? completed.map(c => c.badge).join(' · ') : 'Your first badge starts with something small. A skipped checkpoint can always be revisited.')));
    const grid = E('div', { class: 'qj-life-grid' });
    C.lifeArcs.forEach((template, i) => {
      const saved = state.campaigns.find(c => c.id === template.id), c = saved || template, count = saved ? c.quests.filter(q => C.done(state, q.id)).length : 0;
      const card = E('article', { class: `qj-life-card ${count === c.quests.length ? 'is-complete' : ''}`, style: { '--path': template.color, '--card-order': String(i) }, dataset: { expedition: c.id } }, E('header', {}, label(`${String(i + 1).padStart(2, '0')} / ${template.subtitle}`), art(template.art)), E('h3', { text: c.title }), explain(c.title,c.why));
      const route = E('ol', { class: 'qj-life-route', attrs: { 'aria-label': `${c.title} checkpoints` } });
      c.quests.forEach((q, j) => {
        const done = saved && C.done(state, q.id), skipped = saved && C.skipped(state, q.id);
        route.append(E('li', { class: done ? 'is-done' : skipped ? 'is-skipped' : '' }, E('span', { class: 'qj-life-node', text: done ? '✓' : skipped ? '↷' : String(j + 1), attrs: { 'aria-hidden': 'true' } }), E('div', {}, E('strong', { text: q.title }), label(`${done ? 'FINISHED' : skipped ? 'SKIPPED' : `${q.minutes} MIN`} / ${q.xp} XP`))));
      });
      card.append(route, E('div', { class: 'qj-life-loot' }, E('span', { text: count === c.quests.length ? '✦' : '◇', attrs: { 'aria-hidden': 'true' } }), E('div', {}, label(count === c.quests.length ? 'KEEPSAKE EARNED' : 'AT THE FINISH LINE'), E('strong', { text: c.badge }), p(`${c.quests.reduce((sum, q) => sum + q.xp, 0)} XP across the route · ${count}/${c.quests.length} finished`))), button(saved ? count === c.quests.length ? 'Open completed route' : saved.paused ? 'Open resting route' : 'Continue expedition →' : 'Preview expedition →', () => lifeDetail(template.id), 'qj-primary'));
      grid.append(card);
    });
    content.append(grid, p('Proof can be a small saved note, checklist, cropped image or actual result from a chat. Choose what to share when you submit. A suggested follow-up day is just your note; it creates no reminder.', 'qj-life-footnote'));
  }
  function lifeDetail(cid) {
    const template = C.lifeArcs.find(c => c.id === cid), saved = state.campaigns.find(c => c.id === cid), c = saved || template;
    dialog(c.title, (body, d) => {
      body.append(p(c.why));
      const intention = field('Make this expedition yours', { value: saved?.intention || '', multiline: true, max: 300, placeholder: 'Which project, corner of the desk, or tiny open tab do you have in mind?' });
      body.append(intention.node);
      c.quests.forEach((q, i) => {
        const available = saved && (C.available(state, q.id) || C.done(state, q.id) || C.skipped(state, q.id));
        body.append(E('section', { class: 'qj-life-brief', style: { '--path': template.color } }, label(`CHECKPOINT ${i + 1} / ${q.minutes} MIN / ${q.xp} XP`), E('h3', { text: q.title }), p(q.done), p(`Start here: ${q.tiny}`), available ? button(C.done(state, q.id) ? 'View result' : C.skipped(state, q.id) ? 'View skipped checkpoint' : 'Open checkpoint →', () => { d.close(); questDetail(q.id); }, 'qj-quiet') : null));
      });
      body.append(p('Your note stays in your local journal. It is not included in an Astra review unless you choose to share it as proof. Every checkpoint can be skipped; the badge waits for all three finishes.'));
      body.append(row(button(saved ? 'Save my expedition' : 'Accept expedition →', async () => { await mutate(s => C.startLifeArc(s, cid, intention.input.value), 'Expedition saved. Your note and earlier progress are kept.'); d.close(); navigate('life'); }, 'qj-primary'), saved && !C.campaignDone(state, c) && !saved.paused ? button('Let this rest', async () => { await mutate(s => { s.campaigns.find(c => c.id === cid).paused = true; if (s.active === cid) s.active = null; }, 'Expedition resting. No progress lost.'); d.close(); }, 'qj-quiet') : null));
    }, 'THREE CHECKPOINTS / YOUR OWN PACE');
  }
  function campaigns() {
    content.append(row(button('Life expeditions →', () => navigate('life'), 'qj-hardware')));
    content.append(sectionHeading('CAMPAIGNS', 'Finish something worth keeping.', 'One tracked campaign. A clear finish line. Everything else can wait.', button('+ Your own campaign', newCampaign, 'qj-primary')));
    const grid = E('div', { class: 'qj-campaign-grid' });
    for (const c of state.campaigns) {
      const path = pathOf(c.path), count = c.quests.filter(q => C.done(state, q.id)).length, finished = C.campaignDone(state, c);
      const card = E('article', { class: 'qj-card qj-campaign', style: { '--path': path.color } }, E('div', { class: 'qj-campaign-banner', attrs: { 'aria-hidden': 'true' } }, art(c.path)), label(c.subtitle || path.name), E('h3', { text: c.title }), explain(c.title,c.why), E('div', { class: 'qj-chapter-progress' }, label(c.paused ? 'RESTING' : finished ? 'COMPLETE' : c.id === state.active ? 'TRACKED' : path.name.toUpperCase()), E('span', { text: `${count} / ${c.quests.length}` })), meter(count, c.quests.length, c.title));
      const details = E('details', { class: 'qj-milestones' }, E('summary', { text: 'The path to done' }));
      c.quests.forEach((q, i) => { const isDone = C.done(state, q.id), isSkipped = C.skipped(state, q.id), isNext = C.next(state, c)?.id === q.id; details.append(E('div', { class: `qj-milestone ${isDone ? 'done' : ''}` }, E('span', { text: isDone ? '✓' : isSkipped ? '↷' : String(i + 1) }), isDone || isSkipped || (isNext && !c.paused) ? button(`${q.title}${isSkipped ? ' · skipped' : ''}`, () => questDetail(q.id), 'qj-quiet') : E('span', { text: q.title }))); });
      card.append(details, row(finished ? button('View your collection', () => navigate('collection'), 'qj-quiet') : button(c.paused ? 'Resume campaign' : c.id === state.active ? 'Continue →' : 'Track campaign →', async () => { await track(c); navigate('adventure'); }, 'qj-primary'), !finished && !c.paused ? button('Pause', () => mutate(s => { s.campaigns.find(x => x.id === c.id).paused = true; if (s.active === c.id) s.active = null; }, 'Campaign resting. All your progress is kept.'), 'qj-quiet') : null));
      grid.append(card);
    }
    content.append(grid);
  }
  function tree() {
    content.append(sectionHeading('FORGEHEART / PERSONAL PATCH MATRIX', 'Build your own class.', 'Eight specializations for the things you actually make. Reviewed finishes light the circuit; titles and desk keepsakes follow. Progress records your work, not a test of talent.', button('Tune desk', deskSettings, 'qj-quiet')));
    const matrix = E('div', { class: 'qj-specializations' });
    for (const path of C.paths) {
      const lane = E('section', { class: 'qj-skill-lane', style: { '--path': path.color } }, E('header', {}, art(path.id), label(path.name), E('strong', { text: `${C.xp(state, path.id)} XP / ${C.specializations.filter(r => r.path === path.id).reduce((n, r) => n + C.mastery(state, r.id).rank, 0)} TITLES` })));
      for (const r of C.specializations.filter(r => r.path === path.id)) {
        const m = C.mastery(state, r.id), b = button('', () => specializationDetail(r.id), `qj-module ${state.workstation.target === r.id ? 'is-target' : ''}`);
        b.dataset.route = r.id; b.setAttribute('aria-label', `${r.name}: ${m.count} reviewed finishes, ${m.rank} titles earned`);
        b.dataset.help=r.why;
        b.append(label(state.workstation.target === r.id ? 'PINNED ROUTE' : 'SPECIALIZATION'), E('h3', { text: r.name }), E('div', { class: 'qj-module-nodes', attrs: { 'aria-hidden': 'true' } }, ...m.milestones.map((n, i) => E('span', { class: n.earned ? 'is-lit' : '', text: n.earned ? '✦' : String(i + 1) }))), label(m.next ? `${m.count} / ${m.next.required} FINISHES → ${m.next.name}` : 'ALL TITLES EARNED'));
        lane.append(b);
      }
      matrix.append(lane);
    }
    content.append(matrix);
    const grid = E('div', { class: 'qj-tree' });
    for (const path of C.paths) {
      const branch = E('section', { class: 'qj-branch', style: { '--path': path.color } }, E('header', {}, E('span', { class: 'qj-path-icon', text: path.icon }), E('h3', { text: path.name }), p(path.description), label(`${C.xp(state, path.id)} PATH XP`)));
      for (const [i, skill] of C.skills(state, path.id).entries()) {
        const node = button('', () => dialog(skill.name, body => { body.append(p(skill.unlocked ? `You have reached this milestone in ${path.name}.` : `${Math.max(0, skill.threshold - C.xp(state, path.id))} more ${path.name} XP to reach this milestone.`), p(i === 0 ? 'Choose a small campaign and begin with curiosity.' : ['Keep a first artifact you can return to.', 'Try a variation and decide what to keep.', 'Finish a sequence of connected experiments.', 'Bring your own idea from first step to finished work.'][i - 1]), button('Find a campaign', e => { e.currentTarget.closest('dialog').close(); navigate('campaigns'); }, 'qj-primary')); }, path.name), `qj-skill ${skill.unlocked ? 'earned' : 'ahead'}`);
        node.setAttribute('aria-label', `${skill.name}, ${skill.unlocked ? 'earned' : 'ahead'}, ${skill.threshold} path XP`);node.dataset.help=node.getAttribute('aria-label');
        node.append(E('span', { class: 'qj-skill-gem', text: skill.unlocked ? (i ? '✦' : path.icon) : '◇' }), E('strong', { text: skill.name }), label(skill.unlocked ? 'EARNED' : `${skill.threshold} XP`)); branch.append(node);
      }
      grid.append(branch);
    }
    content.append(E('details', { class: 'qj-fold qj-path-milestones' }, E('summary', { text: 'Your original path XP milestones / all progress kept' }), grid), E('section', { class: 'qj-finish-banner' }, E('span', { text: '✦' }), E('div', {}, label('THE SKILL THAT CONNECTS THEM ALL'), E('h3', { text: 'Finishing is a practice.' }), p(`${C.stats(state).campaigns} campaigns completed. Every finished campaign adds its badge to your collection.`)), button('See your collection →', () => navigate('collection'), 'qj-quiet')));
  }
  function specializationDetail(rid) {
    const m = C.mastery(state, rid), pick = C.practicePick(state, rid);
    dialog(m.route.name, (body, d) => {
      body.append(p(m.route.why), p('Titles follow 1, 3 and 5 different reviewed finishes on this route. Revisions and small starts do not inflate the count. Your existing tools stay available.'));
      m.milestones.forEach((n, i) => {
        const equipped = state.workstation.title?.route === rid && state.workstation.title.rank === i + 1 && n.earned;
        body.append(E('section', { class: `qj-rank ${n.earned ? 'earned' : ''}` }, E('span', { class: 'qj-rank-number', text: `0${i + 1}` }), E('div', {}, label(`${n.required} REVIEWED FINISH${n.required === 1 ? '' : 'ES'}`), E('strong', { text: n.name }), p(i === 0 ? m.route.gift : i === 1 ? 'A new title for your workstation nameplate.' : 'The final title in this specialization.')), n.earned ? button(equipped ? 'Equipped ✓' : 'Equip title', async () => { await mutate(s => C.equipTitle(s, rid, i + 1), 'Title and desk keepsake equipped.'); d.close(); specializationDetail(rid); }, equipped ? 'qj-quiet' : 'qj-primary') : label(`${Math.max(0, n.required - m.count)} TO GO`)));
      });
      body.append(row(button(state.workstation.target === rid ? 'Unpin route' : 'Pin this route', async () => { await mutate(s => { s.workstation.target = s.workstation.target === rid ? null : rid; }, 'Practice route saved.'); d.close(); specializationDetail(rid); }, 'qj-quiet'), button('Browse matching cards', async () => { await mutate(s => C.deal(s, { lane: rid === 'forgeheart' ? 'forge' : m.route.path === 'life' && rid === 'finish' ? 'any' : m.route.path, mood: 'any', minutes: 60, shelf: 'all' })); d.close(); navigate('deck'); }, 'qj-quiet')));
      if (pick) body.append(E('aside', { class: 'qj-starting-note' }, label('ONE GOOD NEXT PRACTICE'), E('strong', { text: (pick.quest || pick.card).title }), p((pick.quest || pick.card).tiny)), button('Start next practice →', async () => { const q = await mutate(s => C.startPractice(s, rid), 'Practice ready. Your chosen route is pinned.'); d.close(); questDetail(q.id); }, 'qj-primary'));
      else body.append(p('No fresh practice available here right now. Free a side-quest slot, resume a paused campaign, or revisit work from your tracklist.'));
      const evidence = E('details', { class: 'qj-fold' }, E('summary', { text: `Work behind this title · ${m.count} reviewed finishes` }));
      for (const q of m.evidence) evidence.append(E('div', { class: 'qj-idea-row' }, E('strong', { text: q.title }), button('Show review', () => { d.close(); reviewHistory(q.id); }, 'qj-quiet')));
      body.append(evidence);
    }, 'PATCH MATRIX / EARNED THROUGH WORK');
  }
  function newTitles(before, after) {
    return C.specializations.flatMap(r => C.mastery(after, r.id).milestones.slice(C.mastery(before, r.id).rank).filter(n => n.earned).map(n => `Title earned: ${n.name}`));
  }
  function deskSettings() {
    dialog('Your Forgeheart workstation', (body, d) => {
      const name = field('Callsign', { value: state.workstation.callsign, max: 40 }), accent = E('select', { attrs: { 'aria-label': 'Console accent' } }, ...C.consoleAccents.map(a => E('option', { value: a.id, text: a.name }))); accent.value = state.workstation.accent;
      body.append(name.node, E('label', { class: 'qj-field' }, label('CONSOLE ACCENT'), accent), E('div', { class: 'qj-accent-samples', attrs: { 'aria-hidden': 'true' } }, ...C.consoleAccents.map(a => E('i', { style: { background: a.color } }))), p(`Nameplate: ${C.activeTitle(state)?.name || 'Independent creator'}. Earn titles and their desk keepsakes in the Patch matrix.`), button('Save workstation', async () => { await mutate(s => { s.workstation.callsign = C.text(name.input.value, 40); s.workstation.accent = accent.value; }, 'Workstation loadout saved.'); d.close(); }, 'qj-primary'), row(button('Open patch matrix', () => { d.close(); navigate('skills'); }, 'qj-quiet'), state.workstation.title ? button('Unequip title', async () => { await mutate(s => C.equipTitle(s, null), 'Title unequipped; your earned work is kept.'); d.close(); }, 'qj-quiet') : null));
    }, 'LOCAL CONSOLE / YOUR DESK');
  }
  function rewards() {
    content.append(sectionHeading('FORGEHEART / REWARD BAY', 'Something to look forward to.', null, row(button('Browse reward ideas', rewardIdeas, 'qj-primary'), button('+ Add a reward', () => rewardForm(), 'qj-quiet'))));
    rewardBudgetPanel();
    content.append(E('div', { class: 'qj-balance' }, E('b', { text: `✧ ${C.balance(state)}` }), p('sparks available · your XP and level stay with you')));
    { const shelf = typeof RewardShelf !== 'undefined' ? RewardShelf.studio({ E, label, p, button, meter, row, mutate, redeemDialog, rewardForm, dialog, field }, state) : null; if (shelf) content.append(shelf); } // (round 63, rewards63) the real-rewards shelf: next reward in XP, the savings jar, kind starters, every claim
    const pending = state.redemptions.filter(r => !r.returnedAt && !r.enjoyedAt);
    if (pending.length) {
      const queue = E('section', { class: 'qj-reward-queue' }, label('CLAIMED / READY TO ENJOY'), E('h3', { text: 'Something good is waiting.' }));
      for (const r of [...pending].reverse()) queue.append(E('div', { class: 'qj-receipt' }, art('rewards'), E('div', {}, E('strong', { text: r.name }), p(r.plan || 'Choose a moment that feels right. No expiry.')), row(button('Enjoyed it', () => enjoyDialog(r), 'qj-primary'), button('Return reward', () => mutate(s => C.returnReward(s, r.id), 'Reward returned. Your sparks are back.'), 'qj-quiet'))));
      content.append(queue);
    }
    const grid = E('div', { class: 'qj-reward-grid' });
    for (const r of state.rewards) {
      const can = C.balance(state) >= r.cost;
      const kind = r.art || (/play|game/.test(r.id) ? 'game' : /listen|dig/.test(r.id) ? 'music' : /plugin/.test(r.id) ? 'skills' : /film|night/.test(r.id) ? 'life' : 'rewards');
      grid.append(E('article', { class: `qj-card qj-reward ${state.rewardGoal === r.id ? 'qj-reward-target' : ''}` }, E('div', { class: 'qj-reward-glyph', attrs: { 'aria-hidden': 'true' } }, art(kind)), label((r.category || 'YOUR TREAT') + (r.amount ? ' / €' + r.amount.toFixed(2) : ' / NO SPEND')), E('h3', { text: r.name }), E('details',{class:'qj-reward-details'},E('summary',{text:'The idea'}),p(r.note || 'A reward you chose. Claim it when it feels right.')), label(`${r.cost} SPARKS${state.rewardGoal === r.id ? ' / YOUR NEXT TREAT' : ''}`), meter(Math.min(C.balance(state), r.cost), r.cost, `Progress toward ${r.name}`), row(button(can ? 'Redeem reward' : `${r.cost - C.balance(state)} sparks to go`, () => redeemDialog(r), can ? 'qj-primary' : 'qj-quiet'), mapIcon('star',state.rewardGoal === r.id ? 'Clear reward goal' : 'Save toward this', () => mutate(s => { s.rewardGoal = s.rewardGoal === r.id ? null : r.id; }), '#ffd75e',state.rewardGoal===r.id,'reward-goal-'+r.id), mapIcon('edit','Edit '+r.name, () => rewardForm(r),'#bd8bff'))));
    }
    content.append(grid);
    const history = state.redemptions.filter(r => r.returnedAt || r.enjoyedAt);
    if (history.length) {
      content.append(sectionHeading('YOUR REWARD LOG', 'Good moments, kept.'));
      for (const r of [...history].reverse().slice(0, 50)) content.append(E('div', { class: 'qj-receipt' }, E('span', { text: r.returnedAt ? '↶' : '✦' }), E('div', {}, E('strong', { text: r.name }), p(`${new Date(r.at).toLocaleDateString()} · ${r.cost} sparks · ${r.returnedAt ? 'returned' : 'enjoyed'}`), r.note ? p(r.note) : null), r.enjoyedAt ? button('Undo enjoyed', () => mutate(s => { const receipt = s.redemptions.find(x => x.id === r.id); delete receipt.enjoyedAt; delete receipt.note; }, 'Moved back to enjoy later. Sparks unchanged.'), 'qj-quiet') : null));
    }
  }
  function rewardBudgetPanel(){
    const money=C.rewardMoney(state);
    content.append(E('section',{class:'qj-reward-budget'},E('div',{},label('THIS MONTH / YOUR TREAT ENVELOPE'),E('strong',{text:'€'+money.remaining.toFixed(2)+' left'}),p('€'+money.committed.toFixed(2)+' planned of €'+money.limit.toFixed(2)+'. A personal budget, not a bank balance.')),meter(money.committed,Math.max(1,money.limit),'Monthly reward budget'),button('Set my budget',()=>dialog('A budget you feel good about',(body,d)=>{const budget=field('Monthly reward limit · EUR',{value:String(money.limit),type:'number'});budget.input.min='0';budget.input.step='.01';body.append(budget.node,p('Claimed priced treats reserve this amount in the month you claim them. Returning a reward restores that month’s allowance. No payments or transfers are made.'),button('Save budget',async()=>{await mutate(s=>{s.rewardBudget.monthly=Number(budget.input.value);},'Reward budget saved.');d.close();},'qj-primary'));},'YOUR MONEY / YOUR CHOICE'),'qj-quiet')));
    const ideas=E('div',{class:'qj-tangible-ideas'});for(const [name,amount,cost,note] of [['A Bandcamp discovery',5,35,'Pick an artist release and support it. Adjust the amount to the actual price.'],['Coffee with Thomas or Ismaël',8,45,'Take a demo outside the studio and listen together.'],['Sample pack fund',15,70,'One pack with sounds you will actually use.'],['Toulouse travel pot',25,100,'Reserve a little toward a real visit. Check fares before booking.']])ideas.append(button(name+' · €'+amount,()=>rewardForm(null,{name,amount,cost,note}),'qj-quiet'));content.append(ideas);
  }
  function rewardIdeas() {
    dialog('Stock your reward bay', (body, d) => {
      body.append(p('Make the name, cost and ritual yours.'));
      const grid = E('div', { class: 'qj-blueprints' });
      for (const b of C.rewardBlueprints) {
        const existing = state.rewards.find(r => r.blueprint === b.id);
        grid.append(E('article', { class: 'qj-blueprint' }, art(b.art), label(`${b.category} / ${b.cost} SPARKS`), E('h3', { text: b.name }), p(b.note), button(existing ? 'Edit my version' : 'Make this mine', () => { d.close(); rewardForm(existing || null, b); }, 'qj-primary')));
      }
      body.append(grid);
    }, 'HAND-PICKED / MUSIC · VISUALS · GAMES');
  }
  function enjoyDialog(receipt) {
    dialog('A good moment, kept', (body, d) => {
      const note = field('A note for next time', { multiline: true, max: 500, placeholder: 'What did you choose? Would you want this reward again?' });
      body.append(E('h3', { text: receipt.name }), note.node, p('Optional note. Marking it enjoyed changes no XP or sparks.'), button('Mark enjoyed', async () => { await mutate(s => C.enjoyReward(s, receipt.id, note.input.value), 'Enjoyed moment saved.'); d.close(); }, 'qj-primary'));
    }, 'REWARD LOG');
  }
  function rewardForm(reward, blueprint) {
    dialog(reward ? 'Edit your reward' : 'Something to look forward to', (body, d) => {
      const value = reward || blueprint;
      const name = field('Reward', { value: value?.name, max: 160, placeholder: 'A night at the cinema' }), cost = field('Sparks', { value: String(value?.cost || 20), type: 'number' }), amount = field('Real cost · EUR (0 for no-spend)', {value:String(value?.amount||0),type:'number'}), note = field('Make it personal', { value: value?.note, multiline: true, max: 500, placeholder: 'Which game, album, plugin or treat? Add your own budget if relevant.' });
      amount.input.min='0';amount.input.step='.01';
      body.append(name.node, E('div',{class:'qj-form-pair'},cost.node,amount.node), note.node, p('A 35-XP quest earns 7 sparks. Choose a cost that feels inviting. These are your treats, not obligations.'), button('Save reward', async () => { if (!name.input.value.trim()) throw Error('Name your reward first.'); await mutate(s => { const values = { name: C.text(name.input.value, 160), cost: Number(cost.input.value), note: C.text(note.input.value, 500), amount: Number(amount.input.value) }; if (blueprint?.id && !reward) Object.assign(C.stockReward(s, blueprint.id, values),{amount:values.amount}); else { const r = { ...reward, ...values, id: reward?.id || C.id('r') }; if (reward) s.rewards[s.rewards.findIndex(x => x.id === reward.id)] = r; else s.rewards.push(r); } }); d.close(); }, 'qj-primary'));
    }, 'YOUR REWARD CHEST');
  }
  function redeemDialog(r) {
    dialog('Claim this moment', (body, d) => body.append(E('h3', { text: r.name }), p(`${r.cost} sparks · €${(r.amount||0).toFixed(2)} planned. €${C.rewardMoney(state).remaining.toFixed(2)} remains in this month’s reward budget. This records a plan; no money moves.`), button('Confirm redemption', async () => { await mutate(s => C.redeem(s, r.id), 'Reward claimed. Enjoy it.'); d.close(); celebrate('Reward unlocked', r.name); }, 'qj-primary')), 'YOU EARNED THIS');
  }
  const safePath = path => typeof path === 'string' && /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) && !/[\x00-\x1f]/.test(path);
  function artifactPreview(artifact) {
    if (!artifact || !safePath(artifact.path) || /^[\\/]{2}/.test(artifact.path)) return null;
    const url = WinMac.fileUrl(artifact.path);
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(artifact.path)) { const img = E('img', { attrs: { src: url, alt: artifact.label || 'Completed quest artifact', loading: 'lazy' } }); img.addEventListener('error', () => img.replaceWith(p('Preview unavailable. The file may have moved.'))); return img; }
    if (/\.(wav|mp3|ogg|flac|m4a)$/i.test(artifact.path)) return E('audio', { attrs: { src: url, controls: '', preload: 'none', 'aria-label': artifact.label || 'Quest audio' } });
    if (/\.(mp4|webm|mov)$/i.test(artifact.path)) return E('video', { attrs: { src: url, controls: '', preload: 'none', 'aria-label': artifact.label || 'Quest video' } });
    return null;
  }
  function collectionMedia(item) {
    const grid=E('div',{class:'qj-shelf-media'}),seen=new Set();
    for(const a of [{path:item.proof.type==='file'?item.proof.path:null,title:item.title},...(item.media||[]),...(item.proof.attachments||[])]){
      if(!a.path||seen.has(a.path)||!QuestShelf.local(a.path))continue;seen.add(a.path);
      const preview=artifactPreview({path:a.path,label:a.title});
      if(preview){const figure=E('figure',{},preview,E('figcaption',{text:a.title||'Chat artifact'}));preview.addEventListener('error',()=>{figure.replaceChildren(p('Preview unavailable. The original may have moved or this format needs another player.'),button('Show source file',()=>window.hub.fs.reveal(a.path),'qj-quiet'));},{once:true});grid.append(figure);}
      else if(/\.(txt|md|json|js|ts|html|css|csv|diff|patch)$/i.test(a.path)){const details=E('details',{class:'qj-fold'},E('summary',{text:a.title||'Text artifact'})),pre=E('pre',{class:'qj-evidence-excerpt',text:'Open to read this file.'});details.append(pre);let loaded=false;details.addEventListener('toggle',async()=>{if(!details.open||loaded)return;loaded=true;try{pre.textContent=await window.hub.assets.readText(a.path,256*1024)||'File unavailable or larger than 256 KB. Open the source file to read it.';}catch(e){pre.textContent=calmError(e);}});grid.append(details);}
      else grid.append(button(a.title||'Show artifact',()=>window.hub.fs.reveal(a.path),'qj-quiet'));
    }return grid;
  }
  function collectionShelf(){
    const upload=E('input',{attrs:{type:'file',accept:'.png,.jpg,.jpeg,.webp,.gif,.wav,.mp3,.ogg,.flac,.m4a,.mp4,.webm,.mov,.txt,.md,.json,.js,.ts,.html,.css,.csv'},hidden:true});
    upload.addEventListener('change',async()=>{try{if(!upload.files?.length)return;notice('Keeping your export…');const proof=await QuestReview.file(upload.files[0]);await keepOnShelf(proof,[]);}catch(e){notice(e.message);}finally{upload.value='';}});
    content.append(E('section',{class:'qj-shelf-toolbar'},E('div',{},label('YOUR CREATIVE WORK / ONE SHELF'),explain('Your creative shelf','Chat references stay linked to their originals. Uploads are copied into Hearth.')),row(button('From a Hearth chat',shelfChat,'qj-primary'),button('Upload a creation',()=>upload.click(),'qj-quiet')),upload));
    const grid=E('div',{class:'qj-collection-grid qj-personal-shelf'});
    for(const item of [...state.collection].reverse())grid.append(E('article',{class:'qj-card qj-keepsake'},label(item.proof.type==='chat'?'HEARTH CHAT / LINKED':'YOUR EXPORT'),E('h3',{text:item.title}),collectionMedia(item),item.proof.excerpt?E('details',{class:'qj-fold'},E('summary',{text:'Read saved text'}),E('pre',{class:'qj-evidence-excerpt',text:item.proof.excerpt})):null,proofSource(item.proof),button('Remove from shelf',()=>mutate(s=>{s.collection=s.collection.filter(x=>x.id!==item.id);},'Shelf entry removed. Source files and chat are kept.'),'qj-quiet')));
    content.append(grid);
  }
  async function keepOnShelf(proof,media){await mutate(s=>{if(s.collection.length>=100)throw Error('The shelf holds 100 creations. Remove an entry before adding another.');s.collection.push({id:C.id('keepsake'),title:proof.title,at:new Date().toISOString(),proof,media});},'Creation added to your shelf.');}
  function shelfChat(){
    dialog('Bring work out of a Hearth chat',(body,d)=>{
      const chats=E('select',{attrs:{'aria-label':'Shelf source chat'}},E('option',{value:'',text:'Choose a chat…'})),messages=E('select',{attrs:{'aria-label':'Shelf source message'}},E('option',{value:'',text:'Choose a message…'})),preview=E('div',{class:'qj-shelf-chat-preview'}),feedback=p('Loading chat titles…');let chat=null,version=0;
      body.append(chats,messages,feedback,preview,button('Keep this on my shelf',async()=>{const m=chat?.messages?.[Number(messages.value)];if(messages.value===''||!m)throw Error('Choose a message first.');const media=QuestShelf.media(m),copy={...chat,messages:chat.messages.map((x,i)=>i===Number(messages.value)?{...x,text:x.text||x.content||('Media created in '+chat.title)}:x)};const proof=await QuestReview.chat(copy,Number(messages.value),{includeImages:false});proof.coverage='Saved message text and linked media from the selected Hearth message. No automatic critique.';await keepOnShelf(proof,media);d.close();},'qj-primary'));
      window.hub.listChats().then(items=>{for(const c of items)chats.append(E('option',{value:c.id,text:capTitle(c.title||'Untitled chat')}));feedback.textContent='Choose a message to preview its text, images, audio and video.';}).catch(e=>feedback.textContent=calmError(e));
      chats.addEventListener('change',async()=>{const ticket=++version;chat=null;preview.replaceChildren();messages.replaceChildren(E('option',{value:'',text:'Choose a message…'}));try{const value=chats.value&&await window.hub.getChat(chats.value);if(ticket!==version)return;chat=value;(chat?.messages||[]).forEach((m,i)=>{if(String(m.text||m.content||'').trim()||QuestShelf.media(m).length)messages.append(E('option',{value:String(i),text:(m.role||'message')+' · '+capTitle(m.text||m.content||'Media creation')}));});}catch(e){feedback.textContent=calmError(e);}});
      messages.addEventListener('change',()=>{preview.replaceChildren();const m=chat?.messages?.[Number(messages.value)];if(messages.value===''||!m)return;preview.append(collectionMedia({title:chat.title,proof:{type:'chat'},media:QuestShelf.media(m)}),E('pre',{class:'qj-evidence-excerpt',text:String(m.text||m.content||'').slice(0,20000)}));});
    },'HEARTH / CHAT COLLECTION');
  }
  function collection() {
    content.append(sectionHeading('COLLECTION / YOUR PORTFOLIO', 'Proof that you made something.', 'Keep work from any Hearth chat or upload an export. Play your bounces, preview textures, revisit the source.'));
    collectionShelf();
    reviewShelf();
    { const weeks = typeof WeekNudge !== 'undefined' ? WeekNudge.pages({ E, label, p }, state) : null; if (weeks) content.append(weeks); } // (round 62, weekquest62) the saved weeks in review (s.weekly.reviews)
    const badges = state.campaigns.filter(c => C.campaignDone(state, c));
    if (badges.length) content.append(E('div', { class: 'qj-badges' }, ...badges.map(c => E('div', { class: 'qj-badge', style: { '--path': pathOf(c.path).color } }, E('span', { text: '✦' }), E('strong', { text: c.badge || c.title }), label('CAMPAIGN COMPLETE')))));
    const finished = C.allQuests(state).filter(q => C.done(state, q.id)).sort((a, b) => C.record(state, b.id).completedAt.localeCompare(C.record(state, a.id).completedAt));
    if (!finished.length && !state.collection.length) content.append(E('section', { class: 'qj-empty' }, E('span', { class: 'qj-empty-star', text: '✧' }), E('h3', { text: 'Your first keepsake belongs here.' }), p('Finish a quest and add a note, image, sound or video. Small things count.'), button('Back to your adventure →', () => navigate('adventure'), 'qj-primary')));
    const grid = E('div', { class: 'qj-collection-grid' });
    for (const q of finished.filter(q => !C.submissions(state, q.id).length)) { const r = C.record(state, q.id), path = pathOf(q.path); const art = artifactPreview(r.artifact);
      grid.append(E('article', { class: 'qj-card qj-keepsake', style: { '--path': path.color } }, art ? E('div', { class: 'qj-artifact' }, art) : E('div', { class: 'qj-keepsake-mark', text: path.icon, attrs: { 'aria-hidden': 'true' } }), label(`${path.name} · ${new Date(r.completedAt).toLocaleDateString()}`), E('h3', { text: q.title }), p(r.note || q.done), row(button('View quest', () => questDetail(q.id), 'qj-quiet'), r.artifact && safePath(r.artifact.path) ? button('Show file', () => window.hub.fs.reveal(r.artifact.path), 'qj-quiet') : null)));
    }
    content.append(grid);
    if (legacy && (Object.keys(legacy.done || {}).length || Object.keys(legacy.journal || {}).length)) {
      const archive = E('details', { class: 'qj-fold' }, E('summary', { text: 'Earlier Playground journal · preserved' }));
      const dates = [...new Set([...Object.keys(legacy.done || {}), ...Object.keys(legacy.journal || {})])].sort().reverse();
      for (const date of dates) archive.append(E('div', { class: 'qj-legacy' }, label(date), p(`${Array.isArray(legacy.done?.[date]) ? legacy.done[date].length : 0} earlier quests completed`), p(String(legacy.journal?.[date] || ''))));
      content.append(archive);
    }
  }
  function newCampaign() {
    dialog('What do you want to make real?', (body, d) => {
      const title = field('Campaign name', { max: 100, placeholder: 'Finish my next track' }), why = field('Why this matters to me', { max: 600, multiline: true, rows: 2, placeholder: 'I want something finished that sounds like me.' });
      const select = E('select', { attrs: { 'aria-label': 'Skill path' } }, ...C.paths.map(p => E('option', { value: p.id, text: p.name }))); select.value = 'life';
      const steps = field('Milestones · one finishable step per line', { multiline: true, rows: 5, max: 3000, placeholder: 'Choose the version I want to finish\nFinish one rough arrangement\nExport a version I can listen to' });
      body.append(title.node, why.node, E('label', { class: 'qj-field' }, label('SKILL PATH'), select), steps.node, p('Keep it to 1–12 milestones. Each should leave something you can point to. You can make the next action smaller after creating it.'), button('Create campaign →', async () => { await mutate(s => C.addCampaign(s, { title: title.input.value, why: why.input.value, path: select.value, milestones: steps.input.value.split('\n') }), 'Your campaign is ready. Start with just the first step.'); d.close(); navigate('adventure'); }, 'qj-primary'));
    }, 'A FINISH LINE YOU CHOOSE');
  }
  async function openTool(tool) {
    if (tool === 'forge') { activate('tool:forgeheart'); return; }
    if (tool === 'lab') { activate('tool:three'); return; }
    if (!tool || tool === 'files') { notice('Use your own folders or favorite tools, then return here to keep your progress.'); return; }
    await Lazy.load('creative'); activate('tool:creative');
    for (let i = 0; i < 100 && !document.querySelector('.cp-stage'); i++) await new Promise(r => setTimeout(r, 50));
    CreativePlayground.openFeature(({ tiles: 'pattern', sounds: 'vst', slice: 'vst', rack: 'vst', arena: 'story' })[tool] || tool);
  }
  function draftQuest(q) {
    const agent = H.agents().find(a => a.mode === 'native' && a.engine === 'codex' && !a.dock);
    if (!agent) throw Error('Add an Astra native chat to prepare a draft.');
    const previous = Native.view(agent.id)?.input?.value || '';
    Native.setDraft(agent.id, `${previous ? previous + '\n\n' : ''}I’m working on this Hearth quest: ${q.title}.\nDone means: ${q.done}\nMy smallest next action: ${state.tiny[q.id] || q.tiny}\nHelp me take one manageable next step. Keep the scope small and preserve existing work. Don’t mark the quest complete for me.`);
    activate(agent.id); notice('Draft prepared in Astra. Nothing was sent.');
  }
  function questDetail(qid, initial = 'normal') {
    const q = C.find(state, qid); if (!q) return;
    const path = pathOf(q.path), r = C.record(state, qid), completed = C.done(state, qid);
    let mode = initial;
    dialog(q.title, (body, d) => {
      const intention = state.campaigns.find(c => c.id === q.campaign)?.intention;
      if (intention) body.append(E('aside', { class: 'qj-starting-note' }, label('YOUR EXPEDITION / LOCAL NOTE'), p(intention)));
      for (const hook of detailHooks) { try { const node = hook({ quest: q, campaign: state.campaigns.find(c => c.id === q.campaign) || null, close: () => d.close(), kit: { dialog, mapIcon, button, p, label, E, mutate, questDetail, navigate, notice } }); if (node) body.append(node); } catch (err) { console.warn('[quest detail hook]', err); } }
      if (completed) {
        if (C.submissions(state, qid).length) body.append(button('Review & version history', () => { d.close(); reviewHistory(qid); }, 'qj-primary'));
        body.append(label(`✓ COMPLETED · ${q.xp} XP`), p(q.done), p(r.note || 'You kept your promise to this quest.'), artifactPreview(r.artifact), row(button('Add or edit keepsake', () => { d.close(); completionForm(qid, true); }), button('Undo completion', async () => { await mutate(s => C.undo(s, qid), 'Completion undone. Your earlier small start is kept.'); d.close(); }, 'qj-quiet'))); return;
      }
      if (C.skipped(state, qid)) { body.append(label('SET ASIDE · NO COMPLETION XP'), p(q.done), p('Your earlier small-start XP is kept. Bring this back whenever it fits.'), button('Revisit quest', async () => { await mutate(s => C.revisit(s, qid), 'Quest restored.'); d.close(); navigate('adventure'); }, 'qj-primary')); return; }
      if (q.parked) { body.append(label('PARKED / YOUR PROGRESS IS KEPT'), p(q.done), button('Resume this quest', async () => { await mutate(s => { if (C.sideCount(s) >= 3) throw Error('Free a side-quest slot before resuming.'); s.sideQuests.find(x => x.id === qid).parked = false; }, 'Quest back on your workbench.'); d.close(); questDetail(qid); }, 'qj-primary')); return; }
      if (window.QuestGuide?.open) body.append(E('section', {class:'qj-guided-entry'}, E('div', {}, label('YOUR QUEST'), guidedSummary(q)), button(r.acceptedAt||r.startedAt||window.QuestGuide.summary(qid)?'Continue quest →':'View quest →', async () => { await window.QuestGuide.open(q); d.close(); }, 'qj-primary')));
      if (state.plan?.quest === qid) body.append(E('aside', { class: 'qj-starting-note' }, label('YOUR STARTING NOTE'), p(state.plan.action)));
      if (q.variants) body.append(E('section', { class: 'qj-contract' }, label('YOUR SCOPE CONTRACT'), p('Pick scope before the first start or submission. XP rewards finishing the agreed work, never a high score.'), row(...Object.entries(q.variants).map(([tier, v]) => { const b = button(`${tier === 'sketch' ? 'Sketch' : tier === 'studio' ? 'Studio' : 'Showcase'} · ${v.minutes}m · ${v.xp} XP`, async () => { await mutate(s => C.setContract(s, qid, tier)); d.close(); questDetail(qid); }, (state.contracts?.[qid] || 'studio') === tier ? 'qj-primary' : 'qj-quiet'); b.disabled = Boolean(C.earned(state, q) || C.submissions(state, qid).length); b.setAttribute('aria-pressed', String((state.contracts?.[qid] || 'studio') === tier)); return b; }))));
      if (C.latest(state, qid)) body.append(button('Review & version history', () => { d.close(); reviewHistory(qid); }, 'qj-quiet'));
      body.append(E('aside', { class: 'qj-proof-hint qj-proof-summary' },QuestAtlas.icon('shield'), label('PROOF + REVIEW'),explain('Quest evidence',q.proofHint || 'Attach the actual result or select the work from a chat. A completion claim alone is not evidence.')));
      const options = E('div', { class: 'qj-mode', attrs: { role: 'group', 'aria-label': 'Quest size' } }), detail = E('div', { class: 'qj-quest-detail' });
      const paint = () => {
        options.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        detail.replaceChildren(label(mode === 'tiny' ? 'JUST OPEN THE DOOR' : mode === 'deep' ? 'ONLY IF YOU FEEL THE SPARK' : 'A CLEAR FINISH LINE'), p(mode === 'tiny' ? state.tiny[qid] || q.tiny : mode === 'deep' ? q.deep : q.done, 'qj-objective'));
        if (mode === 'tiny') {
          const tiny = field('Make the first action your own', { value: state.tiny[qid] || q.tiny, max: 500 });
          detail.append(p('A small start earns 5 XP once. The full quest stays open, and finishing earns the rest.'), tiny.node, row(button('Save smaller step', () => mutate(s => { const value = C.text(tiny.input.value); if (!value) throw Error('Write a small action first.'); s.tiny[qid] = value; }, 'Small step saved.')), button(C.record(state, qid).startedAt ? 'Small start already earned ✓' : 'I took the first step · +5 XP', async () => { const n = await mutate(s => C.startSmall(s, qid), 'A start worth keeping. The full quest is still open.'); d.close(); if (n) celebrate('You opened the door.', '+5 XP · the next step can wait.'); }, 'qj-primary')));
        } else detail.append(p(mode === 'deep' ? 'This is optional exploration. There is no extra XP for overworking. The original finish line still counts.' : `About ${q.minutes} minutes · ${q.xp - C.earned(state, q)} XP left to earn.`), button('I reached the finish line →', () => { d.close(); completionForm(qid); }, 'qj-primary'));
      };
      for (const [value, name] of [['tiny', '2-minute start'], ['normal', 'Focused quest'], ['deep', 'Deep dive']]) { const b = button(name, () => { mode = value; paint(); }); b.dataset.mode = value; options.append(b); }
      body.append(options, detail, E('div', { class: 'qj-quest-tools' }, label('MAKE IT EASIER TO START'), row(q.tool && q.tool !== 'files' ? button(q.tool === 'lab' ? 'Open Three.js Lab ↗' : 'Open creative tool ↗', async () => { d.close(); await openTool(q.tool); }) : null, button('Focus for 5 minutes', async () => { await focus(qid, 5); d.close(); }), button('Prepare Astra draft', () => { d.close(); draftQuest(q); }, 'qj-quiet'))));
      body.append(row(button('Leave a starting note', () => { d.close(); planNote(qid); }, 'qj-quiet'), button('Skip for now →', async () => { await skipQuest(qid); d.close(); }, 'qj-quiet'), button('Suggest a different quest', () => { d.close(); ideaForm(); }, 'qj-quiet')));
      if (!q.campaign) body.append(button('Park this side quest', async () => { await mutate(s => { s.sideQuests.find(x => x.id === qid).parked = true; if (s.focus?.quest === qid) s.focus = null; }, 'Parked, with your progress kept.'); d.close(); }, 'qj-quiet'));
      paint();
    }, path.name);
  }
  const laneNames = { any: 'All worlds', music: 'Sound room', visual: 'Light studies', game: 'Game feel', forge: 'Forgeheart', life: 'Small resets' };
  function mixtape() {
    const d = state.deck, cards = C.deckHand(state), pool = C.deckPool(state), accepted = state.sideQuests.filter(q => q.deckCard), finished = accepted.filter(q => C.done(state, q.id));
    content.append(E('header', { class: 'qj-deck-head' }, E('div', {}, label('SIDEQUEST SELECTS / VOL. 01'), E('h2', { text: 'The mixtape' }), p('Thirty reasons to open the studio. Take one that pulls you in; the rest can wait.'), row(button('Deal three more ↻', () => mutate(s => C.deal(s), 'New deal saved. Unseen cards come first.'), 'qj-primary', 'deck-deal'), button('Back to notebook', () => navigate('adventure'), 'qj-quiet'))), E('div', { class: 'qj-deck-machine' }, art('deck'), label(`${String(finished.length).padStart(2, '0')} / 30 FINISHED`))));
    const filters = E('div', { class: 'qj-deck-filters' });
    const select = (key, title, options) => {
      const control = E('select', { attrs: { 'aria-label': title }, dataset: { focus: `deck-${key}` } }, ...options.map(([value, name]) => E('option', { value: String(value), text: name })));
      control.value = String(d.filters[key]);
      control.addEventListener('change', async () => { control.disabled = true; try { await mutate(s => C.deal(s, { ...s.deck.filters, [key]: key === 'minutes' ? Number(control.value) : control.value }), 'Mixtape filters and new deal saved.'); } catch (err) { control.value = String(state.deck.filters[key]); notice(err.message); } finally { control.disabled = false; } });
      filters.append(E('label', { class: 'qj-field' }, label(title), control));
    };
    select('lane', 'World', C.deckLanes.map(l => [l, laneNames[l]]));
    select('mood', 'Today I want to', [['any', 'Follow anything'], ['make', 'Make something'], ['remix', 'Remix something'], ['polish', 'Polish a detail'], ['explore', 'Explore an idea'], ['reset', 'Make starting easier']] );
    select('minutes', 'Room to play', [[5, 'Up to 5 minutes'], [15, 'Up to 15 minutes'], [30, 'Up to 30 minutes'], [60, 'Any length']] );
    select('shelf', 'Crate', [['all', 'The whole mixtape'], ['saved', 'My saved cards']] );
    content.append(filters, E('div', { class: 'qj-deck-counter' }, label(`${pool.length} CARDS MATCH / ${C.sideCount(state)} OF 3 SIDE-QUEST SLOTS USED`), E('span', { text: 'No timer. No expiry. Proof earns the finish.' })));
    const hand = E('div', { class: 'qj-deck-hand', attrs: { 'aria-label': 'Your mixtape cards' } });
    cards.forEach((c, i) => {
      const saved = d.saved.includes(c.id), card = E('article', { class: 'qj-deck-card', dataset: { card: c.id }, style: { '--path': pathOf(c.path).color, '--card-order': String(i) } });
      const save = button(saved ? 'Saved ♥' : 'Save ♡', () => mutate(s => C.markCard(s, c.id, 'saved'), saved ? 'Card removed from saved.' : 'Card saved for another day.'), 'qj-quiet', `save-${c.id}`); save.setAttribute('aria-pressed', String(saved));
      card.append(E('div', { class: 'qj-card-sleeve' }, art(c.lane), E('span', { class: 'qj-tape-label', text: laneNames[c.lane] }), E('span', { class: 'qj-tape-number', text: `SIDE ${String.fromCharCode(65 + i)}` })), E('div', { class: 'qj-card-liner' }, label(`${c.mood.toUpperCase()} / ${c.minutes} MIN / ${c.minutes <= 5 ? 20 : c.minutes <= 15 ? 35 : 50} XP`), E('h3', { text: c.title }), p(c.done), E('p', { class: 'qj-card-first', text: `First move: ${c.tiny}` }), button('Open this brief →', () => deckBrief(c.id), 'qj-primary'), row(save, button('Not my thing', () => mutate(s => C.markCard(s, c.id, 'hidden'), 'Card tucked away. Restore it below whenever you want.'), 'qj-quiet', `hide-${c.id}`))));
      hand.append(card);
    });
    if (!cards.length) hand.append(E('section', { class: 'qj-deck-empty' }, art('deck'), E('h3', { text: pool.length ? 'There’s more in the crate.' : 'A quieter corner of the crate.' }), p(pool.length ? 'Deal again to see the next matching cards.' : 'Try another world, a longer session or the whole mixtape. Taken quests live in your tracklist below; tucked-away cards can be restored.'), button('Deal again', () => mutate(s => C.deal(s), 'Deal saved.'), 'qj-primary'), button('Show all worlds', () => mutate(s => C.deal(s, { lane: 'any', mood: 'any', minutes: 60, shelf: 'all' }), 'Filters reset. Your saved and hidden cards are kept.'), 'qj-quiet')));
    content.append(hand);
    const passport = E('section', { class: 'qj-deck-passport' }, E('div', {}, label('YOUR CREATIVE PASSPORT'), E('h3', { text: 'A little further into your worlds.' }), p('Stamps follow reviewed finishes. Explore at your pace; there is no streak to lose.')));
    for (const lane of C.deckLanes.filter(l => l !== 'any')) {
      const count = finished.filter(q => C.deckCard(q.deckCard).lane === lane).length;
      passport.append(E('div', { class: `qj-deck-stamp ${count ? 'is-stamped' : ''}`, attrs: { 'aria-label': `${laneNames[lane]}: ${count} finished` } }, art(lane), E('strong', { text: laneNames[lane] }), E('span', { text: count ? `${count} FINISHED` : 'UNEXPLORED' })));
    }
    content.append(passport);
    if (accepted.length) {
      const list = E('details', { class: 'qj-fold qj-deck-tracklist' }, E('summary', { text: `Your tracklist · ${accepted.length} taken / ${finished.length} finished` }));
      for (const q of accepted) list.append(E('div', { class: 'qj-idea-row' }, E('div', {}, E('strong', { text: q.title }), label(C.done(state, q.id) ? 'FINISHED / REVIEW KEPT' : C.skipped(state, q.id) ? 'SET ASIDE' : q.parked ? 'PARKED' : 'ON YOUR WORKBENCH')), button('Open quest', () => questDetail(q.id), 'qj-quiet')));
      content.append(list);
    }
    if (d.hidden.length) {
      const hidden = E('details', { class: 'qj-fold qj-deck-hidden' }, E('summary', { text: `Tucked away · ${d.hidden.length} cards` }));
      d.hidden.forEach(cid => hidden.append(E('div', { class: 'qj-idea-row' }, E('strong', { text: C.deckCard(cid).title }), button('Restore card', () => mutate(s => { C.markCard(s, cid, 'hidden'); C.deal(s); }, 'Card restored to its matching pool.'), 'qj-quiet'))));
      content.append(hidden);
    }
  }
  function deckBrief(cid) {
    const c = C.deckCard(cid); if (!c) return;
    dialog(c.title, (body, d) => {
      const twist = E('input', { type: 'checkbox', attrs: { 'aria-label': 'Add the creative constraint' } });
      const objective = p(c.done, 'qj-objective');
      twist.addEventListener('change', () => { objective.textContent = c.done + (twist.checked ? ` Creative constraint: ${c.twist}` : ''); });
      body.append(row(button(state.deck.saved.includes(cid)?'Unsave card':'Save for later',()=>mutate(s=>C.markCard(s,cid,'saved')),'qj-quiet'),button('Not my thing',async()=>{await mutate(s=>C.markCard(s,cid,'hidden'));d.close();},'qj-quiet')));
      const take = button('Take this quest →', async () => { const q = await mutate(s => { /* (lifechecks70) Find a quest opens any card's brief, and opening it is the "open" step takeCard asks for: the old mixtape's dealt hand and filters are no longer on screen, so without this only the 3 cards still in that hidden hand could be taken ("Deal or open this card before taking it.") */ if (!s.deck.hidden.includes(cid) && !C.deckHand(s).some(x => x.id === cid)) { s.deck.filters = { lane: 'any', mood: 'any', minutes: 60, shelf: 'all' }; s.deck.hand = [cid, ...s.deck.hand.filter(x => x !== cid)]; } return C.takeCard(s, cid, twist.checked); }, 'Quest added to your workbench. The chosen brief is saved.'); d.close(); questDetail(q.id); }, 'qj-primary');
      take.disabled = C.sideCount(state) >= 3;
      body.append(label(`${laneNames[c.lane]} / ${c.minutes} MINUTES`), objective, E('aside', { class: 'qj-twist' }, E('label', {}, twist, E('strong', { text: 'Add a creative constraint' })), p(c.twist), p('Optional. Same XP either way. Your choice becomes part of the brief when you take the quest.')), E('aside', { class: 'qj-starting-note' }, label('YOUR FIRST MOVE'), p(c.tiny)), p('Show the actual result at the finish line. Astra reviews the evidence before completion; a promise or a high score alone never earns the reward.'), take);
      if (C.sideCount(state) >= 3) body.append(p('Your three side-quest slots are full. Park, skip or finish one before taking this card.'), button('Go to my workbench', () => { d.close(); navigate('adventure'); }, 'qj-quiet'));
    }, 'THE MIXTAPE / PICK YOUR VERSION');
  }
  function commissions() {
    content.append(sectionHeading('THE COMMISSION WALL / VOL. 01', 'Make something worth keeping.', 'Fifteen concrete milestones across music, visuals, game feel and Forgeheart. Choose a rough sketch, a focused studio pass or a showcase. Show the work; the score follows the evidence.', button('Back to notebook', () => navigate('adventure'), 'qj-quiet')));
    const grid = E('div', { class: 'qj-commissions' });
    for (const [i, c] of state.campaigns.filter(c => c.commission).entries()) {
      const path = pathOf(c.path), next = C.next(state, c), count = c.quests.filter(q => C.done(state, q.id)).length;
      const card = E('article', { class: 'qj-commission', style: { '--path': path.color, '--tilt': `${i % 2 ? 1 : -1}deg` } }, E('div', { class: 'qj-commission-art' }, art(c.path), E('span', { class: 'qj-issue', text: `0${i + 1}` })), label(c.subtitle), E('h3', { text: c.title }), p(c.why), E('ol', { class: 'qj-deliverables' }, ...c.quests.map(q => E('li', { text: `${C.done(state, q.id) ? '✓ ' : ''}${q.title}` }))), label(`${count}/${c.quests.length} FINISHED / PROOF REQUIRED`), button(next ? 'Take this commission →' : 'View portfolio →', async () => { if (!next) return navigate('collection'); await track(c); questDetail(next.id); }, 'qj-primary'));
      grid.append(card);
    }
    content.append(grid);
  }
  function scoreDial(score) {
    const box = E('div', { class: 'qj-score-dial', attrs: { 'aria-label': score == null ? 'Awaiting sufficient evidence' : `${score} out of 100` } });
    const value = score == null ? 0 : score;
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="#e7dcc02b" stroke-width="7"/><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray="${value * 3.14159} 314.159" transform="rotate(-90 60 60)"/></svg>`;
    box.append(document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true), E('strong', { text: score == null ? '—' : String(score) }), E('span', { text: score == null ? 'NO SCORE YET' : 'OUT OF 100' })); return box;
  }
  function proofArtifact(proof) { return proof?.path ? { path: proof.path, label: proof.title, kind: proof.kind } : null; }
  function proofSource(proof) {
    return row(proof.type === 'file' ? button('Show proof file ↗', () => window.hub.fs.reveal(proof.path), 'qj-quiet') : proof.type === 'chat' ? button('Show source chat ↗', async () => { const chat = await window.hub.getChat(proof.chatId); if (!chat) throw Error('This chat is unavailable; its submitted excerpt is kept below.'); root.querySelector('dialog[open]')?.close(); Native.open(chat.agentId, chat.id); }, 'qj-quiet') : button('Open source chat ↗', () => { if (!C.externalUrl(proof.url)) throw Error('Unsupported chat link.'); return window.hub.openExternal(proof.url); }, 'qj-quiet'));
  }
  function reviewCard(qid, item, { actions = true } = {}) {
    const r = item.review, box = E('article', { class: 'qj-scorecard' });
    box.append(E('header', { class: 'qj-score-head' }, scoreDial(r?.score), E('div', {}, label(r ? 'ASTRA / EVIDENCE REVIEW' : reviewJobs.has(qid) ? 'ASTRA / REVIEW IN PROGRESS' : 'PROOF SAVED / AWAITING REVIEW'), E('h3', { text: r ? r.status === 'needs-evidence' ? 'Show a little more of the work.' : r.meetsBrief ? 'The finish line is visible.' : 'One more pass on the brief.' : 'Your work is on the desk.' }), p(r?.coverage || item.proof.coverage))));
    if (r) {
      if (r.dimensions.length) box.append(E('div', { class: 'qj-rubric' }, ...['Intent / clarity', 'Execution / craft', 'Brief / delivery', 'Presentation / tests'].map((name, i) => E('div', {}, label(name), E('b', { text: `${r.dimensions[i]}/25` }), meter(r.dimensions[i], 25, name)))));
      box.append(p(r.summary, 'qj-review-verdict'), E('section', { class: 'qj-review-notes' }, E('div', {}, label(r.meetsBrief ? 'OPTIONAL POLISH' : 'WHAT WOULD HELP'), p(r.better)), E('div', {}, label(r.meetsBrief ? 'IF YOU FEEL LIKE CONTINUING' : 'THE SMALLEST NEXT STEP'), p(r.next))), E('details', { class: 'qj-fold' }, E('summary', { text: 'What this score can and cannot say' }), p(r.limitations), p(`Subjective rubric score. ${r.model || 'Astra'} · ${new Date(item.reviewedAt).toLocaleString()}. Scores never add XP or spend sparks.`)));
    }
    const evidence = E('details', { class: 'qj-fold' }, E('summary', { text: `Evidence · ${item.proof.title}` }), p(item.proof.coverage), proofSource(item.proof));
    if (item.proof.excerpt) evidence.append(E('pre', { class: 'qj-evidence-excerpt', text: item.proof.excerpt }));
    if (item.proof.analysis) evidence.append(E('pre', { class: 'qj-evidence-excerpt', text: item.proof.analysis }));
    const preview = artifactPreview(proofArtifact(item.proof)); if (preview) evidence.append(E('div', { class: 'qj-evidence-preview' }, preview));
    if (item.proof.type !== 'file') for (const path of item.proof.images) evidence.append(E('div', { class: 'qj-evidence-preview' }, artifactPreview({ path, label: 'Still saved with this chat proof' })));
    for (const a of (item.proof.attachments || []).slice(item.proof.type === 'file' ? 1 : 0)) evidence.append(E('div', { class: 'qj-evidence-preview' }, label(a.title), artifactPreview({ path: a.path, label: a.title, kind: a.kind }), button('Show reference file ↗', () => window.hub.fs.reveal(a.path), 'qj-quiet')));
    for (const source of item.proof.sources || []) evidence.append(button(`${source.older ? 'Earlier reference' : 'Source'} · ${source.title}`, async () => {
      const chat = await window.hub.getChat(source.chatId); if (!chat) throw Error('This chat is unavailable here; its submitted excerpt is saved above.');
      root.querySelector('dialog[open]')?.close(); Native.open(chat.agentId, chat.id);
    }, 'qj-quiet'));
    box.append(evidence);
    if (actions) {
      const isLatest = C.latest(state, qid)?.id === item.id;
      if (isLatest && r && C.submissions(state, qid).length < 12) box.append(button('Reconsider with all my proof', async () => {
        if (reviewJobs.has(qid)) throw Error('A review is already running for this quest.');
        const proof = await QuestReview.refreshChatProof(item.proof);
        const fresh = await mutate(s => {
          if (C.latest(s, qid)?.id !== item.id) throw Error('Your proof changed. Open its latest review first.');
          return proof.fingerprint !== item.proof.fingerprint ? C.submit(s, qid, proof, item.intent) : C.reconsider(s, qid);
        }, 'Keeping the old review. Looking at your submitted work together…');
        await reviewSaved(qid, fresh.id);
      }, 'qj-quiet'));
      if (!r && isLatest) box.append(reviewJobs.has(qid) ? button('Cancel review', () => reviewJobs.get(qid)?.cancel(), 'qj-quiet') : button('Review saved proof', () => reviewSaved(qid, item.id), 'qj-primary'));
      if (isLatest && r?.status === 'reviewed' && r.meetsBrief && !C.done(state, qid)) box.append(button(`Complete quest · +${C.find(state, qid).xp - C.earned(state, C.find(state, qid))} XP`, async () => {
        const before = C.clone(state), points = await mutate(s => C.complete(s, qid, { note: item.intent, artifact: proofArtifact(item.proof) }));
        root.querySelector('dialog[open]')?.close(); const gains = C.gains(before, state); celebrate('You made the thing.', `+${points} XP · ${C.find(state, qid).title}`, [...gains.skills.map(n => `Skill reached: ${n.name}`), ...newTitles(before, state), ...gains.rewards.map(name => `Ready to claim: ${name}`)]);
      }, 'qj-primary'));
      if (isLatest) box.append(row(button(C.done(state, qid) ? 'Submit a revision' : 'Submit new proof', () => { root.querySelector('dialog[open]')?.close(); proofForm(qid); }, 'qj-quiet'), C.done(state, qid) && !C.find(state, qid).revisionOf && r?.status === 'reviewed' ? button('Turn feedback into a quest →', async () => { const q = await mutate(s => C.revisionQuest(s, qid)); root.querySelector('dialog[open]')?.close(); questDetail(q.id); }, 'qj-primary') : null));
    }
    return box;
  }
  function reviewHistory(qid) {
    const d = dialog(C.find(state, qid).title, body => { const list = C.submissions(state, qid); body.append(p('Versions are kept in submission order. Compare the coverage before comparing scores; a technical audio check is not a listening review.'));
      for (const [i, item] of [...list].reverse().entries()) { body.append(label(`VERSION ${list.length - i} / ${new Date(item.at).toLocaleString()}`), reviewCard(qid, item)); }
    }, 'THE REVIEW DESK / VERSION HISTORY');
    d.dataset.questReview = qid;
  }
  async function reviewSaved(qid, sid, statusNode) {
    if (reviewJobs.has(qid)) throw Error('This quest already has a review running.');
    const item = C.submissions(state, qid).find(x => x.id === sid); if (!item || item.review) throw Error('Choose saved proof that has not been reviewed.');
    const history = C.submissions(state, qid).slice(0, C.submissions(state, qid).indexOf(item));
    const previousItem = history.filter(x => x.review?.status === 'reviewed').at(-1) || C.latest(state, C.find(state, qid).revisionOf);
    const prior = previousItem?.review ? { review: previousItem.review, proof: previousItem.proof } : null;
    const d = root.querySelector('dialog[open]');
    const job = QuestReview.run(C.find(state, qid), item, prior, text => { if (statusNode?.isConnected) statusNode.textContent = text; }, history); reviewJobs.set(qid, job);
    let cancel; if (d) { cancel = button('Cancel review', () => job.cancel(), 'qj-quiet'); d.querySelector('.qj-dialog-body').append(cancel); }
    let failure;
    try { const review = await job.promise; await mutate(s => C.saveReview(s, qid, sid, review), 'Astra review saved.'); }
    catch (err) { failure = err; }
    finally { reviewJobs.delete(qid); cancel?.remove(); render(); }
    const current = root.querySelector('dialog[open]');
    if (d?.open || current?.dataset.questReview === qid) { (d?.open ? d : current).close(); if (C.find(state, qid)) reviewHistory(qid); }
    if (failure) throw failure;
  }
  async function finishQuest(qid) {
    const q = C.find(state, qid); if (!q) throw Error('This quest is no longer in your journal.');
    if (C.done(state, qid) || C.canFinish(state, qid)) return reviewHistory(qid);
    if (proofJobs.has(qid) || reviewJobs.has(qid)) return;
    const guide = window.QuestGuide?.snapshot?.()?.session;
    const projectId = q.projectId || (guide?.questId === qid ? guide.projectId : '');
    if (!projectId) return proofForm(qid);
    proofJobs.add(qid); let cancelled = false, reviewing = false;
    const startId = C.latest(state, qid)?.id;
    const progress = p('Finding the work in your project chat…', 'qj-proof-status'); progress.setAttribute('role', 'status');
    const d = dialog('Gathering your quest proof', body => body.append(progress, p('Hearth gathers relevant chat results and linked exports, then asks Astra for a review. Uses your normal account usage.'), button('Choose proof myself', () => { cancelled = true; d.close(); proofForm(qid); }, 'qj-quiet')), q.title);
    d.dataset.questAutoProof = qid;
    d.addEventListener('close', () => { cancelled = true; if (reviewing) reviewJobs.get(qid)?.cancel(); }, { once: true });
    try {
      await Lazy.load('projects'); await Projects.ready(); if (cancelled) return;
      const project = Projects.get(projectId); if (!project) throw Error('This project is unavailable on this computer. Your saved proof is safe; choose a local result below.');
      const scoped = { ...q, projectId }, result = await QuestProof.collect(scoped, project, {
        since: C.record(state, qid).acceptedAt || C.record(state, qid).startedAt || q.projectTask?.messageAt,
        getChat: id => window.hub.getChat(id), busy: id => Native.isBusy(id), cancelled: () => cancelled,
        progress: text => { if (!cancelled) progress.textContent = text; }
      });
      if (cancelled) return;
      if (!result.proof) { d.close(); return proofForm(qid, result.reason); }
      const ids = QuestProof.chatIds(scoped, Projects.get(projectId));
      if (result.sources.some(s => !ids.includes(s.chatId)) || ids.some(id => Native.isBusy(id))) throw Error('The project chat changed while gathering. Try finishing again when it settles.');
      if (C.latest(state, qid)?.id !== startId) throw Error('New proof arrived while gathering. Open its latest review first.');
      const intent = 'Automatically gathered from this project’s linked chats for the accepted quest.';
      let item = C.submissions(state, qid).find(x => x.proof.fingerprint === result.proof.fingerprint && x.intent === intent);
      if (item?.review) { d.close(); return reviewHistory(qid); }
      if (!item) item = await mutate(s => {
        if (cancelled) throw Error('Collection cancelled.');
        if (C.latest(s, qid)?.id !== startId) throw Error('New proof arrived while gathering.');
        return C.submit(s, qid, result.proof, intent);
      }, 'Proof gathered and saved. Asking Astra…');
      if (cancelled) return;
      reviewing = true; await reviewSaved(qid, item.id, progress);
    } catch (err) { if (!cancelled && d.open) { progress.textContent = calmError(err); d.querySelector('.qj-dialog-body').append(button('Try gathering again', () => { d.close(); return finishQuest(qid); }, 'qj-quiet')); } }
    finally { proofJobs.delete(qid); }
  }
  function proofForm(qid, hint = '') {
    const q = C.find(state, qid); let selected = null, preparing = false;
    dialog(C.done(state, qid) ? 'Make the next version count.' : 'Put the finished thing on the desk.', (body, d) => {
      if (hint) body.append(p(hint, 'qj-proof-status'));
      body.append(label('YOUR FINISH LINE'), p(q.done, 'qj-objective'), p(q.proofHint || 'An actual export, code/diff or test result. A link or “I did it” alone does not show the work.'));
      const intent = field('What were you aiming for, and what changed?', { multiline: true, max: 2000, placeholder: 'Mood, BPM, the change you made, what you tested. For audio, include structure notes: Astra can measure the file but cannot hear it.' });
      const feedback = p('Choose an export or show the work from a chat.', 'qj-proof-status'); feedback.setAttribute('role', 'status');
      const set = async fn => { if (preparing) throw Error('Wait for the selected evidence to finish loading.'); preparing = true; selected = null; feedback.textContent = 'Preparing your proof…'; try { selected = await fn(); feedback.textContent = `${selected.title} · ${selected.coverage}`; } catch (e) { feedback.textContent = calmError(e); throw e; } finally { preparing = false; } };
      const upload = E('input', { type: 'file', attrs: { 'aria-label': 'Upload quest proof', multiple: '', accept: '.png,.jpg,.jpeg,.webp,.gif,.wav,.mp3,.ogg,.flac,.m4a,.mp4,.webm,.mov,.txt,.md,.json,.js,.ts,.html,.css,.csv,.diff,.patch' } });
      upload.addEventListener('change', () => { if (upload.files[0]) { const files = Array.from(upload.files); upload.disabled = true; set(() => QuestReview.files(files)).catch(() => {}).finally(() => { upload.disabled = false; }); } });
      const picker = E('select', { attrs: { 'aria-label': 'Source Hearth chat' } }, E('option', { value: '', text: 'Choose a Hearth chat…' }));
      const messages = E('select', { attrs: { 'aria-label': 'Source chat message' } }, E('option', { value: '', text: 'Choose a message…' })); let selectedChat = null;
      const excerpt = E('pre', { class: 'qj-evidence-excerpt', text: 'The selected text will appear here. Using the message also keeps up to four linked still images.' });
      const chatBox = E('details', { class: 'qj-fold qj-proof-source' }, E('summary', { text: 'Show work from a Hearth chat' }), picker, messages, excerpt, button('Use this chat message', () => { if (!selectedChat || messages.value === '') throw Error('Choose a chat and message first.'); return set(() => QuestReview.chat(selectedChat, Number(messages.value))); }, 'qj-quiet'));
      let chatsLoaded = false;
      chatBox.addEventListener('toggle', async () => { if (!chatBox.open || chatsLoaded) return; chatsLoaded = true; try { const chats = await window.hub.listChats(); for (const c of chats) picker.append(E('option', { value: c.id, text: capTitle(c.title || 'Untitled chat') })); } catch (e) { chatsLoaded = false; feedback.textContent = calmError(e); } });
      picker.addEventListener('change', async () => { selectedChat = null; messages.replaceChildren(E('option', { value: '', text: 'Choose a message…' })); try { const id = picker.value, chat = id && await window.hub.getChat(id); if (picker.value !== id) return; selectedChat = chat; (chat?.messages || []).forEach((m, i) => { if (typeof (m.text || m.content) === 'string' && (m.text || m.content).trim()) messages.append(E('option', { value: String(i), text: `${m.role || 'message'} · ${capTitle(m.text || m.content)}` })); }); } catch (e) { feedback.textContent = calmError(e); } });
      messages.addEventListener('change', () => { const m = selectedChat?.messages?.[Number(messages.value)]; excerpt.textContent = messages.value === '' ? 'Choose a message.' : String(m?.text || m?.content || '').slice(0, 20000); });
      const url = field('External chat link', { max: 2000, placeholder: 'https://chatgpt.com/c/… or https://claude.ai/chat/…' }), pasted = field('Paste the actual result from that chat', { max: 20000, multiline: true, rows: 5 });
      const external = E('details', { class: 'qj-fold qj-proof-source' }, E('summary', { text: 'Show work from ChatGPT or Claude outside Hearth' }), url.node, pasted.node, p('The link is kept so you can open the source. Astra reviews the pasted result; it does not open or verify the remote chat.'), button('Use this pasted result', () => set(() => QuestReview.external(url.input.value.trim(), pasted.input.value)), 'qj-quiet'));
      const pending = C.latest(state, qid); if (pending && !pending.review) body.append(E('aside', { class: 'qj-starting-note' }, p(`Saved proof waiting: ${pending.proof.title}`), reviewJobs.has(qid) ? button('Cancel review', () => { reviewJobs.get(qid)?.cancel(); d.close(); reviewHistory(qid); }, 'qj-quiet') : button('Review saved proof', () => reviewSaved(qid, pending.id, feedback), 'qj-primary')));
      body.append(E('label', { class: 'qj-proof-drop' }, art(q.path), label('UP TO FOUR FILES / 80 MB TOTAL'), upload, p('Hearth keeps a copy. Pair a bounce with an arrangement screenshot, or show before and after. Images, short audio/video, text or code. Audio is a technical review; video uses three sampled frames.')), chatBox, external, intent.node, feedback, p('Submit sends this proof, your notes and earlier proof from this quest to Astra using your configured model and reasoning depth. Nothing is sent just by choosing a file. Reviews use your normal account usage.'), button('Submit proof & ask Astra', async () => { if (preparing) throw Error('Proof is still loading.'); if (!selected) throw Error('Upload proof or select actual work from a chat first.'); if (reviewJobs.has(qid)) throw Error('A review is already running for this quest.'); const item = await mutate(s => C.submit(s, qid, selected, intent.input.value), 'Proof saved. Asking Astra to review it…'); selected = null; await reviewSaved(qid, item.id, feedback); }, 'qj-primary'));
    }, 'KEEP WHAT YOU MADE / SEE YOUR PROGRESS');
  }
  const capTitle = value => String(value).replace(/\s+/g, ' ').slice(0, 110);
  function reviewShelf() {
    const quests = C.allQuests(state).filter(q => C.submissions(state, q.id).length);
    if (!quests.length) return;
    const grid = E('div', { class: 'qj-portfolio' });
    for (const q of quests) { const list = C.submissions(state, q.id), last = list.at(-1), rated = list.filter(x => x.review?.score != null), best = rated.length ? Math.max(...rated.map(x => x.review.score)) : null;
      const thumbnail = last.proof.images[0] && artifactPreview({ path: last.proof.images[0], label: last.proof.title });
      grid.append(E('article', { class: 'qj-portfolio-card', style: { '--path': pathOf(q.path).color } }, E('div', { class: 'qj-portfolio-cover' }, thumbnail || art(q.path), scoreDial(last.review?.score)), label(`${pathOf(q.path).name} / ${C.done(state, q.id) ? 'FINISHED' : 'IN PROGRESS'}`), E('h3', { text: q.title }), p(last.review?.summary || 'Proof saved. Review it when you are ready.'), label(`${list.length} VERSION${list.length === 1 ? '' : 'S'}${best == null ? '' : ` / BEST ${best}/100`}`), p(last.review?.coverage || last.proof.coverage), button('Open review & versions →', () => reviewHistory(q.id), 'qj-primary')));
    }
    content.append(grid);
  }
  function completionForm(qid, edit = false) {
    if (!edit) return finishQuest(qid);
    const q = C.find(state, qid), previous = C.record(state, qid); let artifact = previous.artifact || null;
    dialog(edit ? 'Keep the story of this quest' : 'A finished thing, however small.', (body, d) => {
      const note = field('What did you make or discover? (optional)', { multiline: true, value: previous.note, max: 2000, placeholder: 'Keep one sentence for future you.' });
      const attach = E('input', { type: 'file', attrs: { 'aria-label': 'Attach a keepsake', accept: 'image/*,audio/*,video/*,.json,.mid,.midi,.html,.txt,.zip' } });
      const fileName = p(artifact?.label || 'An image, sound, video or project file. It stays where it is.');
      attach.addEventListener('change', () => { const file = attach.files?.[0]; if (!file) return; const path = window.hub.pathForFile(file); if (!safePath(path)) { fileName.textContent = 'Choose a saved file from this computer.'; return; } artifact = { path, label: file.name, kind: file.type || 'file' }; if (artifact.kind.length > 30) artifact.kind = 'file'; fileName.textContent = file.name; });
      const confirm = E('input', { type: 'checkbox', attrs: { 'aria-label': 'I reached this finish line' } }); confirm.checked = edit;
      body.append(label('DONE MEANS'), p(q.done, 'qj-objective'), note.node, E('label', { class: 'qj-field' }, label('KEEP A SOUVENIR (OPTIONAL)'), attach), fileName, button('Remove attachment', () => { artifact = null; attach.value = ''; fileName.textContent = 'No file attached.'; }, 'qj-quiet'), E('label', { class: 'qj-confirm' }, confirm, E('span', { text: 'I reached this finish line.' })), button(edit ? 'Save keepsake' : `Complete quest · +${q.xp - C.earned(state, q)} XP`, async () => {
        if (!confirm.checked) throw Error('Confirm the finish line, or return to the smaller step.');
        const beforeState = C.clone(state), before = C.stats(beforeState), points = await mutate(s => { if (edit) { s.records[qid] = { ...s.records[qid], note: C.text(note.input.value, 2000), artifact }; return 0; } return C.complete(s, qid, { note: note.input.value, artifact }); }, 'Quest saved. Take a moment to enjoy that.');
        d.close(); if (!edit) { const after = C.stats(state), gains = C.gains(beforeState, state); celebrate(after.level.n > before.level.n ? `Level ${after.level.n}. A little further.` : after.campaigns > before.campaigns ? 'Campaign complete. You finished it.' : 'Quest complete.', `+${points} XP · ${q.title}`, [...gains.skills.map(s => `Skill reached: ${s.name}`), ...gains.rewards.map(r => `Ready to claim: ${r}`)]); }
      }, 'qj-primary'));
    }, pathOf(q.path).name);
  }
  async function focus(qid, minutes) {
    if (state.focus && state.focus.quest !== qid && (state.focus.end > Date.now() || (!state.focus.end && state.focus.remaining))) throw Error('Finish or end your current focus session first.');
    await mutate(s => { s.focus = { quest: qid, end: Date.now() + minutes * 60000, remaining: minutes * 60000 }; }, 'Five minutes for this one thing. The timer never completes a quest for you.');
  }
  const left = () => state?.focus ? state.focus.end ? Math.max(0, state.focus.end - Date.now()) : state.focus.remaining : 0;
  function tick() {
    if (!root || !state) return;
    if (C.day() !== daySeen) { daySeen = C.day(); if (page === 'adventure') render(); }
    const f = state.focus, bar = root.querySelector('.qj-focus'); if (!bar) return;
    bar.hidden = !f; if (!f) return;
    const remaining = Math.ceil(left() / 1000);
    bar.querySelector('.qj-focus-clock').textContent = remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Take a breath';
    bar.querySelector('.qj-focus-name').textContent = C.find(state, f.quest)?.title || 'Your focus session';
    const control=bar.querySelector('[data-focus="pause-timer"]'),text=!remaining?'Review quest':f.end?'Pause':'Resume';if(control.textContent!==text)actionLabel(control,text);
  }
  function navigate(to) { if(['campaigns','deck','commissions','life'].includes(to)){catalogFilter={path:to==='life'?'life':'all',format:['campaigns','commissions'].includes(to)?'project':to==='deck'?'small':'all',query:''};to='catalog';} const moved = to !== page; root?.querySelectorAll('audio,video').forEach(v => v.pause()); page = to; render(); if (moved && scrolledDown) root?.scrollTo({ top: 0, behavior: 'instant' }); } // (round 71, studioperf71) already at the top: nothing to scroll, no forced layout (24–58 ms per page change on a full journal here) // (round 65, questperf65) the same page (a filter, the Map tab while on the map) keeps its scroll: no forced layout
  async function exportJournal() { await saving.catch(() => {}); const r = await window.hub.saveFile({ defaultPath: `hearth-quest-journal-${C.day()}.json`, filters: [{ name: 'Quest journal', extensions: ['json'] }], content: JSON.stringify(state, null, 2) }); notice(r ? 'Journal exported, including progress and reward history. Attached files are referenced, not copied.' : 'Export cancelled.'); }
  function importJournal() {
    dialog('Restore a quest journal', (body, d) => {
      const input = E('input', { type: 'file', attrs: { accept: '.json', 'aria-label': 'Quest journal backup' } }), info = p('Choose an exported journal. Review it before replacing this journal. Attached files must still exist at their saved locations.');
      let imported = null;
      input.addEventListener('change', async () => { imported = null; try { const file = input.files?.[0]; if (!file) return; if (file.size > 8e6) throw Error('Choose a journal smaller than 8 MB.'); imported = C.validate(JSON.parse(await file.text())); const n = C.stats(imported); info.textContent = `${n.finished} quests · ${n.xp} XP · ${imported.campaigns.length} campaigns. A recovery copy of the current journal will be saved before replacement.`; } catch (err) { info.textContent = calmError(err); } });
      body.append(input, info, button('Replace with this journal', async () => { if (!imported) throw Error('Choose a valid journal first.'); const chosen = C.upgrade(C.clone(imported)); await mutate(async s => { const backup = await window.hub.kvSet('quest-journal-before-restore', C.clone(s)); if (backup?.error) throw Error(backup.error); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, chosen); }, 'Journal restored.'); d.close(); }, 'qj-primary'));
    }, 'YOUR PROGRESS, PORTABLE');
  }
  async function mount(body) {
    root = E('div', { class: 'qj', attrs: { 'aria-label': 'Quest journal' } }); body.append(root);
    const top = E('header', { class: 'qj-top' }, E('div', { class: 'qj-title' }, E('span', { class: 'qj-sigil', text: 'HQ', attrs: { 'aria-hidden': 'true' } }), E('div', {}, E('span',{class:'qj-label qj-console-name',text:'HEARTH / AFTER HOURS'}), E('h1', { text: 'Life' }))));
    const menu = button('Journal options', () => dialog('Your journal', b => b.append(p('Your journal is local. Explicit proof reviews use Astra and your normal account usage. No deadlines, missed-day penalties or automatic purchases.'), row(button('Export backup', exportJournal), button('Restore backup', e => { e.currentTarget.closest('dialog').close(); importJournal(); }), button('Export pre-restore recovery copy', async () => { const previous = await window.hub.kvGet('quest-journal-before-restore'); if (!previous) throw Error('No restore has been made yet.'); C.validate(previous); const r = await window.hub.saveFile({ defaultPath: 'hearth-quest-recovery.json', filters: [{ name: 'Quest journal', extensions: ['json'] }], content: JSON.stringify(previous, null, 2) }); notice(r ? 'Recovery copy exported. Use Restore backup to recover it.' : 'Export cancelled.'); })), p('One small start awards 5 XP once; completion awards the remainder. One spark is earned per five XP. Levels never drop from inactivity. Undoing a completion deliberately reverses its award.'))), 'qj-command-link');
    status = E('p', { class: 'qj-status', attrs: { role: 'status', 'aria-live': 'polite' }, text: 'Opening your journal…' }); content = E('main', { class: 'qj-content' });
    const focusBar = E('div', { class: 'qj-focus', hidden: true }, E('span', { class: 'qj-focus-clock' }), E('span', { class: 'qj-focus-name' }), button('Pause', async () => { if (!left()) return questDetail(state.focus.quest); const remaining = left(); await mutate(s => { if (s.focus.end) { s.focus.remaining = remaining; s.focus.end = 0; } else s.focus.end = Date.now() + s.focus.remaining; }); }, 'qj-quiet', 'pause-timer'), button('End focus', () => mutate(s => { s.focus = null; }, 'Focus ended. Your quest is waiting whenever you are.'), 'qj-quiet'));
    const nav = navigation(menu);
    root.addEventListener('scroll', () => { scrolledDown = root.scrollTop > 0; }, { passive: true }); // (round 71, studioperf71) see navigate()
    root.append(top, nav, content, status, focusBar);setupHints(); await load();
    try { legacy = await window.hub.kvGet('creative-playground'); } catch { /* Old notebook is never modified. */ }
    clearInterval(ticker); ticker = setInterval(() => { if (visible()) tick(); }, 1000);
    const surface = body.closest('.surface'); if (surface) new MutationObserver(() => { syncMotion(); if (H.activeId !== 'tool:quests') {hideHint();root.querySelectorAll('audio,video').forEach(v => v.pause());} }).observe(surface, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    document.addEventListener('visibilitychange', () => { syncMotion(); if (document.hidden) {hideHint();root.querySelectorAll('audio,video').forEach(v => v.pause());} else if(needsRender && visible())render(); });
  }
  Tools.define({ id: 'quests', name: 'Sidequest Studio', icon: '✦', color: '#d9b777', description: 'Your quests, next ideas and small victories', mount: body => mount(body).catch(err => { body.textContent = `Journal could not open: ${calmError(err)}`; }), onShow: () => { syncMotion(); if (state && needsRender) render(); else if(state){tick();if(page==='world')window.QuestMapFirst?.open();} } });
  Commands.register({ name: 'quests', area: 'Create', desc: 'Open your quest journal, campaigns, XP, skill tree and rewards', run: () => activate('tool:quests') });
  // parisquests61 (tools/quest-paris-ui.js): the same transactional mutate, a loaded flag, the map filter and the
  // journal's own UI helpers, so the Paris guide and `/quest` drive the journal instead of writing it behind its back.
  const parisHooks = { mutate, ready: () => writable && !!state, mapFilter(f = {}) { mapFilter = { kind: 'all', saved: false, query: '', ...f }; if (!f.guide) delete mapFilter.guide; navigate('world'); centerMapSelection(); }, ui: () => ({ E, button, label, p, row, dialog, mapIcon, notice, navigate, questDetail, mapPick, state: () => state }) };
  return { snapshot: () => C.clone(state), flush: () => saving, navigate, questDetail, finishQuest, paris: parisHooks, openOutings:outingDesk, keepOuting:async event=>{const eventId=await OutingDesk.keepEvent(event);return outingDesk({tab:'saved',eventId});}, get celebration() { return lastCelebration; }, mutate, ready: () => writable && Boolean(state), addMapLayer, addDetailHook, get page() { return page; } }; // (round 61, questhud61: mutate + ready for the rail's quest tracker; showsync61: addMapLayer + page for map layers)
})();
