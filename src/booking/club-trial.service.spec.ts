import { ClubTrialService } from './club-trial.service';
import { TRIAL_MS } from './club-entitlement';

const now = new Date('2026-10-29T15:00:00Z');
describe('Activación de prueba por propietario',()=>{
  let club:any,role:any,db:any,access:any,availability:any,service:ClubTrialService;
  beforeEach(()=>{
    jest.useFakeTimers().setSystemTime(now);
    club={id:'club-a',status:'APPROVED',isPublished:false,legacyAccess:false,trialStartedAt:null,trialEndsAt:null};role='OWNER';
    db={
      $queryRaw:jest.fn(),
      clubMember:{findUnique:jest.fn(async()=>({role}))},
      club:{findUnique:jest.fn(async()=>({...club})),update:jest.fn(async({data})=>Object.assign(club,data))},
      allowedDuration:{findMany:jest.fn(async()=>[{minutes:60}])},
    };
    // Serializes the simulated transactions, mirroring the row lock in SQL.
    let tail=Promise.resolve();
    db.$transaction=jest.fn(fn=>{const result=tail.then(()=>fn(db));tail=result.catch(()=>{});return result});
    access={membership:jest.fn(async(_user,_club,roles)=>{if(roles&&!roles.includes(role))throw Error('Forbidden');return {role,club:{...club}}})};
    availability={setupRange:jest.fn(async()=>[{available:true,endAt:new Date(now.getTime()+3600000).toISOString()}])};
    service=new ClubTrialService(db,access,availability);
  });
  afterEach(()=>jest.useRealTimers());
  it('publica y guarda exactamente 168 horas al activar',async()=>{const result=await service.activate('user-a','club-a');expect(result.state).toBe('ACTIVE');expect(club.isPublished).toBe(true);expect(club.trialEndsAt-club.trialStartedAt).toBe(TRIAL_MS);expect(access.membership).toHaveBeenCalledWith('user-a','club-a',['OWNER'])});
  it('reintentar no cambia fechas ni vuelve a escribir',async()=>{const a=await service.activate('user-a','club-a');jest.advanceTimersByTime(60000);const b=await service.activate('user-a','club-a');expect(a.trialEndsAt).toEqual(b.trialEndsAt);expect(db.club.update).toHaveBeenCalledTimes(1)});
  it('activaciones concurrentes crean una sola prueba',async()=>{const [a,b]=await Promise.all([service.activate('user-a','club-a'),service.activate('user-a','club-a')]);expect(a.trialEndsAt).toEqual(b.trialEndsAt);expect(db.club.update).toHaveBeenCalledTimes(1)});
  it('una prueba vencida no puede reiniciarse',async()=>{await service.activate('user-a','club-a');jest.advanceTimersByTime(TRIAL_MS);const result=await service.activate('user-a','club-a');expect(result.state).toBe('EXPIRED');expect(db.club.update).toHaveBeenCalledTimes(1)});
  for(const status of ['PENDING','REJECTED','SUSPENDED'])it(`no activa ${status}`,async()=>{club.status=status;await expect(service.activate('u','club-a')).rejects.toThrow();expect(db.club.update).not.toHaveBeenCalled()});
  for(const value of ['ADMIN','STAFF'])it(`${value} no activa`,async()=>{role=value;await expect(service.activate('u','club-a')).rejects.toThrow();expect(db.$transaction).not.toHaveBeenCalled()});
  it('revocación de rol dentro de transacción impide activar',async()=>{db.clubMember.findUnique.mockResolvedValue({role:'STAFF'});await expect(service.activate('u','club-a')).rejects.toThrow();expect(db.club.update).not.toHaveBeenCalled()});
  it('club ajeno no llega a la transacción',async()=>{access.membership.mockRejectedValue(Error('Forbidden'));await expect(service.activate('u','other')).rejects.toThrow();expect(db.$transaction).not.toHaveBeenCalled()});
  it('falta de tarifas/turnos impide publicar',async()=>{availability.setupRange.mockResolvedValue([{available:false}]);await expect(service.activate('u','club-a')).rejects.toThrow();expect(db.club.update).not.toHaveBeenCalled()});
  it('sin duración no permite activar',async()=>{db.allowedDuration.findMany.mockResolvedValue([]);await expect(service.activate('u','club-a')).rejects.toThrow();expect(db.club.update).not.toHaveBeenCalled()});
  it('turnos posteriores a siete días no bastan para activar',async()=>{availability.setupRange.mockResolvedValue([{available:true,endAt:new Date(now.getTime()+TRIAL_MS+1).toISOString()}]);await expect(service.activate('u','club-a')).rejects.toThrow()});
  it('preserva un club anterior sin generar prueba',async()=>{club.legacyAccess=true;club.isPublished=true;const result=await service.activate('u','club-a');expect(result.state).toBe('LEGACY');expect(club.trialStartedAt).toBeNull();expect(db.club.update).not.toHaveBeenCalled()});
  it('consultar estado no activa ni publica',async()=>{const result=await service.status('u','club-a');expect(result.canActivate).toBe(true);expect(club.isPublished).toBe(false);expect(db.club.update).not.toHaveBeenCalled()});
  it('estado pending no consume días',async()=>{club.status='PENDING';const result=await service.status('u','club-a');expect(result.state).toBe('WAITING_APPROVAL');expect(result.trialStartedAt).toBeNull();expect(availability.setupRange).not.toHaveBeenCalled()});
  it('ADMIN ve estado pero no puede activar',async()=>{role='ADMIN';expect((await service.status('u','club-a')).canActivate).toBe(false)});
});
