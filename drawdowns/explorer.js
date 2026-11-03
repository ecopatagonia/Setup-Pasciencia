
/* Closing-equity drawdown episodes. Monetary values are integer cents. */
function buildDrawdownAnalysis(rawRows, mode = 'operations') {
  const valid = rawRows.filter(r => typeof r.points === 'number' && Number.isFinite(r.points))
    .slice().sort((a,b) => a.date.localeCompare(b.date) || a.order - b.order);
  const events = [];
  for (const r of valid) {
    const cents = Math.round(r.points * 20);
    if (mode === 'days' && events.at(-1)?.date === r.date) {
      events.at(-1).change += cents;
      events.at(-1).operations += 1;
      events.at(-1).ids.push(r.id);
    } else events.push({date:r.date, change:cents, operations:1, ids:[r.id]});
  }
  if (!events.length) return {nodes:[], episodes:[], ranked:[], operations:0, days:0, maxDepth:0};
  const nodes = [{date:events[0].date, value:0, operations:0, ids:[], baseline:true}];
  let value = 0;
  for (const e of events) {value += e.change; nodes.push({...e,value});}
  const episodes = [];
  let peak = 0, active = null;
  function finish(end, closed) {
    const e = {...active, end, closed};
    const slice = nodes.slice(e.start+1,e.end+1);
    e.depth = nodes[e.start].value - nodes[e.trough].value;
    e.remaining = Math.max(0,nodes[e.start].value - nodes[e.end].value);
    e.recovered = Math.min(e.depth,Math.max(0,nodes[e.end].value - nodes[e.trough].value));
    e.recoveryPct = e.depth ? e.recovered/e.depth*100 : 100;
    e.operations = slice.reduce((a,r)=>a+r.operations,0);
    e.days = new Set(slice.map(r=>r.date)).size;
    e.calendarDays = Math.round((Date.parse(nodes[e.end].date+'T00:00:00Z')-Date.parse(nodes[e.start].date+'T00:00:00Z'))/86400000);
    e.recoveryDays = Math.round((Date.parse(nodes[e.end].date+'T00:00:00Z')-Date.parse(nodes[e.trough].date+'T00:00:00Z'))/86400000);
    episodes.push(e); active = null;
  }
  for (let i=1;i<nodes.length;i++) {
    if (!active) {
      if(nodes[i].value<nodes[peak].value) active={start:peak,trough:i};
      else peak=i;
    } else {
      if(nodes[i].value<nodes[active.trough].value) active.trough=i;
      if(nodes[i].value>=nodes[active.start].value) {finish(i,true);peak=i;}
    }
  }
  if(active) finish(nodes.length-1,false);
  const ranked=episodes.slice().sort((a,b)=>b.depth-a.depth || b.calendarDays-a.calendarDays || a.start-b.start);
  return {nodes,episodes,ranked,operations:valid.length,days:new Set(valid.map(r=>r.date)).size,maxDepth:ranked[0]?.depth||0};
}
if(typeof module!=='undefined') module.exports={buildDrawdownAnalysis};

