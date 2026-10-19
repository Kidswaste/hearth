// Validate large drawings / storyboard images without JSON passes on the UI thread.
importScripts('workbench-core.js');
onmessage=({data})=>{try{postMessage({value:WorkbenchCore.validate(typeof data==='string'?JSON.parse(data):data)});}catch(e){postMessage({error:e.message});}};
