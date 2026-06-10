import { Controller, Get, Header } from '@nestjs/common';

@Controller('.well-known')
export class AppLinksController {
  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  getAssetLinks() {
    const packageName = 'com.pgo.app';
    // Production must override this with the Play App Signing SHA-256.
    const fingerprints = (
      process.env.ANDROID_APP_LINKS_SHA256 ??
      '4A:6B:E5:03:1F:94:26:B9:34:41:54:12:47:15:EA:BA:60:0E:68:57:57:84:9A:D0:F4:CA:DC:46:F9:70:47:65'
    )
      .split(',')
      .map((fingerprint) => fingerprint.trim())
      .filter((fingerprint) => fingerprint.length > 0);

    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  }

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  getAppleAppSiteAssociation() {
    const teamId = process.env.APPLE_TEAM_ID?.trim();
    return {
      applinks: {
        details: teamId
          ? [
              {
                appIDs: [`${teamId}.com.pgo.app`],
                components: [{ '/': '/partidos/*' }],
              },
            ]
          : [],
      },
    };
  }
}
