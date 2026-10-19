(function(root,make){if(typeof module==='object')module.exports=make();else root.QuestAtlasIndex=make();})(typeof self!=='undefined'?self:this,()=>{
  const xy=(lat,lon)=>{const r=Math.min(85,Math.max(-85,lat))*Math.PI/180;return [(lon+180)/360,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2];};
  function build(points){const cells=new Map(),coords=[];points.forEach((p,i)=>{if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;const [x,y]=xy(p.lat,p.lon),key=`${Math.floor(x*4096)}:${Math.floor(y*4096)}`;const row={i,x,y,min:p.minZoom||11,id:p.id};coords.push(row);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(row);});return {cells,coords};}
  function query(index,{left,top,width,height,z,selected}){const n=256*2**z,l=(left-80)/n,t=(top-40)/n,r=(left+width+80)/n,b=(top+height+40)/n,rows=[];
    const add=p=>{if((z>=p.min||p.id===selected)&&p.x>=l&&p.x<=r&&p.y>=t&&p.y<=b)rows.push([p.i,p.x*n,p.y*n]);};
    const x0=Math.floor(l*4096),x1=Math.floor(r*4096),y0=Math.floor(t*4096),y1=Math.floor(b*4096);
    if((x1-x0+1)*(y1-y0+1)>10000)index.coords.forEach(add);else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)(index.cells.get(`${x}:${y}`)||[]).forEach(add);
    return rows.sort((a,b)=>a[0]-b[0]);
  }
  return {xy,build,query};
});
