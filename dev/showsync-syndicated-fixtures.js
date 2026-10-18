const S=require('../showsync-syndicated');
function fixtures(now=Date.now()) {
  const iso=d=>new Date(now+d*86400e3).toISOString();
  const record=(slug,name,days=2,extra={})=>({uid:slug,title_fr:'Fixture '+name+' night',originagenda_uid:'9969608',location_name:name,location_address:'Paris',location_city:'Paris',location_coordinates:{lat:48.870573,lon:2.347382},status:JSON.stringify({id:1}),registration:JSON.stringify([{type:'link',value:'https://shotgun.live/events/fixture-'+slug}]),canonicalurl:'https://openagenda.com/shotgun/events/fixture-'+slug,updatedat:iso(-3),timings:JSON.stringify([{begin:iso(days),end:iso(days+0.25)}]),...extra});
  const records={rex:[record('rex','Rex Club')],phantom:[record('phantom','Phantom Paris',45,{location_coordinates:{lat:48.838669,lon:2.378482}})],'madame-loyal':[record('madame-paris','Paris festival',4,{title_fr:'Madame Loyal Paris',registration:JSON.stringify([{type:'link',value:'https://shotgun.live/festivals/fixture-madame-paris'}])}),record('madame-rennes','Rennes',5,{title_fr:'Madame Loyal Rennes',location_coordinates:{lat:48.057995,lon:-1.732003}})]};
  const responses={};for(const src of S.sources()){const rows=records[S.config(src).slug];responses[S.url(src,now)]={body:JSON.stringify({total_count:rows.length,results:rows})};}
  return {records,responses,record};
}
module.exports={fixtures};
