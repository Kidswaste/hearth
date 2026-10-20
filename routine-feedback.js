// Optional visual evidence for a project routine. The scheduler owns spending and cancellation.
const RoutineFeedback = (() => {
  function binding(agentId,chatId) {
    const p=window.ProjectWorkspace?.current?.(),c=window.ProjectWorkspace?.currentChat?.(),sceneId=window.ProjectWorkspace?.currentScene?.();
    return p&&c?.id===chatId&&c.agentId===agentId&&H.agent(agentId)?.engine==='codex'&&sceneId ? {projectId:p.id,sceneId} : null;
  }
  function assertCurrent(r) {
    const b=binding(r.agentId,r.chatId);
    if(!b||b.projectId!==r.feedback.projectId||b.sceneId!==r.feedback.sceneId)throw Error('Reopen this project, scene and chat before resuming visual Auto-improve.');
    if(Native.isBusy(r.chatId))throw Error('The project chat is busy. Resume after its reply finishes.');
  }
  function edit(value,r) {
    if(!value.meta.complete)throw Error('The visual review is incomplete; no edit was sent.');
    if(!value.result.issues.length)return {done:true};
    const issue=value.result.issues[0],sheets=[...new Set(issue.evidence.map(n=>value.packet.sheets[Math.floor((n-1)/6)]))].filter(Boolean);
    return {text:`Your standing goal: ${r.prompt}\n\nUse this fresh visual review to choose ONE small improvement for this round. It is a second opinion, not proof of the implementation cause. Inspect the current scene first; do not undo a previous fix merely because the reviewer suggested it.\n\n${VisualFeedbackCore.fixPrompt(value.result,[0],value.packet,{name:r.title})}\n\nEnd with "Changed: …" and what you actually verified.`,images:sheets};
  }
  async function run(r,chat,{signal,beforeCall,onUsage,onSaved,status=()=>{}},overrides={}) {
    await Lazy.load('visualfeedback');await Lazy.load('lab');
    const io={record:async(ctx,seconds)=>{
      const tab=store.get('workspace.returnPoints',{})[ctx.projectId]?.tab||'chat';
      // Chromium suspends animation in display:none iframes even when the scene is unparked.
      // Keep the selected conversation, show the live canvas for the take, then restore the owner's tab.
      await ProjectWorkspace.go('scene');
      try{return await VisualFeedback.recordScene(ctx,seconds,signal,status,{showScene:false});}
      finally{if(ProjectWorkspace.current()?.id===ctx.projectId&&ProjectWorkspace.currentScene()===ctx.sceneId&&ProjectWorkspace.currentChat()?.id===ctx.chatId&&H.activeId==='tool:three'&&tab!=='scene')await ProjectWorkspace.go(tab);}
    },round:VisualFeedback.round,review:VisualFeedback.review,save:VisualFeedback.saveReview,...overrides};
    assertCurrent(r);signal.throwIfAborted();
    if(VisualFeedback.busy)throw Error('Another feedback round is running. Resume after it finishes.');
    const scene=ThreeLab.scenes.get(r.feedback.sceneId);
    if(!scene||ThreeLab.scenes.currentId()!==scene.id)throw Error('Open this project’s Scene once before starting visual Auto-improve.');
    const revision=JSON.stringify(scene.layers),messages=JSON.stringify(chat.messages),model=chat.model||H.agent(r.agentId).model;
    let error=null;
    const ownership=()=>{if(error)throw error;signal.throwIfAborted();assertCurrent(r);if((chat.model||H.agent(r.agentId).model)!==model)throw Error('The model changed during feedback. Start a new run.');};
    const valid=()=>{ownership();if(JSON.stringify(ThreeLab.scenes.get(scene.id)?.layers)!==revision||JSON.stringify(chat.messages)!==messages)throw Error('The scene or conversation changed during feedback. Resume to review its latest version.');};
    const ctx={projectId:r.feedback.projectId,sceneId:r.feedback.sceneId,agentId:r.agentId,chatId:r.chatId,name:ProjectWorkspace.current().name,chatTitle:chat.title,messages:VisualFeedbackCore.recent(chat.messages)};
    const previous=r.feedbackLast?.complete?`Previous pass: ${r.feedbackLast.summary}. Suggested change: ${r.feedbackLast.change||'none'}. Recheck the new evidence; drop resolved or unsupported findings.`:'';
    const direction=`${r.feedback.direction||'Find the most useful visible improvement while preserving the project’s identity.'}\nOwner’s goal: ${r.prompt.slice(0,1200)}\n${previous}`.slice(0,2500);
    const watch=setInterval(()=>{try{ownership();}catch(e){error=e;}},250);
    const guard=async()=>{if(error)throw error;valid();await beforeCall();if(error)throw error;valid();};
    try {
      await guard();status('Recording the current scene for feedback…');
      const file=await io.record(ctx,r.feedback.seconds);valid();
      const info=await FrameRead.info(file);valid();
      if(info.frames<2||info.duration<1)throw Error('The recording is too short to review motion. Reopen the scene and resume; no review was sent.');
      const id=crypto.randomUUID();
      const save=async value=>{const saved=await io.save(ctx,direction,value,{id,routineId:r.id});await onSaved(saved.entry);};
      const value=await io.round({file,ctx,direction,mode:'auto',signal,status,onPartial:save},{review:async(packet,context,words,progress,abort)=>{
        await guard();
        return io.review(packet,context,words,progress,abort,{agentId:r.agentId,model:chat.model||H.agent(r.agentId).model,effort:chat.effort||H.agent(r.agentId).effort,onUsage});
      }});
      await save(value);valid();
      return {...edit(value,r),valid};
    } finally {clearInterval(watch);}
  }
  return {binding,assertCurrent,edit,run};
})();
