const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../data-bridge.js'),S=require('../engine.js');
const row=(id,side,sl,points)=>({id,dataHoraIso:'2026-09-10T10:00:00',lado:side,tamanhoStop:sl,pontos:points});
const id='OP_10-09-2026__1';
test('GIO uses only its own live stop or metadata with matching ID, date and side',()=>{
 const meta={stops:{[id]:{date:'2026-09-10',side:'COMPRA',sl:350}}};
 assert.equal(D.normalize([row(id,'COMPRA',null,80)],'gio',meta).rows[0].sl,350);
 assert.equal(D.normalize([row(id,'COMPRA',400,80)],'gio',meta).rows[0].sl,400);
 assert.equal(D.normalize([row(id,'VENDA',null,80)],'gio',meta).rows[0].sl,null);
 assert.equal(D.normalize([row(id,'COMPRA',null,80)],'gatto',meta).rows[0].sl,null);
 meta.stops[id].date='2026-09-11';assert.equal(D.normalize([row(id,'COMPRA',null,80)],'gio',meta).rows[0].sl,null);
});
test('pending results are excluded, zeros are real, original IDs retain their operation number',()=>{
 const second='OP_10-09-2026__2',third='OP_10-09-2026__3';
 const r=D.normalize([row(third,'VENDA',300,0),row(id,'COMPRA',300,null),row(second,'VENDA',null,-100)],'gio',null);
 assert.deepEqual(r.rows.map(o=>o.order),[2,3]);assert.equal(r.rows[1].points,0);
 const sim=S.simulate(r.rows,100);assert.equal(sim.removed[0].order,3);assert.equal(sim.kept[0].order,2);assert.equal(sim.missing.length,1);
});
test('duplicated IDs and mismatched dates are surfaced or rejected',()=>{
 const duplicate=row(id,'COMPRA',200,50);assert.deepEqual(D.normalize([duplicate,duplicate],'gatto',null).duplicates,[id]);
 const wrongDate={...duplicate,dataHoraIso:'2026-09-11T10:00:00'};assert.equal(D.normalize([wrongDate],'gatto',null).rows.length,0);
});
test('dashboard refresh replaces results and coverage, without a stored result baseline',()=>{
 const payload={read:'2026-09-10T18:00',gatto:[row(id,'COMPRA',550,25)],gio:[row(id,'COMPRA',null,50)],gioPendingOperations:[{date:'2026-09-11',order:2}]};
 const d=D.fromDashboard(payload,{updatedAt:'2026-09-10',through:'2026-09-10',stops:{}});
 assert.equal(d.gio[0].points,50);assert.equal(d.gio[0].sl,null);assert.equal(d.gioPending.length,1);
 payload.gio[0].pontos=-120;assert.equal(D.fromDashboard(payload,null).gio[0].points,-120);assert.equal(D.fromDashboard(null,null).gio.length,0);
});
test('threshold boundary, accounting and DD by trade versus day',()=>{
 const ops=[{date:'2026-09-10',order:1,sl:550,points:-100},{date:'2026-09-10',order:2,sl:551,points:150},{date:'2026-09-11',order:1,sl:400,points:-50}];
 const r=S.simulate(ops,550);assert.equal(r.removed.length,1);assert.equal(r.kept[0].sl,550);assert.equal(r.net,r.saved-r.sacrificed);assert.equal(r.before.dd,100);assert.equal(S.stats(ops,'days').dd,50);
 const c=S.curve(ops,550);assert.equal(c.at(-1).b,r.after.points);assert.equal(-Math.min(...c.map(x=>x.db)),r.after.dd);
});
test('menu is a first-level authenticated entry between Meta diária and Pausas, with an icon',()=>{
 const root=path.join(__dirname,'../..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const target=html.indexOf('data-page="stopCut"'),prior=html.indexOf('data-page="dailyTarget"'),next=html.indexOf('id="pausesNav"');assert(prior<target&&target<next);
 const button=html.slice(html.lastIndexOf('<button',target),html.indexOf('</button>',target));assert(button.includes('data-permission="resultados"'));assert(button.includes('<svg'));assert(button.includes('SL Limit'));
 assert(html.includes('id="page-stopCut"'));assert(app.split('\n')[2].includes("'stopCut'"));assert(html.includes('data-pause-src="corte-sl/index.html?v=1"'));
 assert(!fs.readFileSync(path.join(root,'corte-sl/index.html'),'utf8').includes('study-data'));
});
