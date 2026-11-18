'use strict';
let DATA=SLData.fromDashboard(null,window.PuloGioStopMetadata);
const $=id=>document.getElementById(id), nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}),mf=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmt=x=>x===null||x===undefined?'—':x===Infinity?'∞':nf.format(x),money=x=>x===null||x===undefined?'—':mf.format(x*.2),pct=x=>fmt(x)+'%',date=s=>s?s.split('-').reverse().join('/'):'—',cls=x=>x>1e-7?'pos':x< -1e-7?'neg':'',sign=x=>x>0?'+':'';
const moneySign=x=>sign(x)+money(x),pts=x=>fmt(x)+' pts',both=x=>pts(x)+'<small>'+money(x)+'</small>';
let cut=350,current=null,scanResults=[],opLimit=100,lastRows=[],chartSeries=[];
$('window').innerHTML=Study.windows.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
$('combo').innerHTML=Study.combos.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
const selectedRows=()=>Study.select(DATA,$('base').value,$('window').value,$('combo').value);
function pair(label,a,b){return `<span>${label}</span><span>${a}${b?'<small>'+b+'</small>':''}</span>`}
function render(){
 const base=$('base').value,window=$('window').value,combo=$('combo').value,mode=$('mode').value,rows=selectedRows(),r=Study.simulate(rows,cut,mode);current=r;lastRows=rows;
 const maxSL=Math.max(1000,...DATA[base].filter(Study.validSL).map(o=>o.sl),cut||0);$('slider').max=Math.ceil(maxSL/50)*50;$('cut').value=cut===null?'':cut;$('slider').disabled=cut===null;if(cut!==null)$('slider').value=cut;
 $('cut').placeholder='Sin corte';document.querySelector('.filter-title').innerHTML=cut===null?'Todas las operaciones · sin corte':`Excluir SL inicial &gt; <span id="cutLabel">${fmt(cut)}</span> pts`;
 document.querySelectorAll('[data-cut]').forEach(b=>b.setAttribute('aria-pressed',String(cut===Number(b.dataset.cut))));$('noCut').setAttribute('aria-pressed',String(cut===null));
 const all=DATA[base],pending=base==='gio'?DATA.gioPending.filter(o=>Study.inWindow(o,window,DATA.asOf)&&combo.includes(String(o.order))).length:0;
 const supplemental=rows.filter(o=>o.slSource==='GIOLVAN').length;
 $('coverage').textContent=(base==='gio'?'GIO · cobertura parcial en 2024 y 2025. '+pending+' registros pendientes de resultado en esta selección. SL propios de GIOLVAN en '+supplemental+' operaciones; mapa verificado hasta '+date(DATA.gioStopThrough)+' (consulta '+DATA.gioStopUpdatedAt+'). ':'GATTO · tamaño stop de la API actual. ')+`SL sin valor válido: ${r.missing.length}; se conservan en ambos escenarios.`;
 $('context').textContent=`Carga del panel ${DATA.retrievedAt} · ${rows.length} operaciones con resultado / ${r.before.days} pregones con registros · ${date(rows[0]?.date)} — ${date(rows.at(-1)?.date)} · Campo: Tamaño stop · 1 contrato`;
 const removedPct=rows.length?100*r.removed.length/rows.length:0;
 $('stats').innerHTML=[['Operaciones excluidas',fmt(r.removed.length),`${pct(removedPct)} de ${fmt(rows.length)} · quedan ${fmt(r.kept.length)}`,''],['Resultado con corte',money(r.after.points),`Original ${money(r.before.points)}`,cls(r.after.points)],['Efecto neto del corte',moneySign(r.net),`Pérdidas evitadas − ganancias sacrificadas`,cls(r.net)],['Drawdown máximo',money(r.after.dd),`Original ${money(r.before.dd)} · ${mode==='ops'?'por operación':'por pregón'}`,'']].map(([l,v,t,c])=>`<div class="stat"><small>${l}</small><div class="value ${c}">${v}</div><small>${t}</small></div>`).join('');
 const ddDiff=r.after.dd-r.before.dd;
 $('verdict').innerHTML=!rows.length?'No hay operaciones con resultado disponible en esta selección.':cut===null?'Sin corte: el escenario reproduce el histórico original.':`Con este corte, el resultado ${r.net>0?'mejora':r.net<0?'disminuye':'no cambia'} <b class="${cls(r.net)}">${money(Math.abs(r.net))}</b> y el drawdown ${ddDiff<0?'baja':ddDiff>0?'sube':'no cambia'}${ddDiff?' <b class="'+cls(-ddDiff)+'">'+money(Math.abs(ddDiff))+'</b>':''}. Resultado/DD: <b>${fmt(r.before.ratio)} → ${fmt(r.after.ratio)}</b>.${r.after.n===0?' No quedan operaciones para evaluar la eficiencia.':''}`;
 $('gains').innerHTML=pair('Cantidad excluida',fmt(r.gains.length),`${pct(rows.length?100*r.gains.length/rows.length:0)} del total · ${pct(r.removed.length?100*r.gains.length/r.removed.length:0)} de las excluidas`)+pair('Ganancias sacrificadas',pts(r.sacrificed),money(r.sacrificed))+pair('Media por ganadora',r.gainMean===null?'—':pts(r.gainMean),r.gainMean===null?'':money(r.gainMean))+pair('Mediana por ganadora',r.gainMedian===null?'—':pts(r.gainMedian),r.gainMedian===null?'':money(r.gainMedian));
 $('losses').innerHTML=pair('Cantidad excluida',fmt(r.losses.length),`${pct(rows.length?100*r.losses.length/rows.length:0)} del total · ${pct(r.removed.length?100*r.losses.length/r.removed.length:0)} de las excluidas`)+pair('Pérdidas evitadas',pts(r.saved),money(r.saved))+pair('Media ahorrada por perdedora',r.lossMean===null?'—':pts(r.lossMean),r.lossMean===null?'':money(r.lossMean))+pair('Mediana ahorrada por perdedora',r.lossMedian===null?'—':pts(r.lossMedian),r.lossMedian===null?'':money(r.lossMedian));
 $('balance').innerHTML=`<span>${money(r.saved)} evitados − ${money(r.sacrificed)} sacrificados = <b class="${cls(r.net)}">${moneySign(r.net)}</b> netos (${sign(r.net)}${pts(r.net)})</span><span class="muted">En cero excluidas: ${r.zeros.length} · ${pct(rows.length?100*r.zeros.length/rows.length:0)} del total</span>`;
 const a=r.before,b=r.after;
 const metrics=[['Operaciones',a.n,b.n,fmt,false],['Pregones con operaciones',a.days,b.days,fmt,false],['Resultado · puntos',a.points,b.points,fmt,true],['Resultado · R$',a.points,b.points,money,true],['DD máximo · puntos',a.dd,b.dd,fmt,false],['DD máximo · R$',a.dd,b.dd,money,false],['Resultado / drawdown',a.ratio,b.ratio,fmt,true],['Profit factor',a.pf,b.pf,fmt,true],['Resultado medio · puntos',a.mean,b.mean,fmt,true],['Resultado medio · R$',a.mean,b.mean,money,true],['Resultado mediano · puntos',a.median,b.median,fmt,true],['Resultado mediano · R$',a.median,b.median,money,true],['Acierto · %',a.winRate,b.winRate,fmt,true]];
 $('comparison').innerHTML=metrics.map(([label,x,y,f,higher])=>{const diff=Number.isFinite(x)&&Number.isFinite(y)?y-x:null;return `<tr><td>${label}</td><td>${f(x)}</td><td>${f(y)}</td><td class="${diff===null?'':cls(higher?diff:-diff)}">${diff===null?'—':sign(diff)+f(diff)}${label==='Acierto · %'&&diff!==null?' pp':''}</td></tr>`}).join('');
 $('windows').innerHTML=Study.windows.map(([w,label])=>{const rs=Study.select(DATA,base,w,combo),s=Study.simulate(rs,cut,mode);return `<tr class="${window===w?'active':''}"><td><button data-window="${w}">${label}</button>${base==='gio'&&['all','2024','2025'].includes(w)?'<small>Cobertura parcial</small>':''}</td><td>${rs.length}</td><td>${s.removed.length}<small>${pct(rs.length?s.removed.length/rs.length*100:0)}</small></td><td>${rs.length?money(s.before.points):'—'}</td><td>${rs.length?money(s.after.points):'—'}</td><td class="${cls(s.net)}">${rs.length?moneySign(s.net):'—'}</td><td>${rs.length?money(s.before.dd):'—'}</td><td>${rs.length?money(s.after.dd):'—'}</td><td>${fmt(s.before.ratio)} → ${fmt(s.after.ratio)}</td></tr>`}).join('');
 $('chartNote').textContent=`${mode==='ops'?'Secuencia de operaciones históricas':'Secuencia de pregones con registros'} · los eventos excluidos mantienen la curva filtrada horizontal.`;
 chartSeries=Study.curve(rows,cut,mode);drawCharts();opLimit=100;renderOps();scan();
 $('footer').textContent=`PULO DO GATTO · Estudio de cortes por SL inicial · Datos hasta ${date(DATA.asOf)} · GATTO ${DATA.gatto.length} operaciones · GIO ${DATA.gio.length} resultados disponibles · Carga del panel: ${DATA.retrievedAt}.`;

}
function renderOps(){const r=current;$('opsSummary').textContent=`Ver ${r.removed.length} operaciones excluidas`;const show=r.removed.slice(0,opLimit);$('opsRows').innerHTML=show.map(o=>`<tr><td>${date(o.date)}</td><td>Op${o.order}</td><td>${o.side==='COMPRA'?'Compra':'Venta'}</td><td>${fmt(o.sl)}</td><td class="${cls(o.points)}">${fmt(o.points)}</td><td class="${cls(o.points)}">${money(o.points)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No hay operaciones excluidas.</td></tr>';$('more').hidden=opLimit>=r.removed.length;$('exportOps').disabled=!r.removed.length}
function setCut(v){if(v!==null&&(!Number.isFinite(v)||v<0||v>100000||!Number.isInteger(v))){$('inputError').textContent='Introduce un corte entero entre 0 y 100.000 puntos.';return}$('inputError').textContent='';cut=v;render()}
function scan(){
 const min=Number($('scanMin').value),max=Number($('scanMax').value),step=Number($('scanStep').value),retain=Number($('retain').value);
 if(![min,max,step,retain].every(Number.isFinite)||![min,max,step].every(Number.isInteger)||min<0||max<min||step<1||retain<0||retain>100||(max-min)/step>250){$('scanError').textContent='Usa límites enteros válidos, un paso ≥ 1, un mínimo de 0–100% y hasta 251 cortes.';$('scanRows').innerHTML='';$('scanSummary').innerHTML='';return}
 $('scanError').textContent='';const cuts=new Set();for(let x=min;x<=max;x+=step)cuts.add(x);if(cut!==null)cuts.add(cut);
 const rows=lastRows,mode=$('mode').value;scanResults=[null,...[...cuts].sort((a,b)=>a-b)].map(c=>({cut:c,...Study.simulate(rows,c,mode)}));
 const eligible=scanResults.filter(r=>r.after.n>0&&r.after.n>=rows.length*retain/100),tie=(a,b)=>b.after.points-a.after.points||a.after.dd-b.after.dd||((a.cut??Infinity)-(b.cut??Infinity));
 const bestP=[...eligible].sort((a,b)=>b.after.points-a.after.points||tie(a,b))[0],bestD=[...eligible].sort((a,b)=>a.after.dd-b.after.dd||tie(a,b))[0],bestR=[...eligible].filter(r=>r.after.ratio!==null).sort((a,b)=>b.after.ratio-a.after.ratio||tie(a,b))[0];
 const cutName=c=>c===null?'Sin corte':fmt(c)+' pts';
 $('scanSummary').innerHTML=[['Mayor resultado',bestP,r=>money(r.after.points)],['Menor drawdown',bestD,r=>money(r.after.dd)],['Mayor resultado/DD',bestR,r=>fmt(r.after.ratio)]].map(([l,r,f])=>r?`<button data-apply="${r.cut===null?'none':r.cut}">${l} observado<strong>${f(r)}</strong>${cutName(r.cut)} · ${r.after.n} operaciones conservadas</button>`:`<button disabled>${l}<strong>Sin muestra suficiente</strong></button>`).join('');
 const order=$('sort').value;const sorted=[...scanResults].sort((a,b)=>order==='cut'?(a.cut??-1)-(b.cut??-1):order==='points'?b.after.points-a.after.points||tie(a,b):order==='dd'?a.after.dd-b.after.dd||tie(a,b):(b.after.ratio??-Infinity)-(a.after.ratio??-Infinity)||tie(a,b));
 $('scanRows').innerHTML=sorted.map(r=>{const keepPct=rows.length?r.after.n/rows.length*100:0;const eligible=r.after.n>0&&keepPct>=retain;return `<tr class="${r.cut===cut?'active':''}"><td>${cutName(r.cut)}${r.cut!==null&&(r.cut<min||r.cut>max||(r.cut-min)%step!==0)?'<small>Corte seleccionado adicional</small>':''}</td><td>${r.removed.length}<small>${pct(rows.length?r.removed.length/rows.length*100:0)}</small></td><td>${r.after.n}<small>${pct(keepPct)}${eligible?'':' · fuera del mínimo'}</small></td><td class="${cls(r.after.points)}">${money(r.after.points)}</td><td class="${cls(r.net)}">${moneySign(r.net)}</td><td>${money(r.after.dd)}</td><td>${fmt(r.after.ratio)}</td><td>${fmt(r.after.pf)}</td><td><button data-apply="${r.cut===null?'none':r.cut}">${r.cut===cut?'Aplicado':'Aplicar'}</button></td></tr>`}).join('');
}
function drawChart(id,keys){
 const canvas=$(id),rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;if(w<1)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const m={l:w<440?68:78,r:14,t:16,b:48},pw=w-m.l-m.r,ph=h-m.t-m.b,series=chartSeries;const vals=series.flatMap(d=>keys.map(k=>d[k]*.2));let lo=Math.min(0,...vals),hi=Math.max(0,...vals);if(lo===hi){lo=-1;hi=1}const padding=(hi-lo)*.07;lo-=padding;hi+=padding;const x=i=>m.l+pw*i/Math.max(1,series.length-1),y=v=>m.t+(hi-v)/(hi-lo)*ph;
 ctx.clearRect(0,0,w,h);ctx.font='11px system-ui';ctx.textAlign='right';for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,yy=y(v);ctx.strokeStyle='#253944';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(m.l,yy);ctx.lineTo(w-m.r,yy);ctx.stroke();ctx.fillStyle='#a2b7c2';ctx.fillText(nf.format(Math.round(v)),m.l-8,yy+4)}
 ctx.fillStyle='#a2b7c2';ctx.textAlign='left';ctx.fillText('R$',8,13);ctx.strokeStyle='#3a5261';ctx.strokeRect(m.l,m.t,pw,ph);
 const ticks=w<440?3:4;for(let i=0;i<ticks;i++){let n=Math.round((series.length-1)*i/(ticks-1));ctx.textAlign=i===0?'left':i===ticks-1?'right':'center';ctx.fillText(date(series[n]?.date),x(n),h-24)}ctx.textAlign='center';ctx.fillText($('mode').value==='ops'?'Operaciones históricas · orden real':'Pregones · orden real',m.l+pw/2,h-5);
 ctx.save();ctx.beginPath();ctx.rect(m.l,m.t,pw,ph);ctx.clip();keys.forEach((key,j)=>{ctx.strokeStyle=j?'#62e0ba':'#8ba9d9';ctx.lineWidth=j?2:1.6;ctx.beginPath();series.forEach((d,i)=>{const xx=x(i),yy=y(d[key]*.2);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.stroke()});ctx.restore();canvas._chart={x,y,keys,w,h,m,pw,series};
 if(!lastRows.length){ctx.fillStyle='#eaf2f4';ctx.textAlign='center';ctx.fillText('Sin operaciones disponibles',m.l+pw/2,m.t+ph/2)}
}
function drawCharts(){drawChart('equity',['a','b']);drawChart('drawdown',['da','db'])}
for(const id of ['equity','drawdown']){
 const canvas=$(id),tip=canvas.nextElementSibling;const show=ev=>{const d=canvas._chart;if(!d||!lastRows.length)return;const r=canvas.getBoundingClientRect(),p=ev.touches?ev.touches[0]:ev,px=p.clientX-r.left;const n=Math.max(0,Math.min(d.series.length-1,Math.round((px-d.m.l)/d.pw*(d.series.length-1)))),s=d.series[n];tip.innerHTML=`<b>${date(s.date)}${s.order?' · Op'+s.order:n===0?' · inicio':''}</b><br>Original: ${money(s[d.keys[0]])}<br>Con corte: ${money(s[d.keys[1]])}`;tip.style.left=Math.max(5,Math.min(px+10,d.w-205))+'px';tip.style.top='42px';tip.style.display='block'};canvas.addEventListener('pointermove',show);canvas.addEventListener('pointerdown',show);canvas.addEventListener('pointerleave',()=>tip.style.display='none');
}
function downloadCSV(name,rows){const text='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
const dec=x=>x===null?'':String(x).replace('.',',');
$('exportOps').onclick=()=>downloadCSV(`excluidas-${$('base').value}-${$('window').value}-sl-${cut}.csv`,[['ID','Fecha','Op histórica','Lado','Tamaño stop puntos','Resultado puntos','Resultado R$'],...current.removed.map(o=>[o.id,o.date,o.order,o.side,dec(o.sl),dec(o.points),dec(o.points*.2)])]);
$('exportSummary').onclick=()=>{const r=current;downloadCSV(`comparacion-sl-${$('base').value}-${$('window').value}.csv`,[['Setup',$('base').value],['Ventana',$('window').value],['Operaciones',$('combo').value],['Corte SL puntos',cut??'Sin corte'],['Datos hasta',DATA.asOf],['Modo DD',$('mode').value],['SL sin valor conservados',r.missing.length],['Métrica','Original','Con corte'],...['n','days','points','dd','ratio','pf','mean','median','winRate'].map((k,i)=>[['Operaciones','Pregones','Resultado puntos','DD máximo puntos','Resultado/DD','Profit factor','Media puntos','Mediana puntos','Acierto %'][i],dec(r.before[k]),dec(r.after[k])]),['Ganadoras excluidas',r.gains.length],['Ganancias sacrificadas puntos',dec(r.sacrificed)],['Perdedoras excluidas',r.losses.length],['Pérdidas evitadas puntos',dec(r.saved)],['En cero excluidas',r.zeros.length],['Efecto neto puntos',dec(r.net)],['Efecto neto R$',dec(r.net*.2)]])};
for(const id of ['base','window','combo','mode'])$(id).onchange=render;
$('cut').oninput=()=>{if($('cut').value.trim()!=='')setCut(Number($('cut').value))};$('cut').onblur=()=>{if($('cut').value.trim()==='')setCut(null)};
$('slider').oninput=()=>setCut(Number($('slider').value));$('noCut').onclick=()=>setCut(null);$('quick').addEventListener('click',ev=>{const b=ev.target.closest('[data-cut]');if(b)setCut(Number(b.dataset.cut))});
$('windows').addEventListener('click',ev=>{const b=ev.target.closest('[data-window]');if(b){$('window').value=b.dataset.window;render()}});
for(const id of ['scanRows','scanSummary'])$(id).addEventListener('click',ev=>{const b=ev.target.closest('[data-apply]');if(b)setCut(b.dataset.apply==='none'?null:Number(b.dataset.apply))});
$('scan').onclick=scan;$('sort').onchange=scan;$('more').onclick=()=>{opLimit+=100;renderOps()};new ResizeObserver(drawCharts).observe($('equity').parentElement);new ResizeObserver(drawCharts).observe($('drawdown').parentElement);

function receiveLiveData(){
 let payload=null,message='';
 try{
  if(parent===window)message='Abre SL Limit desde el menú del sitio para usar su base actual.';
  else {
   const user=parent.PuloAccess?.getUser();
   if(parent.PuloAccess&&(!user||(user.role==='ALUNO'&&!(user.permissions||[]).includes('resultados'))))message='Acceso a resultados no disponible en esta sesión.';
   else payload=parent.PuloPauseData?.();
  }
 }catch(_){message='No se pudo leer la base del panel.'}
 DATA=SLData.fromDashboard(payload,window.PuloGioStopMetadata);
 if(DATA.duplicates.length)message='IDs duplicados en la base: '+DATA.duplicates.join(', ')+'. Corrige los registros antes de simular.';
 const ready=!!DATA.retrievedAt&&!message;
 $('module').hidden=!ready;$('loadStatus').hidden=ready;
 $('loadStatus').textContent=message||'Aguardando los datos del panel…';
 if(ready)render();
}
window.addEventListener('pulo:pause-data',receiveLiveData);
receiveLiveData();

