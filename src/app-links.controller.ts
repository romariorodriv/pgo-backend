import { Controller, Get, Header } from '@nestjs/common';

@Controller('.well-known')
export class AppLinksController {
  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  getAssetLinks() {
    const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'com.example.pgo';
    const fingerprints = (
      process.env.ANDROID_SHA256_CERT_FINGERPRINTS ??
      'C9:79:F6:B6:4A:52:74:10:2E:E5:8A:BB:D0:D5:5E:CD:C1:05:EE:1B:FC:CC:8C:98:B4:6F:1F:07:54:5B:45:A0'
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
}
