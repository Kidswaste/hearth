importScripts('quest-atlas-index.js');
let index;
onmessage=({data})=>{try{if(data.points)index=QuestAtlasIndex.build(data.points);postMessage({key:data.key,rows:QuestAtlasIndex.query(index,data.view)});}catch(e){postMessage({key:data.key,error:e.message});}};
