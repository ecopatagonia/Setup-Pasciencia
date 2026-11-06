(function(root){
  'use strict';
  function number(v){
    if(v===null||v===undefined||String(v).trim()==='')return null;
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    let s=String(v).replace(/R\$|pts|\s/g,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    return /^[-+]?\d*\.?\d+$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;
  }
  function identity(id){
    const m=String(id||'').match(/^OP_(\d{2})-(\d{2})-(\d{4})__(\d+)$/);
    return m?{id:String(id),date:m[3]+'-'+m[2]+'-'+m[1],line:Number(m[4])}:null;
  }
  function fromPayload(payload){
    const raw=payload?.comparativoGio??payload?.comparativoProtegido;
    if(!Array.isArray(payload?.operacoes)||!Array.isArray(raw))throw Error('A API não forneceu as duas bases. Atualize os dados no painel principal.');
    const gatto=new Map(),seen=new Set(),rows=[],records=[],audit=[];
    for(const op of payload.operacoes){
      const item=identity(op.id);if(!item)continue;
      if(gatto.has(item.id))throw Error('ID duplicado na base GATTO: '+item.id);
      const points=number(op.pontos),financial=number(op.financeiro);
      gatto.set(item.id,{...item,points:points!==null?points:financial===null?null:financial/.2});
    }
    for(const op of raw){
      const arr=Array.isArray(op),item=identity(arr?op[0]:op.id??op.ID);
      if(!item)continue;
      if(seen.has(item.id))throw Error('ID duplicado na base GIO: '+item.id);
      seen.add(item.id);
      const protectedValue=number(arr?op[5]:op.protected??op.executadoProtegendo??op['EXECUTADO PROTEGENDO']);
      const original=number(arr?op[3]:op.original??op.executadoReal??op['EXECUTADO REAL']);
      const base=gatto.get(item.id);
      const status=![1,2,3].includes(item.line)?'foraLinha':protectedValue===null?'pendentes':!base?'semPar':base.points===null?'semResultadoGatto':'paired';
      const rec={...item,status};
      if(status==='paired'){
        const a=Math.round(base.points*20),b=Math.round(protectedValue*20),o=original===null?null:Math.round(original*20);
        rows.push({...item,a,b,original:o});rec.originalDifferent=o!==null&&a!==o;
      }else audit.push({...item,motivo:status});
      records.push(rec);
    }
    for(const [id,op]of gatto)if(!seen.has(id)){records.push({...op,status:'gattoOnly'});audit.push({...op,motivo:'gattoOnly'});}
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.line-b.line);
    return {rows,records,audit,read:payload.geradoEm||null,source:'API · mesma indexação do site',columns:{idGatto:'A',idGio:'Q',gatto:'L',gio:'V',originalGio:'T'}};
  }
  root.PuloLineComparisonData={fromPayload};
  if(typeof module!=='undefined')module.exports={fromPayload};
})(typeof window!=='undefined'?window:globalThis);
