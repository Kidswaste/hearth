const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {attributes,pending}=require('../cloud-files');
(async()=>{
  for(const flag of [null,undefined,0x1000,0x40000,0x400000,0x401420])assert(pending(flag));
  for(const flag of [0,0x20,0x420,0x80420])assert(!pending(flag));
  let input='';
  const fake=(exe,args,options,done)=>{
    assert(/[\\/]System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i.test(exe),exe);assert(Buffer.from(args[args.indexOf('-EncodedCommand')+1],'base64').toString('utf16le').includes('GetAttributes'));assert(options.windowsHide);assert(options.timeout>0);
    return {stdin:{on(){},end(text){input=text;setImmediate(()=>done(null,JSON.stringify([{path:'C:/é space/$a`b',attributes:0x400000}])));}}};
  };
  const odd='C:/é space/$a`b';const rows=await attributes([odd,odd],{platform:'win32',execFile:fake});
  assert.deepEqual(JSON.parse(input),[odd]);assert(pending(rows.get(odd)));
  const failed=await attributes(['x'],{platform:'win32',execFile:(_e,_a,_o,done)=>{setImmediate(()=>done(Error('timeout')));return{stdin:{on(){},end(){}}};}});
  assert(pending(failed.get('x')));
  const malformed=await attributes(['x'],{platform:'win32',execFile:(_e,_a,_o,done)=>{setImmediate(()=>done(null,'broken'));return{stdin:{on(){},end(){}}};}});
  assert(pending(malformed.get('x')));
  assert.equal((await attributes(['x'],{platform:'darwin',execFile:()=>{throw Error('must not launch');}})).get('x'),0);
  if(process.platform==='win32'){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-cloud-attrs-'));
    try{
      const file=path.join(dir,"é space $name 'quote'.json");fs.writeFileSync(file,'{}');
      const r=await attributes([file,path.join(dir,'missing')]);
      assert(!pending(r.get(file)),'real Windows metadata probe supports UTF-8 / spaces / quotes');assert(pending(r.get(path.join(dir,'missing'))));
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  console.log('cloud-files: readiness, failure safety, quoted paths, and platform checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
