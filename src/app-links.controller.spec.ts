import { AppLinksController } from './app-links.controller';

describe('AppLinksController', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('serves Android links for the production package', () => {
    process.env.ANDROID_APP_LINKS_SHA256 = 'AA:BB, CC:DD';
    const result = new AppLinksController().getAssetLinks();

    expect(result[0].target.package_name).toBe('com.pgo.app');
    expect(result[0].target.sha256_cert_fingerprints).toEqual([
      'AA:BB',
      'CC:DD',
    ]);
  });

  it('serves AASA when an Apple team id is configured', () => {
    process.env.APPLE_TEAM_ID = 'TEAM123';
    const result = new AppLinksController().getAppleAppSiteAssociation();

    expect(result.applinks.details).toEqual([
      {
        appIDs: ['TEAM123.com.pgo.app'],
        components: [{ '/': '/partidos/*' }],
      },
    ]);
  });

  it('keeps AASA valid when Apple is not configured yet', () => {
    delete process.env.APPLE_TEAM_ID;
    const result = new AppLinksController().getAppleAppSiteAssociation();

    expect(result).toEqual({ applinks: { details: [] } });
  });
});
