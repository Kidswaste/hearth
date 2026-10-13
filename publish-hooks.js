// Ready to post (round 27, publishkit): the ways in that exist before the kit itself loads (publishkit.js loads on
// first use). PublishHooks.open(file) is what the render queue's "📮 Post" buttons call (renders.js), and the ◎ mission
// "Get it ready to post" (missions.js Missions.add) takes the newest finished render, opens the kit and has this
// chat's AI write the title, description and hashtags. Nothing is ever uploaded.
const PublishHooks = (() => {
  const isVideo = (p) => /\.(mp4|mov|m4v|webm)$/i.test(String(p || ''));
  async function kit() {
    if (window.Lazy?.load) await window.Lazy.load('publishkit');
    if (typeof PublishKit === 'undefined') throw new Error('Ready to post isn\'t loaded');
    return PublishKit;
  }
  const open = (file, o = {}) => kit().then((K) => K.open(file, o)).catch((err) => { toast(err.message, { type: 'error' }); return null; });
  if (typeof Missions !== 'undefined' && Missions.add) {
    Missions.add({ id: 'post', icon: '📮', label: 'Get it ready to post', desc: 'Your newest render, checked for Shorts / TikTok / Reels / YouTube (size, length, loudness, what the app\'s buttons cover, the loop), cover ideas, and this AI writes the title, description and hashtags. You post it yourself.',
      submit: (agentId, text) => { kit().then((K) => K.mission(agentId, text)).catch((err) => toast(err.message, { type: 'error' })); return true; } });
  }
  return { open, isVideo };
})();
window.PublishHooks = PublishHooks;
