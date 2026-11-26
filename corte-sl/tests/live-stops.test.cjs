const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'comparativo/apps-script.gs'),'utf8');
const day=new Date('2026-11-25T12:00:00Z');
const formatDate=(d,tz,format)=>d.toISOString().slice(0,10);
const record=(entry,stop,original,protectedResult,side='COMPRA')=>[day,side,entry-1,entry,stop,entry+2,original,'GAIN',protectedResult];
function harness(gio,site){
 const sheets={GIOLVAN:gio,PARA_SITE:site};
 const spreadsheet={getSpreadsheetTimeZone:()=> 'America/Sao_Paulo',getSheetByName:name=>({getLastRow:()=>sheets[name].length+1,getRange:(row,col,n,width)=>({getValues:()=>sheets[name].map(r=>col===17?r:r.slice(0,width))})})};
 const context={Date,Utilities:{formatDate}};vm.createContext(context);vm.runInContext(source,context);
 return ()=>context.buildComparativoGio_(spreadsheet);
}
test('API reads current GIO stops, orders by entry, preserves zero and pending operation numbering',()=>{
 const gio=[record(30,550,-120,250),record(10,545,100,0),record(20,350,80,null)];
 const site=[['OP_25-11-2026__1',day,'COMPRA',100,'',0,0,600],['OP_25-11-2026__2',day,'COMPRA',80,'',null,0,600],['OP_25-11-2026__3',day,'COMPRA',-120,'',250,0,600]];
 const read=harness(gio,site);let rows=read();
 assert.deepEqual(Array.from(rows,r=>r.tamanhoStop),[545,350,550]);
 assert.equal(rows[0].protected,0);assert.equal(rows[1].protected,null);assert.equal(rows[2].candleEntrada,30);
 gio[0][4]=525;gio.push(record(40,300,50,100));
 // Four entries would make the existing three-operation identity ambiguous.
 assert.equal(read()[2].tamanhoStop,null);
 gio.pop();assert.equal(read()[2].tamanhoStop,525);
});
test('API does not attach stops to mismatched identities or duplicated entry candles',()=>{
 const gio=[record(10,550,100,250)],site=[['OP_25-11-2026__1',day,'VENDA',100,'',250,0,600]];
 const read=harness(gio,site);assert.equal(read()[0].tamanhoStop,null);
 site[0][2]='COMPRA';site[0][5]=500;assert.equal(read()[0].tamanhoStop,null);
 site[0][5]=250;assert.equal(read()[0].tamanhoStop,550);
 gio.push(record(10,300,100,250));assert.equal(read()[0].tamanhoStop,null);
});
test('API stop reaches shared dashboard normalization and SL Limit, and refresh replaces it',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const code=app.slice(app.indexOf('function normalizeGioOperations('),app.indexOf('function configureDatasetRange('));
 const context={POINT_VALUE:.2};vm.createContext(context);vm.runInContext(code,context);
 const bridge=require('../data-bridge.js'),engine=require('../engine.js');
 const raw=[{id:'OP_25-11-2026__1',date:'2026-11-25',side:'COMPRA',protected:-550,tamanhoStop:550,candleEntrada:20}];
 const read=()=>bridge.fromDashboard({read:'2026-11-25',gio:context.normalizeGioOperations(raw)});
 let data=read();let result=engine.simulate(engine.select(data,'gio','2026','12'),545);
 assert.equal(result.after.n,0);assert.equal(result.before.points,-550);
 raw[0].tamanhoStop=545;raw[0].protected=250;
 data=read();result=engine.simulate(engine.select(data,'gio','2026','12'),545);
 assert.equal(result.after.n,1);assert.equal(result.after.points,250);
});
test('SL Limit blocks incomplete cuts, keeps controls usable and updates on parent refresh',()=>{
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,style:{},parentElement:{},nextElementSibling:{style:{}},addEventListener(){},setAttribute(){},getBoundingClientRect:()=>({width:0,height:0})});return elements.get(id)};
 Object.entries({base:'gio',window:'2026',combo:'12',mode:'ops',scanMin:'200',scanMax:'650',scanStep:'25',retain:'30',sort:'cut'}).forEach(([id,v])=>get(id).value=v);
 let payload={read:'2026-11-25',gio:[{id:'OP_25-11-2026__1',dataHoraIso:'2026-11-25T12:00:00',lado:'COMPRA',pontos:-550,tamanhoStop:null}]};
 const callbacks={},window={addEventListener:(event,fn)=>callbacks[event]=fn};
 const context={window,parent:{PuloPauseData:()=>payload},document:{getElementById:get,querySelector:()=>get('filterTitle'),querySelectorAll:()=>[]},SLData:require('../data-bridge.js'),Study:require('../engine.js'),ResizeObserver:class{observe(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'corte-sl/app.js'),'utf8'),context);
 assert.equal(get('module').hidden,false);assert.equal(get('analysis').hidden,true);
 assert.match(get('coverage').textContent,/faltan stops iniciales/);
 context.setCut(null);assert.equal(get('analysis').hidden,false);assert.match(get('scanError').textContent,/falten stops iniciales/);
 payload={...payload,gio:[{...payload.gio[0],tamanhoStop:550}]};
 callbacks['pulo:pause-data']();context.setCut(545);
 assert.equal(get('analysis').hidden,false);assert.match(get('comparison').innerHTML,/-550/);
 payload={...payload,gio:[{...payload.gio[0],tamanhoStop:545,pontos:250}]};callbacks['pulo:pause-data']();
 assert.match(get('comparison').innerHTML,/250/);assert.equal(get('analysis').hidden,false);
});
