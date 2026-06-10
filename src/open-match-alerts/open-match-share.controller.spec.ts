import { OpenMatchAlertStatus } from '@prisma/client';
import { OpenMatchShareController } from './open-match-share.controller';
import type { OpenMatchAlertsService } from './open-match-alerts.service';

describe('OpenMatchShareController', () => {
  const existingId = '123e4567-e89b-42d3-a456-426614174000';

  function responseMock() {
    const response = {
      status: jest.fn(),
      type: jest.fn(),
      send: jest.fn(),
    };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
    response.send.mockReturnValue(response);
    return response;
  }

  it('renders a public match without private fields', async () => {
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue({
        id: existingId,
        category: '4ta',
        format: 'Dobles',
        startsAt: new Date('2026-06-10T20:00:00.000Z'),
        club: 'PGO Club',
        district: 'Miraflores',
        missingPlayers: 1,
        status: OpenMatchAlertStatus.OPEN,
      }),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
    );

    const html = response.send.mock.calls[0][0] as string;
    expect(response.status).toHaveBeenCalledWith(200);
    expect(html).toContain('Partido de pádel en PGO');
    expect(html).toContain('PGO Club');
    expect(html).toContain('Cupos disponibles');
    expect(html).not.toContain('participants');
    expect(html).not.toContain('invitations');
    expect(html).not.toContain('coordination');
  });

  it('renders controlled HTML for invalid ids without querying Prisma', async () => {
    const service = {
      findPublicPreview: jest.fn(),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      'invalid',
      response as never,
    );

    expect(service.findPublicPreview).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send.mock.calls[0][0]).toContain('Partido no disponible');
  });

  it('renders controlled HTML when a valid match no longer exists', async () => {
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue(null),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
    );

    expect(service.findPublicPreview).toHaveBeenCalledWith(existingId);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send.mock.calls[0][0]).toContain('Partido no disponible');
  });

  it('uses an Android intent without a broken store link', async () => {
    delete process.env.PGO_ANDROID_STORE_URL;
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue(null),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
      'Mozilla/5.0 (Linux; Android 14)',
    );

    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain('intent://pgoapp.com/partidos/');
    expect(html).toContain('Abrir en PGO');
    expect(html).toContain('Próximamente en tiendas');
    expect(html).not.toContain('play.google.com');
  });

  it('uses the universal link and configured iOS store URL', async () => {
    process.env.PGO_IOS_STORE_URL = 'https://example.test/testflight';
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue(null),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );

    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain(`https://pgoapp.com/partidos/${existingId}`);
    expect(html).toContain('https://example.test/testflight');
    expect(html).not.toContain('intent://');
  });

  it('shows a controlled iOS store placeholder when no URL exists', async () => {
    delete process.env.PGO_IOS_STORE_URL;
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue(null),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );

    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain('Próximamente en App Store/TestFlight');
    expect(html).not.toContain('Descargar PGO');
  });

  it.each([
    OpenMatchAlertStatus.FULL,
    OpenMatchAlertStatus.COMPLETED,
    OpenMatchAlertStatus.CANCELED,
  ])('renders the %s public state', async (status) => {
    const service = {
      findPublicPreview: jest.fn().mockResolvedValue({
        id: existingId,
        category: '4ta',
        format: 'Dobles',
        startsAt: new Date('2026-06-10T20:00:00.000Z'),
        club: 'PGO Club',
        district: 'Miraflores',
        missingPlayers: 0,
        status,
      }),
    } as unknown as OpenMatchAlertsService;
    const response = responseMock();

    await new OpenMatchShareController(service).getSharePage(
      existingId,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send.mock.calls[0][0]).toContain(
      status === OpenMatchAlertStatus.FULL
        ? 'Completo'
        : status === OpenMatchAlertStatus.COMPLETED
          ? 'Finalizado'
          : 'Cancelado',
    );
  });
});