(()=>{
const root=document.getElementById('drawdownExplorer'),$=s=>root.querySelector(s);
let data={rows:[],source:''},contextKey='',periodLabel='';
let mode='operations',analysis,displayed=[],resizeTimer,selectedIds=new Set(),periodRows=[];
function orderedEpisodes(){return $('#dd-sort').value==='date'?analysis.episodes:analysis.ranked;}
function refreshAnalysis(){periodRows=data.rows;analysis=buildDrawdownAnalysis(periodRows,mode);analysis.episodes.forEach((e,i)=>e.id='DD'+String(i+1).padStart(3,'0'));analysis.ranked.forEach((e,i)=>e.rank=i+1);selectedIds=new Set(analysis.ranked.slice(0,3).map(e=>e.id));}
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}).format(c/100),pct=n=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+'%',date=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—',short=c=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(c/100);
const stat=(label,value,cls='')=>`<div class="stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;
function render(){
 if(!analysis)refreshAnalysis();displayed=orderedEpisodes().filter(e=>selectedIds.has(e.id));const nodes=analysis.nodes,open=analysis.episodes.find(e=>!e.closed),openRank=open?analysis.ranked.indexOf(open)+1:0,complete=periodRows.filter(r=>typeof r.points==='number'&&Number.isFinite(r.points));
 $('#dd-coverage').textContent=`Dados reais · ${date(complete[0]?.date)} a ${date(complete.at(-1)?.date)} · ${analysis.operations} operações · ${analysis.days} pregões · ${periodRows.length-complete.length} pendentes excluídos · 1 contrato · ${periodLabel} · cobertura até a última data disponível no recorte`;
 $('#dd-summary').innerHTML=`<div class="summary-box"><span class="small muted">Maior queda do período</span><strong class="negative">${money(-analysis.maxDepth)}</strong><span class="small muted">Pico → fundo · ${mode==='days'?'fechamento por pregão':'fechamento por operação'}</span></div><div class="summary-box"><span class="small muted">Episódios identificados</span><strong>${analysis.episodes.length}</strong><span class="small muted">${analysis.episodes.filter(e=>e.closed).length} recuperados · ${open?1:0} aberto</span></div><div class="summary-box"><span class="small muted">Drawdown vigente</span><strong class="${open?'negative':'positive'}">${money(open?-open.remaining:0)}</strong><span class="small muted">${open?'Máxima do episódio: '+money(-open.depth)+' · '+openRank+'º no ranking':'A curva encerrou no pico'}</span></div>`;
 $('#dd-current-note').textContent=open?`Episódio vigente: ${open.id} · ${openRank}º maior drawdown. ${selectedIds.has(open.id)?'Selecionado para exibição.':'Marque sua linha na tabela para exibir o gráfico.'}`:'Todos os episódios do período foram recuperados. O ranking preserva cada ciclo completo, sem sobrepor quedas do mesmo episódio.';
 $('#dd-selected-count').textContent=`${selectedIds.size} de 5 gráficos selecionados`;
 $('#dd-show-charts').disabled=selectedIds.size===0;
 $('#dd-selection-message').textContent=selectedIds.size===5?'Limite de 5 episódios atingido. Desmarque um para escolher outro.':selectedIds.size===0?'Marque os episódios na tabela para visualizar os gráficos.':'A seleção acompanha os episódios, independentemente da ordenação.';
 $('#dd-chart-order').textContent=`Gráficos na ordem da tabela: ${$('#dd-sort').value==='date'?'cronológica':'maior profundidade'}.`;
 $('#dd-row-count-wrap').hidden=!$('#dd-more').checked;$('#dd-row-count').max=Math.max(6,analysis.episodes.length);
 const requested=$('#dd-more').checked?Math.max(6,Math.floor(Number($('#dd-row-count').value)||10)):5,visibleRows=orderedEpisodes().slice(0,requested),outside=[...selectedIds].filter(id=>!visibleRows.some(e=>e.id===id)).length;
 $('#dd-list-coverage').textContent=`Mostrando ${visibleRows.length} de ${analysis.episodes.length} episódios${outside?' · '+outside+' selecionado(s) fora destas linhas':''}`;
 const scrollTop=$('#dd-ranking').scrollTop,scrollLeft=$('#dd-ranking').scrollLeft;
 $('#dd-ranking').innerHTML=`<table><thead><tr><th>Ver</th><th>Episódio</th><th>Ranking DD</th><th>Pico / início</th><th>Fundo</th><th>Recuperação</th><th>DD máximo</th><th>Dias corridos</th><th>Pregões</th><th>Operações</th><th>Falta recuperar</th><th>Situação</th></tr></thead><tbody>${visibleRows.map(e=>`<tr class="${selectedIds.has(e.id)?'selected':''}" data-episode="${e.id}"><td><input type="checkbox" data-episode-check="${e.id}" aria-label="Selecionar ${e.id}, ${e.rank}º maior drawdown, ${date(nodes[e.start].date)}" ${selectedIds.has(e.id)?'checked':''} ${selectedIds.size>=5&&!selectedIds.has(e.id)?'disabled':''}></td><td>${e.id}</td><td>${e.rank}º</td><td>${date(nodes[e.start].date)}</td><td>${date(nodes[e.trough].date)}</td><td>${e.closed?date(nodes[e.end].date):'Em aberto'}</td><td class="negative">${money(-e.depth)}</td><td>${e.calendarDays}</td><td>${e.days}</td><td>${e.operations}</td><td>${money(e.remaining)}</td><td><span class="table-status ${e.closed?'':'open'}">${e.closed?'Recuperado':'Aberto'}</span></td></tr>`).join('')}</tbody></table>`;
 $('#dd-ranking').scrollTop=scrollTop;$('#dd-ranking').scrollLeft=scrollLeft;
 root.querySelectorAll('[data-episode-check]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){if(selectedIds.size>=5){input.checked=false;return;}selectedIds.add(input.dataset.episodeCheck);}else selectedIds.delete(input.dataset.episodeCheck);render();}));
 $('#dd-episodes').innerHTML=displayed.map((e,i)=>{const peak=nodes[e.start],trough=nodes[e.trough],end=nodes[e.end],same=e.trough===e.end;return `<article class="episode" data-dd-rank="${e.rank}" data-dd-id="${e.id}"><div class="episode-heading"><div class="title-row"><span class="rank">${e.id}</span><div><div class="eyebrow">${e.rank}º maior drawdown · ${e.closed?'episódio recuperado':'episódio vigente'}</div><h2>${date(peak.date)} → ${date(end.date)}</h2></div></div><span class="badge ${e.closed?'':'open'}">${e.closed?'RECUPERADO':'ABERTO'}</span></div><div class="stats">${stat('Pico de referência',date(peak.date))}${stat('Dias corridos',e.calendarDays)}${stat('Pregões com operações',e.days)}${stat('Operações após o pico',e.operations)}${stat('DD máximo do episódio',money(-e.depth),'negative')}${stat(e.closed?'DD no encerramento':'DD atual',money(-e.remaining),e.remaining?'negative':'positive')}</div><div class="balance-labels"><span>Pico <strong>${money(peak.value)}</strong></span><span>Fundo · ${date(trough.date)} <strong>${money(trough.value)}</strong></span><span>${e.closed?'Recuperação':'Atual'} <strong>${money(end.value)}</strong></span></div><div class="chart-host" id="dd-chart-${i}"></div><div class="hover-info" id="dd-hover-${i}">${same?'Fundo e saldo atual coincidem no último fechamento.':'Passe sobre a curva ou toque para consultar cada fechamento.'}</div><div class="progress-top"><span>Recuperação desde o fundo</span><strong>${pct(e.recoveryPct)}</strong></div><div class="progress-track" role="progressbar" aria-label="Recuperação do ${e.id}" aria-valuenow="${e.recoveryPct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${e.recoveryPct}%"></div></div><div class="recovery-stats">${stat('Recuperado desde o fundo',money(e.recovered),'positive')}${stat('Falta para o pico',money(e.remaining))}${stat(e.closed?'Dias do fundo à recuperação':'Dias desde o fundo',e.recoveryDays)}${stat('Data da recuperação',e.closed?date(end.date):'Ainda não recuperado')}</div></article>`;}).join('');
 if(!displayed.length)$('#dd-episodes').innerHTML='<div class="no-selection">Nenhum episódio selecionado. Use as caixas da tabela ou selecione os três maiores.</div>';
 $('#dd-source').textContent=`Fonte: ${data.source} · atualização: ${data.read || 'base atual'} · dados da mesma indexação do site.`;
 root.querySelectorAll('[data-dd-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ddMode===mode)));root.dataset.mode=mode;root.dataset.visible=displayed.length;root.dataset.maxDepth=analysis.maxDepth;drawCharts();
}
function drawCharts(){
 const nodes=analysis.nodes,relative=$('#dd-scale').value==='relative',showLimit=$('#dd-limit').checked;
 let sharedLo=Math.min(0,...displayed.map(e=>-e.depth)),sharedHi=Math.max(0,...displayed.map(e=>nodes[e.end].value-nodes[e.start].value));if(showLimit)sharedLo=Math.min(sharedLo,-250000);
 displayed.forEach((e,i)=>{
  const host=$('#dd-chart-'+i),points=nodes.slice(e.start,e.end+1),peak=nodes[e.start].value,localTrough=e.trough-e.start;
  const width=Math.max(240,Math.floor(host.getBoundingClientRect().width)||800),height=width<430?270:300,L=width<430?54:76,R=16,T=24,B=51;
  const val=p=>relative?p.value-peak:p.value,baseline=relative?0:peak,limit=baseline-250000;
  let lo=relative?sharedLo:Math.min(...points.map(val),baseline),hi=relative?sharedHi:Math.max(...points.map(val),baseline);if(showLimit)lo=Math.min(lo,limit);const pad=Math.max((hi-lo)*.18,1000);lo-=pad;hi+=pad;
  const x=k=>L+k/Math.max(1,points.length-1)*(width-L-R),y=v=>T+(hi-v)/(hi-lo)*(height-T-B);
  const line=(list,offset=0)=>list.map((p,k)=>(k?'L':'M')+x(k+offset).toFixed(2)+','+y(val(p)).toFixed(2)).join(' ');
  let grid='';for(let k=0;k<4;k++){const v=lo+(hi-lo)*k/3;grid+=`<line x1="${L}" x2="${width-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--dd-line)"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" fill="var(--dd-muted)" font-size="11">${short(v)}</text>`;}
  const last=points.length-1,reference=showLimit?`<line x1="${L}" x2="${width-R}" y1="${y(limit)}" y2="${y(limit)}" stroke="var(--dd-red)" stroke-width="1.4" stroke-dasharray="6 5"/><text x="${width-R}" y="${y(limit)-8}" text-anchor="end" fill="var(--dd-red)" font-size="11">Quebra · pico − R$ 2.500</text>`:'';
  host.innerHTML=`<svg class="dd-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e.id}, ${e.rank}º maior drawdown, queda máxima de ${money(e.depth)}, ${e.closed?'recuperado':'aberto'}"><title>${e.id} · ${e.rank}º maior drawdown · ${money(-e.depth)}</title>${grid}<line x1="${L}" x2="${width-R}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--dd-gold)" stroke-dasharray="6 5" stroke-width="1.5"/><text x="${L}" y="${Math.max(13,y(baseline)-10)}" fill="var(--dd-gold)" font-size="11">${relative?'Pico · R$ 0':'Último pico'}</text>${reference}<path data-phase="fall" d="${line(points.slice(0,localTrough+1))}" fill="none" stroke="var(--dd-red)" stroke-width="2.7" stroke-linejoin="round"/><path data-phase="recovery" d="${line(points.slice(localTrough),localTrough)}" fill="none" stroke="var(--dd-green)" stroke-width="2.7" stroke-linejoin="round"/><circle cx="${x(0)}" cy="${y(val(points[0]))}" r="4.5" fill="var(--dd-gold)"/><circle cx="${x(localTrough)}" cy="${y(val(points[localTrough]))}" r="4.5" fill="var(--dd-red)"/><circle cx="${x(last)}" cy="${y(val(points[last]))}" r="4.5" fill="var(--dd-green)"/><text x="${L}" y="${height-26}" fill="var(--dd-muted)" font-size="11">${date(points[0].date)}</text><text x="${width-R}" y="${height-26}" text-anchor="end" fill="var(--dd-muted)" font-size="11">${date(points[last].date)}</text><text x="${(L+width-R)/2}" y="${height-6}" text-anchor="middle" fill="var(--dd-muted)" font-size="11">${relative?'Distância do pico (R$)':'Saldo (R$)'} · ${mode==='days'?'pregões':'operações'}</text><line data-hover-line x1="${L}" x2="${L}" y1="${T}" y2="${height-B}" stroke="var(--dd-muted)" opacity="0"/><circle data-hover-point cx="${L}" cy="${T}" r="4" fill="var(--dd-text)" opacity="0"/><rect data-hover-hit x="${L}" y="${T}" width="${width-L-R}" height="${height-T-B}" fill="transparent"/></svg><div class="tt" hidden></div>`;
  const hit=host.querySelector('[data-hover-hit]'),svg=host.querySelector('svg'),tt=host.querySelector('.tt'),guide=host.querySelector('[data-hover-line]'),dot=host.querySelector('[data-hover-point]');
  function hover(event){const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*width,idx=Math.max(0,Math.min(last,Math.round((px-L)/(width-L-R)*last))),p=points[idx],text=`${date(p.date)} · ${p.baseline?'Saldo inicial':mode==='days'?p.operations+' operação(ões)':p.ids[0]}\nSaldo: ${money(p.value)}\nDistância do pico: ${money(p.value-peak)}`;tt.textContent=text;tt.hidden=false;tt.style.left=Math.max(0,Math.min(host.clientWidth-240,(event.clientX-rect.left)+10))+'px';tt.style.top='35px';guide.setAttribute('x1',x(idx));guide.setAttribute('x2',x(idx));guide.setAttribute('opacity','1');dot.setAttribute('cx',x(idx));dot.setAttribute('cy',y(val(p)));dot.setAttribute('opacity','1');$('#dd-hover-'+i).textContent=text.replaceAll('\n',' · ');}
  hit.addEventListener('pointermove',hover);hit.addEventListener('pointerdown',hover);hit.addEventListener('pointerleave',()=>{tt.hidden=true;guide.setAttribute('opacity','0');dot.setAttribute('opacity','0');});
 });
}
$('#dd-more').addEventListener('change',render);$('#dd-row-count').addEventListener('change',render);$('#dd-sort').addEventListener('change',render);$('#dd-top-three').addEventListener('click',()=>{selectedIds=new Set(analysis.ranked.slice(0,3).map(e=>e.id));render();});$('#dd-clear').addEventListener('click',()=>{selectedIds.clear();render();});$('#dd-show-charts').addEventListener('click',()=>$('#dd-chart-section').scrollIntoView({behavior:'smooth',block:'start'}));$('#dd-scale').addEventListener('change',drawCharts);$('#dd-limit').addEventListener('change',drawCharts);root.querySelectorAll('[data-dd-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.ddMode;refreshAnalysis();render();}));window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(analysis && root.closest('.page').classList.contains('active'))drawCharts();},120);});
window.PuloDrawdowns={render(context){
 const rows=context.operations.filter(op=>Number.isFinite(Number(op.financeiro)) && op.financeiro!==null && op.financeiro!=='').map(op=>({id:String(op.id||''),date:String(op.dataHoraIso).slice(0,10),order:Number(op.order)||Number(String(op.id).split('__').at(-1))||0,points:Number(op.financeiro)/.2}));
 const nextKey=JSON.stringify([context.dataset,context.mode,context.periodKey,rows]);
 data={rows,source:context.dataset==='gio'?'GIO_SITE · EXECUTADO PROTEGENDO':'DADOS_SITE · GATTO',read:context.updatedAt};
 periodLabel=context.periodLabel;mode=context.mode;
 $('#dd-heading').textContent='Drawdowns · Setup '+context.dataset.toUpperCase();
 if(nextKey!==contextKey){contextKey=nextKey;refreshAnalysis();}render();
 },redraw(){if(analysis)drawCharts();},getAnalysis:()=>analysis,getSelection:()=>[...selectedIds]};
})();
