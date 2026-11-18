/* Results always come from the dashboard. GIO's supplemental file contains stop metadata only. */
const SLData = (() => {
 const number = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw=value.trim().replace(/\s/g,'');
  const n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
  return Number.isFinite(n)?n:null;
 };
 const validStop=value=>{const n=number(value);return n!==null&&n>0?n:null};
 function normalize(rows,base,metadata){
  const normalized=[],seen=new Set(),duplicates=[];
  for(const row of Array.isArray(rows)?rows:[]){
   const id=String(row.id||''),match=id.match(/^OP_(\d{2})-(\d{2})-(\d{4})__([123])$/);
   if(!match)continue;
   if(seen.has(id)){duplicates.push(id);continue}seen.add(id);
   const date=String(row.dataHoraIso||'').slice(0,10),expected=`${match[3]}-${match[2]}-${match[1]}`;
   const points=number(row.pontos),side=String(row.lado||'').trim().toUpperCase();
   if(date!==expected||points===null||!['COMPRA','VENDA'].includes(side))continue;
   const liveStop=validStop(row.tamanhoStop??row.tamanho_stop??row.TAMANHO_STOP);
   const meta=base==='gio'?metadata?.stops?.[id]:null;
   const supplemental=meta&&meta.date===date&&meta.side===side?validStop(meta.sl):null;
   normalized.push({id,date,order:Number(match[4]),entry:number(row.candleEntrada),side,points,sl:liveStop??supplemental,slSource:liveStop!==null?'API':supplemental!==null?'GIOLVAN':''});
  }
  normalized.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);
  return {rows:normalized,duplicates};
 }
 function fromDashboard(payload,metadata){
  const gatto=normalize(payload?.gatto,'gatto',metadata),gio=normalize(payload?.gio,'gio',metadata);
  const dates=[...gatto.rows,...gio.rows].map(o=>o.date).sort();
  return {asOf:dates.at(-1)||'',retrievedAt:payload?.read||'',source:'API do painel',gatto:gatto.rows,gio:gio.rows,
   gioPending:Array.isArray(payload?.gioPendingOperations)?payload.gioPendingOperations:[],
   gioStopUpdatedAt:metadata?.updatedAt||'',gioStopThrough:metadata?.through||'',duplicates:[...gatto.duplicates,...gio.duplicates]};
 }
 return {number,validStop,normalize,fromDashboard};
})();
if(typeof module!=='undefined')module.exports=SLData;
