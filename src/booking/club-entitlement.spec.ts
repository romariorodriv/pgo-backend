import { canReceiveBookings, publicClubWhere, withinBookingHorizon, TRIAL_MS } from './club-entitlement';
import { AvailabilityService } from './availability.service';
import { ReservationsService } from './reservations.service';
import { ReservationSource } from '@prisma/client';

const now = new Date('2026-10-29T15:00:00Z');
const active = { status: 'APPROVED', isPublished: true, legacyAccess: false, trialStartedAt: now, trialEndsAt: new Date(now.getTime()+TRIAL_MS) };
describe('Vigencia comercial del club', () => {
  it('permite una prueba publicada activa', () => expect(canReceiveBookings(active, now)).toBe(true));
  it('vence exactamente al terminar las 168 horas', () => expect(canReceiveBookings(active, active.trialEndsAt)).toBe(false));
  it('no exige un cron para vencer', () => expect(canReceiveBookings(active, new Date(active.trialEndsAt.getTime()+1))).toBe(false));
  it('no permite fechas de inicio futuras', () => expect(canReceiveBookings(active, new Date(now.getTime()-1))).toBe(false));
  it('no publica por aprobación solamente', () => expect(canReceiveBookings({...active,isPublished:false},now)).toBe(false));
  it('campos ausentes no conceden acceso', () => expect(canReceiveBookings({status:'APPROVED'},now)).toBe(false));
  for(const status of ['PENDING','SUSPENDED','REJECTED'])it(`rechaza ${status} incluso para un club previo`,()=>expect(canReceiveBookings({...active,status,legacyAccess:true},now)).toBe(false));
  it('preserva acceso previo sin asignar fecha de prueba',()=>expect(canReceiveBookings({status:'APPROVED',isPublished:true,legacyAccess:true},now)).toBe(true));
  it('permite turnos hasta el límite exacto',()=>expect(withinBookingHorizon(active,active.trialEndsAt)).toBe(true));
  it('rechaza turnos que terminan después del límite',()=>expect(withinBookingHorizon(active,new Date(active.trialEndsAt.getTime()+1))).toBe(false));
  it('no limita el horizonte de un club previo',()=>expect(withinBookingHorizon({...active,legacyAccess:true},new Date('2099-01-01'))).toBe(true));
  it('catálogo exige publicación y vigencia desde el servidor',()=>{const where=publicClubWhere(now);expect(where.status).toBe('APPROVED');expect(where.isPublished).toBe(true);expect(where.OR).toEqual([{legacyAccess:true},{trialStartedAt:{lte:now},trialEndsAt:{gt:now}}])});
});

describe('Reservas: todas las fuentes respetan la vigencia',()=>{
  for(const source of Object.values(ReservationSource))for(const expired of [false,true])it(`${source}: rechaza ${expired?'prueba vencida':'turno posterior al vencimiento'}`,async()=>{
    const clock=new Date();
    const club={...active,trialStartedAt:new Date(clock.getTime()-TRIAL_MS),trialEndsAt:new Date(clock.getTime()+(expired?-1:60000))};
    const tx:any={$queryRaw:jest.fn(),court:{findUnique:jest.fn(async()=>({clubId:'a',active:true,status:'ACTIVE',club}))},reservation:{create:jest.fn()}};
    const prisma:any={$transaction:jest.fn(async fn=>fn(tx))};
    const access:any={membership:jest.fn()};
    await expect(new ReservationsService(prisma,access).create('user',{courtId:'court',startAt:new Date(clock.getTime()+120000).toISOString(),durationMinutes:60} as any,source)).rejects.toThrow();
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });
});

describe('Disponibilidad comparte publicación y horizonte de prueba',()=>{
  beforeEach(()=>jest.useFakeTimers().setSystemTime(now));
  afterEach(()=>jest.useRealTimers());
  function db(club:any){return {club:{findUnique:jest.fn(async()=>club)},courtBlock:{findMany:jest.fn(async()=>[])},reservation:{findMany:jest.fn(async()=>[])}} as any}
  const configuration={courts:[{id:'court',name:'Cancha',active:true,status:'ACTIVE'}],schedules:[{courtId:null,dayOfWeek:4,openTime:'11:00',closeTime:'14:00',active:true}],allowedDurations:[{minutes:60,active:true}],priceRules:[{courtId:null,dayOfWeek:4,startTime:'11:00',endTime:'14:00',durationMinutes:60,price:100,active:true}]};
  it('una aprobación sin activación no expone turnos',async()=>{const prisma=db({...active,...configuration,isPublished:false});await expect(new AvailabilityService(prisma).range('a','2026-10-29','2026-10-29',60)).rejects.toThrow()});
  it('marca turnos fuera de vigencia como no disponibles',async()=>{
    const prisma=db({...active,...configuration,trialEndsAt:new Date('2026-10-29T17:00:00Z')});
    const slots=await new AvailabilityService(prisma).range('a','2026-10-29','2026-10-29',60);
    expect(slots[0].available).toBe(true);expect(slots[1].reason).toBe('TRIAL_LIMIT');expect(slots[1].available).toBe(false);
  });
  it('la comprobación interna reutiliza tarifas y horarios sin publicar',async()=>{const prisma=db({...active,...configuration,isPublished:false});expect((await new AvailabilityService(prisma).setupRange(prisma,'a','2026-10-29','2026-10-29',60)).some(s=>s.available)).toBe(true)});
  it('mantenimiento no es un turno utilizable para activar',async()=>{const prisma=db({...active,...configuration,courts:[{id:'court',name:'Cancha',active:true,status:'MAINTENANCE'}]});expect((await new AvailabilityService(prisma).setupRange(prisma,'a','2026-10-29','2026-10-29',60)).some(s=>s.available)).toBe(false)});
});

describe('Revalidación antes de persistir una reserva',()=>{
  beforeEach(()=>jest.useFakeTimers().setSystemTime(now));
  afterEach(()=>jest.useRealTimers());
  for(const changed of [false,true])it(changed?'rechaza un club suspendido durante la solicitud':'permite guardar una reserva válida dentro de la prueba',async()=>{
    const tx:any={
      $queryRaw:jest.fn(),
      court:{findUnique:jest.fn(async()=>({id:'court',clubId:'club-a',active:true,status:'ACTIVE',club:active}))},
      club:{findUnique:jest.fn(async()=>({...active,status:changed?'SUSPENDED':'APPROVED'}))},
      allowedDuration:{findUnique:jest.fn(async()=>({active:true}))},
      schedule:{findMany:jest.fn(async()=>[{courtId:null,active:true,openTime:'08:00',closeTime:'22:00'}])},
      priceRule:{findMany:jest.fn(async()=>[{courtId:null,startTime:'08:00',endTime:'22:00',price:100}])},
      courtBlock:{count:jest.fn(async()=>0)},
      reservation:{count:jest.fn(async()=>0),create:jest.fn(async({data})=>data)},
    };
    const prisma:any={$transaction:jest.fn(async fn=>fn(tx))};
    const operation=new ReservationsService(prisma,{} as any).create('player',{courtId:'court',startAt:'2026-10-29T17:00:00Z',durationMinutes:60} as any);
    if(changed){await expect(operation).rejects.toThrow();expect(tx.reservation.create).not.toHaveBeenCalled()}
    else{await expect(operation).resolves.toMatchObject({clubId:'club-a',price:100});expect(tx.reservation.create).toHaveBeenCalledTimes(1)}
    expect(tx.club.findUnique).toHaveBeenCalled();
  });
});
