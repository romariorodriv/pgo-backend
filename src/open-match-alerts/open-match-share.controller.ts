import { Controller, Get, Header, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OpenMatchAlertStatus } from '@prisma/client';
import { OpenMatchAlertsService } from './open-match-alerts.service';
import type { PublicOpenMatchPreviewDto } from './dto/public-open-match-preview.dto';

@Controller()
export class OpenMatchShareController {
  constructor(private readonly alertsService: OpenMatchAlertsService) {}

  @Get('partidos/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getSharePage(
    @Param('id') id: string,
    @Res() response: Response,
    @Headers('user-agent') userAgent = '',
  ) {
    const match = this.isUuid(id)
      ? await this.alertsService.findPublicPreview(id)
      : null;

    response
      .status(200)
      .type('html')
      .send(this.renderPage(id, match, userAgent));
  }

  private renderPage(
    id: string,
    match: PublicOpenMatchPreviewDto | null,
    userAgent: string,
  ): string {
    const publicUrl = `https://pgoapp.com/partidos/${encodeURIComponent(id)}`;
    const isAndroid = /android/i.test(userAgent);
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const storeUrl = (
      isIos ? process.env.PGO_IOS_STORE_URL : process.env.PGO_ANDROID_STORE_URL
    )?.trim();
    const appUrl = isAndroid
      ? this.buildAndroidIntentUrl(id, publicUrl)
      : publicUrl;

    if (!match) {
      return this.document({
        title: 'Partido no disponible',
        description:
          'El partido no existe, fue eliminado o el enlace no es válido.',
        body: `
          <section class="card state-card">
            <span class="state unavailable">No disponible</span>
            <h1>Partido no disponible</h1>
            <p>El partido no existe, fue eliminado o el enlace no es válido.</p>
            ${this.actions(appUrl, storeUrl, isIos)}
          </section>`,
        publicUrl,
      });
    }

    const state = this.publicState(match.status);
    const date = new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Lima',
    }).format(match.startsAt);
    const location = [match.club, match.district]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' · ');
    const description = `${match.category} · ${match.format} · ${location} · ${date}`;
    return this.document({
      title: 'Partido de pádel en PGO',
      description,
      publicUrl,
      body: `
        <section class="card">
          <span class="state ${state.className}">${state.label}</span>
          <h1>Partido de pádel en PGO</h1>
          <div class="summary">
            <div><span>Categoría</span><strong>${this.escapeHtml(match.category)}</strong></div>
            <div><span>Formato</span><strong>${this.escapeHtml(match.format)}</strong></div>
            <div><span>Sede</span><strong>${this.escapeHtml(location)}</strong></div>
            <div><span>Fecha y hora</span><strong>${this.escapeHtml(date)}</strong></div>
            <div><span>Cupos disponibles</span><strong>${match.missingPlayers}</strong></div>
          </div>
          ${this.actions(appUrl, storeUrl, isIos)}
        </section>`,
    });
  }

  private document(options: {
    title: string;
    description: string;
    body: string;
    publicUrl: string;
  }): string {
    const title = this.escapeHtml(options.title);
    const description = this.escapeHtml(options.description);
    const publicUrl = this.escapeHtml(options.publicUrl);
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PGO">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${publicUrl}">
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #142b4a; background: linear-gradient(145deg, #102c50, #28587c 42%, #eef1f4 42%); }
    main { width: min(620px, 100%); margin: 0 auto; padding: 36px 18px 56px; }
    .brand { color: white; font-size: 29px; font-weight: 900; letter-spacing: .08em; margin: 0 0 28px; }
    .card { background: white; border-radius: 28px; box-shadow: 0 18px 45px rgba(7, 28, 55, .18); padding: 28px; }
    .state-card { text-align: center; padding-block: 44px; }
    h1 { font-size: 27px; line-height: 1.1; margin: 16px 0 22px; }
    p { color: #52647a; line-height: 1.55; }
    .state { display: inline-block; padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .open { background: #d9ff46; color: #142b4a; }
    .full { background: #e6ebf1; color: #334b67; }
    .finished, .unavailable { background: #ffe8e8; color: #a12b38; }
    .summary { display: grid; gap: 13px; }
    .summary div { background: #f3f5f7; border-radius: 15px; padding: 13px 15px; }
    .summary span, .summary strong { display: block; }
    .summary span { color: #718096; font-size: 12px; margin-bottom: 4px; }
    .summary strong { font-size: 15px; }
    .actions { display: grid; gap: 10px; margin-top: 24px; }
    .button { border-radius: 16px; display: block; font-weight: 900; padding: 15px 18px; text-align: center; text-decoration: none; }
    .primary { background: #d9ff46; color: #142b4a; }
    .secondary { background: #142b4a; color: white; }
  </style>
</head>
<body>
  <main>
    <div class="brand">PGO</div>
    ${options.body}
  </main>
</body>
</html>`;
  }

  private publicState(status: OpenMatchAlertStatus) {
    switch (status) {
      case OpenMatchAlertStatus.OPEN:
        return { label: 'Abierto', className: 'open' };
      case OpenMatchAlertStatus.FULL:
        return { label: 'Completo', className: 'full' };
      case OpenMatchAlertStatus.COMPLETED:
        return { label: 'Finalizado', className: 'finished' };
      case OpenMatchAlertStatus.CANCELED:
        return { label: 'Cancelado', className: 'unavailable' };
    }
  }

  private actions(
    appUrl: string,
    storeUrl: string | undefined,
    isIos: boolean,
  ) {
    const unavailableLabel = isIos
      ? 'Próximamente en App Store/TestFlight'
      : 'Próximamente en tiendas';
    const download = storeUrl
      ? `<a class="button secondary" href="${this.escapeHtml(storeUrl)}">Descargar PGO</a>`
      : `<p class="coming-soon">${unavailableLabel}</p>`;
    return `<div class="actions">
      <a class="button primary" href="${this.escapeHtml(appUrl)}">Abrir en PGO</a>
      ${download}
    </div>`;
  }

  private buildAndroidIntentUrl(id: string, fallbackUrl: string) {
    return [
      `intent://pgoapp.com/partidos/${encodeURIComponent(id)}`,
      '#Intent',
      'scheme=https',
      'package=com.pgo.app',
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`,
      'end',
    ].join(';');
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
