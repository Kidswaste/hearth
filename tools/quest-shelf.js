(function(root, make) { if(typeof module === 'object') module.exports=make(); else root.QuestShelf=make(); })(typeof self !== 'undefined' ? self : this, () => {
  const local=p=>typeof p==='string'&&/^(?:[a-z]:[\\/]|\/)/i.test(p)&&!/^[/\\]{2}|[\x00-\x1f]/.test(p)&&p.length<=2000;
  function media(message){
    const found=[],add=(path,title)=>{if(typeof path==='string'&&path.startsWith('file:'))try{const url=new URL(path);if(url.hostname)return;path=decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i,'$1');}catch{return;}if(local(path)&&!found.some(x=>x.path===path)&&found.length<12)found.push({path,title:String(title||path.split(/[\\/]/).pop()).slice(0,200)});};
    for(const x of ['things','attachments','images'].flatMap(k=>Array.isArray(message?.[k])?message[k]:[])){if(typeof x==='string')add(x);else if(x)add(x.path||x.filePath,x.name||x.title);}
    const text=typeof message?.text==='string'?message.text:typeof message?.content==='string'?message.content:'';
    for(const m of text.matchAll(/\]\(<?((?:file:\/\/\/|[a-z]:[\\/]|\/)[^\n)<>]+)>?\)/gi))add(m[1]);
    // Native.packAttachments retains file paths in one terminal structured block;
    // attachment metadata deliberately retains only names/kinds. Never scan the
    // rest of the sent prompt for arbitrary path-looking text.
    const files=Array.isArray(message?.attachments)?message.attachments.filter(x=>x?.kind==='file'):[];
    if(files.length&&files.length<=12&&typeof message?.sent==='string'){
      const block=message.sent.slice(-32768).match(/(?:^|\r?\n\r?\n)\[Attached files, open them with your (?:read-only commands|Read tool)\]\r?\n([\s\S]*)$/);
      if(block){const paths=block[1].trim().split(/\r?\n/);if(paths.length===files.length&&paths.every(local))paths.forEach((path,i)=>add(path,files[i].name));}
    }
    return found;
  }
  return {local,media};
});
