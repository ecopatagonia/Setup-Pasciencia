const Study = (() => {
 const windows=[['all','Histórico completo'],['2024','2024'],['2025','2025'],['2026','2026'],['critical','Período Crítico']];
 const combos=[['123','Op1 + Op2 + Op3'],['1','Op1'],['2','Op2'],['3','Op3'],['12','Op1 + Op2'],['13','Op1 + Op3'],['23','Op2 + Op3']];
 const validSL=o=>typeof o.sl==='number'&&Number.isFinite(o.sl)&&o.sl>0;
 const inWindow=(o,w,asOf)=>o.date<=asOf&&(w==='all'||(w==='critical'?o.date>='2026-09-10':o.date.startsWith(w+'-')));
 const select=(data,base,w,combo)=>data[base].filter(o=>inWindow(o,w,data.asOf)&&combo.includes(String(o.order)));
 const sum=a=>a.reduce((s,x)=>s+x,0);
 const mean=a=>a.length?sum(a)/a.length:null;
 const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
 function stats(rows,mode='ops') {
  let acc=0,peak=0,dd=0,wins=0,losses=0;const values=rows.map(o=>o.points);const daily=new Map();
  for(const o of rows)daily.set(o.date,(daily.get(o.date)||0)+o.points);
  for(const x of mode==='days'?[...daily.values()]:values){acc+=x;peak=Math.max(peak,acc);dd=Math.max(dd,peak-acc)}
  for(const x of values){if(x>0)wins+=x;else losses-=x}
  return {n:rows.length,days:daily.size,points:sum(values),dd,ratio:dd?sum(values)/dd:null,pf:losses?wins/losses:wins?Infinity:null,mean:mean(values),median:median(values),winRate:rows.length?100*values.filter(x=>x>0).length/rows.length:null,wins,losses};
 }
 function simulate(rows,cut,mode='ops') {
  const removed=rows.filter(o=>cut!==null&&validSL(o)&&o.sl>cut);
  const kept=rows.filter(o=>!(cut!==null&&validSL(o)&&o.sl>cut));
  const gains=removed.filter(o=>o.points>0),losses=removed.filter(o=>o.points<0),zeros=removed.filter(o=>o.points===0);
  const gainValues=gains.map(o=>o.points),lossValues=losses.map(o=>-o.points);
  const before=stats(rows,mode),after=stats(kept,mode);
  return {before,after,kept,removed,gains,losses,zeros,missing:rows.filter(o=>!validSL(o)),sacrificed:sum(gainValues),saved:sum(lossValues),net:after.points-before.points,gainMean:mean(gainValues),gainMedian:median(gainValues),lossMean:mean(lossValues),lossMedian:median(lossValues)};
 }
 function curve(rows,cut,mode='ops') {
  let a=0,b=0,pa=0,pb=0;const result=[];
  if(mode==='days'){
   const map=new Map();for(const o of rows){if(!map.has(o.date))map.set(o.date,{date:o.date,order:null,a:0,b:0});const d=map.get(o.date);d.a+=o.points;if(!(cut!==null&&validSL(o)&&o.sl>cut))d.b+=o.points}
   for(const d of map.values()){a+=d.a;b+=d.b;pa=Math.max(pa,a);pb=Math.max(pb,b);result.push({...d,a,b,da:a-pa,db:b-pb})}
  }else for(const o of rows){a+=o.points;if(!(cut!==null&&validSL(o)&&o.sl>cut))b+=o.points;pa=Math.max(pa,a);pb=Math.max(pb,b);result.push({date:o.date,order:o.order,a,b,da:a-pa,db:b-pb})}
  return [{date:rows[0]?.date||'',order:null,a:0,b:0,da:0,db:0},...result];
 }
 return {windows,combos,validSL,inWindow,select,stats,simulate,curve,mean,median};
})();
if(typeof module!=='undefined')module.exports=Study;
