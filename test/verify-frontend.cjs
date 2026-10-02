const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setImmediate(r));
const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const slot={date:tomorrow,startAt:tomorrow+'T18:00:00-05:00',endAt:tomorrow+'T19:30:00-05:00',court:{id:'court',name:'Cancha Cristal'},price:'100',available:true};
async function run(file='booking.js',options={}){
 let start;const handles={},store=new Map(Object.entries(options.storage||{})),calls=[],location={search:'',href:'',replace(v){this.href=v}};
 const app={innerHTML:''};
 const el=s=>handles[s]||(handles[s]={dataset:{},addEventListener(n,f){this[n]=f}});
 const document={addEventListener(n,f){start=f},querySelector(s){return s.endsWith('-app')?app:app.innerHTML.includes('id="'+s.slice(1)+'"')?el(s):null},querySelectorAll(s){const attr=s.slice(1,-1);return [...app.innerHTML.matchAll(new RegExp(attr+'="([^"]+)"','g'))].map(m=>{const e=el(s+':'+m[1]);e.dataset[attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=m[1];return e})}};
 const api={async api(url,opts){calls.push({url,opts});if(options.fail===url)throw Object.assign(Error('Consulta fallida'),{status:401});if(url.includes('context'))return {id:'user',name:'Jugador'};if(url==='/api/clubs')return [{id:'club',name:'Amarea',courts:[{id:'court',name:'Cancha Cristal',surface:'Cristal',indoor:true,status:'ACTIVE'}],allowedDurations:options.noDurations?[]:[{minutes:90}]}];if(url.includes('availability'))return options.rows??[slot];if(url==='/api/reservations'){if(options.conflict)throw Object.assign(Error('Ocupada'),{status:409});return {id:'reservation',price:100}}throw Error(url)},loginRedirect(){location.href='/login/'},sessionError(){location.href='/login/'}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../frontend/assets/js',file),'utf8'),{document,window:{addEventListener(){}},PGOApi:api,PGOUtil:{esc:v=>String(v??''),money:v=>'S/ '+v},PGOUserHeader:{mount(){}},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},location,Intl,Date,URLSearchParams,console});
 await start();await tick();return {app,handles,store,calls,location};
}
(async()=>{
 const empty=await run('booking.js',{rows:[]});assert.ok(empty.app.innerHTML.includes('Cancha Cristal'));assert.ok(empty.app.innerHTML.includes('Sin turnos publicados'));assert.match(empty.app.innerHTML,/id="booking-continue"[^>]*disabled/);
 const pricing=await run('booking.js',{rows:[{...slot,available:false,price:null,reason:'PRICE_NOT_CONFIGURED'}]});await pricing.handles['#booking-date'].change({target:{value:tomorrow}});await tick();assert.ok(pricing.app.innerHTML.includes('no publicó una tarifa'));assert.match(pricing.app.innerHTML,/id="booking-continue"[^>]*disabled/);
 const noDur=await run('booking.js',{noDurations:true});assert.equal(noDur.calls.some(c=>c.url.includes('availability')),false);assert.ok(noDur.app.innerHTML.includes('duraciones de reserva'));
 const x=await run();await x.handles['#booking-date'].change({target:{value:tomorrow}});await tick();assert.ok(x.app.innerHTML.includes('100'));assert.doesNotMatch(x.app.innerHTML,/id="booking-continue"[^>]*disabled/);x.handles['#booking-continue'].click();const draft=JSON.parse(x.store.get('pgo_booking_draft'));assert.equal(draft.userId,'user');assert.equal(draft.courtId,'court');assert.equal(draft.durationMinutes,90);assert.equal(x.location.href,'/reservar-cancha/checkout/');
 const expired=await run('booking.js',{fail:'/api/auth/context'});assert.equal(expired.location.href,'/login/');
 const bad=await run('booking.js',{rows:{invalid:true}});assert.ok(bad.app.innerHTML.includes('Respuesta de disponibilidad inválida'));
 const storage={pgo_booking_draft:JSON.stringify(draft)};
 const other=await run('booking-checkout.js',{storage:{pgo_booking_draft:JSON.stringify({...draft,userId:'another'})}});assert.equal(other.location.href,'/reservar-cancha/');assert.equal(other.calls.length,1);
 const checkout=await run('booking-checkout.js',{storage});await checkout.handles['#confirm-booking'].click();assert.equal(checkout.location.href,'/reservar-cancha/confirmada/');assert.equal(checkout.store.has('pgo_booking_draft'),false);assert.equal(JSON.parse(checkout.store.get('pgo_booking_confirmed')).userId,'user');
 const conflict=await run('booking-checkout.js',{storage,conflict:true});await conflict.handles['#confirm-booking'].click();assert.ok(conflict.app.innerHTML.includes('ya no está disponible'));assert.ok(conflict.app.innerHTML.includes('Cambiar fecha o cancha'));assert.equal(conflict.store.has('pgo_booking_confirmed'),false);
 const confirmation=await run('booking-confirmation.js',{storage:{pgo_booking_confirmed:JSON.stringify({...draft,userId:'another'})}});assert.equal(confirmation.location.href,'/mis-reservas/');
 console.log('PASS: 10 player-flow scenarios (mock API/DOM): empty catalogue slots, missing pricing, missing durations, date/selection/draft, expired session, invalid response, cross-account draft, confirmation, occupied slot, cross-account receipt.');
})().catch(e=>{console.error(e);process.exitCode=1});
