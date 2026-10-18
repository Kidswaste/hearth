// (round 61, presethover61) /preset <description> for Serum 2 / Vital, registered at start: it shares the name with the
// Lab's trigger presets (/preset techno), so its `when` must answer before the creative group loads (a lazy stand-in's
// `when` says no until then). Everything else lives in tools/preset-hover.js (loaded with the creative group).
(() => {
  if (typeof Commands === 'undefined') return;
  const LAB = ['techno', 'house', 'hip-hop', 'trap', 'drum', 'drum & bass', 'rock', 'ambient'];
  // in the Creative Playground always; elsewhere unless you're in the Lab or the words are a Lab trigger preset's name
  const when = (ctx, args) => { const at = ctx?.place || '', s = String(args || '').trim().toLowerCase(); return at === 'creative' || (at !== 'three' && !!s && !LAB.some((n) => s === n || s.startsWith(`${n} /`))); };
  const run = async (args, ctx) => { if (typeof PresetHover === 'undefined') await Lazy.load('creative'); return PresetHover.command(args, ctx); };
  const complete = (a) => ['tweak', 'undo', 'redo', 'save', 'show', 'hide', 'engine'].filter((s) => s.startsWith(String(a || '').trim().toLowerCase())).map((value) => ({ value }));
  Commands.register({ name: 'preset', args: '<description> | tweak <words> | undo | redo | save [name]', desc: 'Write a Serum 2 / Vital preset from words (the Sound desk’s ✦ Preset window)', area: 'Create', when, whenLabel: 'for Serum 2 / Vital', run, complete, examples: ['/preset dark reese bass with slow movement', '/preset tweak brighter'], keywords: 'synth patch sound design vst serum vital ai' });
})();
