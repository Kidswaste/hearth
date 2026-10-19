// Local project missions. Read names/links only: no scene execution, chat mining or model call.
(function(root,make){const api=make();if(typeof module==='object')module.exports=api;else root.QuestProject=api;})(typeof self!=='undefined'?self:this,()=>{
  const cap=(v,n=100)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
  const key=v=>{let a=2166136261,b=5381;for(const c of String(v)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(36)+(b>>>0).toString(36);};
  const step=(id,title,instruction,tab='scene',check='manual')=>({id,title,instruction,check,target:tab,action:{type:'project',tab}});
  function catalog(project,scenes=[]){
    if(!project?.id)return [];
    const name=cap(project.name,48),items=project.items||[],scene=scenes.find(s=>s.id===project.workspace?.sceneId)||scenes.find(s=>items.some(i=>i.type==='scene'&&i.ref===s.id));
    const layers=(scene?.layers||[]).filter(l=>l.visible!==false),out=[];
    function add(topic,target,title,goal,first,middle,last,{path='game',tab='scene',test=false,source=null}={}){
      const sceneId=tab==='scene'?scene?.id:null;
      const q={id:'q-project-'+key([project.id,sceneId,topic,target].join('/')),projectId:project.id,projectName:name,
        projectTask:{v:1,topic,target:cap(target),sceneId,layerId:source?.id||null,source:cap(source?.name||scene?.name||name)},
        title:cap(title,250),done:cap(goal,1000),tiny:cap(first,500),deep:'Only after this is done: choose one follow-up from your review.',
        path,tool:tab==='sound'?'rack':tab==='board'?'tiles':tab==='chat'?'files':'lab',minutes:test?10:15,xp:test?35:45,
        guideSteps:[step('first-move',test?'Set up the test':'Pick one detail',first,tab),
          step('project-work',test?'Run the cases':'Make the change',middle,tab,test||tab==='chat'?'manual':'project-change'),
          step('try-it',test?'Record the verdict':'Compare and decide',last,tab),
          step('keep-proof','Keep your proof',test?'Keep a short clip or a written test report in this project’s chat: input, expected result, actual result and pass/fail for each case. A failed test is useful evidence; fixing it is a separate quest. Submit it for review.':'Keep a before/after image or a short clip in this project, or a chat with the actual change and test results. Submit that evidence for review and XP.','chat') ]};
      if(sceneId)for(const s of q.guideSteps)if(s.action.tab==='scene')s.action.sceneId=sceneId;
      out.push(q);
    }
    if(scene){
      const named=layers.filter(l=>/^fighters?\s*[•:–—-]/i.test(l.name||'')).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
      const characters=[];
      for(const l of named){const tail=l.name.replace(/^fighters?\s*[•:–—-]\s*/i,'');for(const part of tail.split(/\s*(?:&|,|\band\b)\s*/)){const t=cap(part,40);if(/^[A-ZÀ-Ý][\p{L}'’-]*(?: [A-ZÀ-Ý][\p{L}'’-]*)?$/u.test(t)&&!characters.some(c=>c.name===t))characters.push({name:t,layer:l});}}
      const polish=c=>add('character',c.name,`${name}: polish ${c.name}’s attack`,
        `Improve one attack pose or transition for ${c.name}. Show a before/after and test it at normal game speed. Stop at one move.`,
        `Open ${scene.name}. Play ${c.name} and repeat one attack five times. Note the least readable moment; keep a before image or clip.`,
        `In “${c.layer.name}”, adjust that attack’s anticipation, contact pose or recovery. You can ask the project chat for this exact change. Save one version; Hearth observes a saved scene change, not animation quality.`,
        `Repeat the same attack five times at normal speed, then try it facing the other way. Compare the before/after: can you read the attack and return to idle? Write one verdict.`,{source:c.layer});
      if(characters[0])polish(characters[0]);
      const combat=layers.find(l=>/^combat\b.*guard/i.test(l.name||''))||layers.find(l=>/^combat\b/i.test(l.name||''));
      if(combat){const guard=/guard/i.test(combat.name),target=guard?'guard':cap(combat.name.replace(/^combat\s*[•:–—-]\s*/i,''),60);
        add('mechanic',combat.id,`${name}: test ${target}`,`Run three cases for ${target}: normal use, repeated input and an awkward edge case. Keep a pass/fail report with expected and actual results. No code change is required.`,
          `Open ${scene.name}. ${guard?'Choose a fighter and an opponent; note what you expect blocking to stop.':`Find the control for “${target}” and write its expected result.`}`,
          guard?'Block five attacks from the front, try five from behind, then release guard and attack. Record what happens each time; do not assume every attack should be blocked.':`Try “${target}” once, repeat its input five times, then try it while moving or at a boundary. Record expected and actual behavior.`,
          'Mark each case pass or fail. For any failure, repeat it once and write the shortest reproduction steps. If everything passes, name the edge case you checked.',{test:true,source:combat});}
      if(characters[1])polish(characters[1]);
      const shop=layers.find(l=>/^shop\b/i.test(l.name||''));
      if(shop)add('shop',shop.id,`${name}: test one shop purchase`,'Test one affordable purchase and one you cannot afford. Check the price, balance, reward and feedback; keep a short result report.',
        `Open ${scene.name}’s shop. Note your balance and the price of one item before buying.`,
        'Buy one affordable item. Check the balance changed by its price and the item arrived. Then try an unaffordable item and check that no money or item changes.',
        'Check that the feedback explains both outcomes. Record expected versus actual results and one confusing detail to polish next.',{test:true,source:shop});
      const visual=layers.find(l=>/^(sky|stage|background|light|material|subject)\b/i.test(l.name||''))||layers.find(l=>!/^layer \d+$/i.test(l.name||''));
      if(visual)add('scene',visual.id,`${name}: polish ${cap(visual.name,65)}`,`Improve one visible detail in “${cap(visual.name,100)}”. Compare before/after at full scene size and keep the clearer version.`,
        `Open ${scene.name} and find “${cap(visual.name,100)}”. Capture how it looks now; choose one color, lighting or motion detail to improve.`,
        `Change only that detail in “${cap(visual.name,100)}”. Save a version. Hearth checks a scene save; you judge whether the detail improved.`,
        'Preview the whole scene, then compare the same moment before and after. Check that the main subject stays readable. Keep the stronger version and say why.',{path:characters.length?'game':'visual',source:visual});
      if(!out.length)add('scene-first',scene.id,`${name}: finish one moment in ${cap(scene.name,60)}`,`Improve one visible moment in ${cap(scene.name,100)} and keep a before/after with a short verdict.`,
        `Open ${scene.name}. Pause on one moment that feels unfinished and capture it. Name exactly one thing you want to change.`,
        'Make that single change in this scene and save it. Keep its framing so you can compare the same moment.',
        'Play the scene from the start. Check that your change helps the whole piece, then keep the stronger version with one sentence explaining why.',{path:'visual'});
    }
    const plugins=(project.workspace?.plugins||[]).filter(x=>['Serum 2','Vital'].includes(x));
    if(plugins.length)add('sound',plugins[0],`${name}: shape one ${plugins[0]} sound`,`Save a ${plugins[0]} preset for ${name}. Keep a short phrase demonstrating its attack and tail, with one sentence explaining its role.`,
      `Open ${plugins[0]} in ${name}’s Sound desk. Choose one role: bass, lead or atmosphere. Play a four-note phrase before changing anything.`,
      'Adjust the envelope and one filter or effect to fit that role. Save the preset; Hearth checks the saved sound change.',
      'Play the same phrase softly and hard. Check attack, tail and level; explain how you would use the sound.',{path:'music',tab:'sound'});
    if(!scene&&!plugins.length)add('brief',project.id,`${name}: define the next playable or visible result`,`Keep a three-line brief for ${name}: the exact thing to make, how you will test it and the smallest finished version.`,
      `Open ${name}’s chat. Read the project’s latest work and name one specific unfinished object, interaction or sound.`,
      'Write a three-line brief naming that target, one action to improve it and a concrete test. Keep it small enough for one sitting.',
      'Read the brief as if you were starting tomorrow. Replace vague words with the object’s name and a visible or audible finish line.',{path:'visual',tab:'chat',test:true});
    return out;
  }
  function choose(project,candidates,journal,C){
    const usable=q=>q&&!C.done(journal,q.id)&&!C.skipped(journal,q.id)&&!q.parked&&C.available(journal,q.id);
    const existing=C.allQuests(journal).filter(q=>q.projectTask&&q.projectId===project.id&&usable(q));
    return existing.find(q=>q.id===journal.plan?.quest)||existing[0]||candidates.find(q=>!C.find(journal,q.id))||null;
  }
  function track(s,q,C){
    if(C.find(s,q.id))return;
    // Project quests have their own chapter; they do not consume the three daily side slots.
    const prefix='c-project-'+key(q.projectId+'/'+q.path);
    let c=s.campaigns.find(c=>c.id.startsWith(prefix+'-')&&!c.paused&&c.quests.length<12&&c.quests.every(q=>C.done(s,q.id)||C.skipped(s,q.id)));
    if(!c){if(s.campaigns.length>=100)throw Error('Your quest log is full. Keep an existing project quest for now.');c={id:prefix+'-'+s.campaigns.filter(c=>c.id.startsWith(prefix+'-')).length,title:cap(q.projectName,80)+' · project quests',why:'Small missions from this project’s own scenes and tools.',path:q.path,projectId:q.projectId,custom:true,subtitle:'PROJECT QUESTS',badge:q.projectName,quests:[]};s.campaigns.push(c);}
    c.quests.push(C.clone(q));s.active=c.id;
  }
  return {catalog,choose,track};
});
