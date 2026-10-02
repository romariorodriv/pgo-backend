// Run from your existing backend root: node verify-club-v5.cjs
const root=process.cwd();
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/tsconfig.json'});
const assert=require('node:assert/strict');
const {ClubManagementService}=require(root+'/src/booking/club-management.service.ts');
const {ClubAccessService}=require(root+'/src/booking/club-access.service.ts');
const {SetSchedulesDto}=require(root+'/src/booking/booking.dto.ts');
const {validate}=require(root+'/node_modules/class-validator');
const {plainToInstance}=require(root+'/node_modules/class-transformer');
let checks=0;const pass=()=>checks++;const club={id:'club',status:'APPROVED'};let role='OWNER',overlap=false,duration=true;
const access={membership:async(u,c,roles)=>{if(roles&&!roles.includes(role))throw Object.assign(Error('Denied'),{status:403});return {club,role}},court:async(u,id)=>({id,clubId:'club'})};
const tx={$queryRaw:async()=>[],allowedDuration:{findFirst:async()=>duration?{minutes:60}:null,deleteMany:async()=>{},createMany:async()=>{}},schedule:{deleteMany:async()=>{},createMany:async()=>{}},priceRule:{findFirst:async()=>overlap?{id:'existing'}:null,create:async({data})=>data,update:async({data})=>data},courtBlock:{create:async({data})=>data},reservation:{count:async()=>0}};
const prisma={$transaction:fn=>fn(tx),court:{create:async({data})=>data,findFirst:async()=>({id:'court'}),update:async({data})=>data},priceRule:{findUnique:async()=>({id:'price',clubId:'club',courtId:null,dayOfWeek:1,startTime:'08:00',endTime:'22:00',durationMinutes:60,active:true})}};
const service=new ClubManagementService(prisma,access);const rejected=async(fn,status)=>{await assert.rejects(fn,e=>(e.getStatus?.()||e.status)===status);pass()};
(async()=>{
 assert.equal((await service.context('owner')).membershipRole,'OWNER');pass();assert.equal((await service.createCourt('owner',{name:'Cancha 1'})).clubId,'club');pass();
 role='STAFF';await rejected(()=>service.createCourt('staff',{name:'Cancha'}),403);role='OWNER';club.status='SUSPENDED';await rejected(()=>service.createCourt('owner',{name:'Cancha'}),403);club.status='APPROVED';
 await rejected(()=>service.setSchedules('owner',{schedules:[],durations:[0]}),400);const row={courtId:null,dayOfWeek:1,openTime:'08:00',closeTime:'22:00',active:true};
 await rejected(()=>service.setSchedules('owner',{schedules:[row,row],durations:[60]}),400);await rejected(()=>service.setSchedules('owner',{schedules:[{...row,closeTime:'07:00'}],durations:[60]}),400);assert.deepEqual(await service.setSchedules('owner',{schedules:[row],durations:[60,90]}),{ok:true});pass();
 const price={courtId:null,dayOfWeek:1,startTime:'08:00',endTime:'22:00',durationMinutes:60,price:80};assert.equal(String((await service.addPrice('owner',price)).price),'80');pass();overlap=true;await rejected(()=>service.addPrice('owner',price),409);overlap=false;duration=false;await rejected(()=>service.addPrice('owner',price),400);duration=true;await rejected(()=>service.addPrice('owner',{...price,endTime:'08:30'}),400);assert.equal((await service.updatePrice('owner','price',{active:false})).active,false);pass();
 const block={courtId:'court',date:'invalid',start:'08:00',end:'09:00',reason:'OTHER'};await rejected(()=>service.addBlock('owner',block),400);tx.reservation.count=async()=>1;await rejected(()=>service.addBlock('owner',{...block,date:'2026-10-04'}),409);
 const dto=plainToInstance(SetSchedulesDto,{schedules:[row],durations:[0,300]});assert.ok((await validate(dto)).length);pass();
 const realAccess=new ClubAccessService({clubMember:{findFirst:async({where})=>where.userId==='owner'&&where.role?.in.includes('OWNER')?{club,role:'OWNER'}:null}});await realAccess.membership('owner',undefined,['OWNER','ADMIN']);await rejected(()=>realAccess.membership('staff',undefined,['OWNER','ADMIN']),403);
 console.log('PASS: '+checks+' checks (configuration, roles, status, durations, schedules, pricing, blocks)');
})().catch(e=>{console.error(e);process.exitCode=1});
