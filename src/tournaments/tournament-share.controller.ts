import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  TournamentSharePreview,
  TournamentsService,
} from './tournaments.service';

@Controller()
export class TournamentShareController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get(['share/tournaments/:slug', 'torneos/:slug'])
  async getSharePage(
    @Param('slug') slug: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const tournament = await this.tournamentsService.findSharePreview(slug);
    const publicSlug = tournament.slug ?? this.slugify(tournament.title);
    const publicUrl = this.buildPublicUrl(`/torneos/${publicSlug}`);
    const imageUrl = this.buildImageUrl(request, tournament);
    const userAgent = request.header('user-agent') ?? '';
    const isAndroid = /android/i.test(userAgent);
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const storeUrl = this.storeUrlForPlatform(isIos, isAndroid);
    const androidAppIdentifier = tournament.id;
    const appUrl = isAndroid
      ? this.buildAndroidIntentUrl(androidAppIdentifier, storeUrl ?? publicUrl)
      : isIos
        ? this.buildCustomSchemeUrl(publicSlug)
        : publicUrl;
    const description = this.buildDescription(tournament);
    const date = this.formatDateTime(tournament.startsAt);
    const location = [tournament.location, tournament.district]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' · ');

    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; upgrade-insecure-requests",
    );
    response.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.escapeHtml(tournament.title)}</title>
  <meta name="description" content="${this.escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${this.escapeHtml(tournament.title)}">
  <meta property="og:description" content="${this.escapeHtml(description)}">
  <meta property="og:url" content="${this.escapeHtml(publicUrl)}">
  <meta property="og:site_name" content="PGO">
  <meta property="og:image" content="${this.escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${this.escapeHtml(imageUrl)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${this.escapeHtml(tournament.title)}">
  <meta property="al:android:url" content="${this.escapeHtml(this.buildCustomSchemeUrl(androidAppIdentifier))}">
  <meta property="al:android:package" content="com.pgo.app">
  <meta property="al:android:app_name" content="PGO">
  <meta property="al:ios:url" content="${this.escapeHtml(this.buildCustomSchemeUrl(publicSlug))}">
  <meta property="al:ios:app_name" content="PGO">
  ${this.iosAppStoreMeta()}
  <meta property="al:web:url" content="${this.escapeHtml(publicUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${this.escapeHtml(tournament.title)}">
  <meta name="twitter:description" content="${this.escapeHtml(description)}">
  <meta name="twitter:image" content="${this.escapeHtml(imageUrl)}">
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #142b4a; background: linear-gradient(145deg, #102c50, #28587c 42%, #eef1f4 42%); }
    main { width: min(620px, 100%); margin: 0 auto; padding: 36px 18px 56px; }
    .brand { color: white; font-size: 29px; font-weight: 900; letter-spacing: .08em; margin: 0 0 28px; }
    .card { background: white; border-radius: 28px; box-shadow: 0 18px 45px rgba(7, 28, 55, .18); overflow: hidden; }
    .hero { aspect-ratio: 16 / 9; background: #d9e1ea; display: block; object-fit: cover; width: 100%; }
    .content { padding: 24px; }
    .state { display: inline-block; padding: 7px 12px; border-radius: 999px; background: #d9ff46; color: #142b4a; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    h1 { font-size: 27px; line-height: 1.1; margin: 16px 0 20px; }
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
    <section class="card">
      <img class="hero" src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(tournament.title)}">
      <div class="content">
        <span class="state">Torneo</span>
        <h1>${this.escapeHtml(tournament.title)}</h1>
        <div class="summary">
          <div><span>Categoría</span><strong>${this.escapeHtml(tournament.category)}</strong></div>
          <div><span>Modalidad</span><strong>${this.escapeHtml(tournament.modality)}</strong></div>
          <div><span>Sede</span><strong>${this.escapeHtml(location)}</strong></div>
          <div><span>Fecha y hora</span><strong>${this.escapeHtml(date)}</strong></div>
          <div><span>Inscripción</span><strong>S/ ${tournament.entryFee}</strong></div>
        </div>
        ${this.actions(appUrl, storeUrl, isIos)}
      </div>
    </section>
  </main>
  ${this.autoOpenScript(appUrl, storeUrl, isAndroid)}
</body>
</html>`);
  }

  @Get([
    'share/tournaments/:slug/image',
    'share/tournaments/:slug/image.jpg',
    'torneos/:slug/image',
    'torneos/:slug/image.jpg',
  ])
  async getShareImage(@Param('slug') slug: string, @Res() response: Response) {
    const tournament = await this.tournamentsService.findSharePreview(slug);
    const photoUrl = tournament.photoUrl?.trim();

    if (!photoUrl?.startsWith('data:image/')) {
      response.redirect(this.getFallbackImageUrl());
      return;
    }

    const match = photoUrl.match(
      /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/,
    );
    if (!match) {
      response.redirect(this.getFallbackImageUrl());
      return;
    }

    const [, contentType, base64] = match;
    response
      .type(contentType)
      .setHeader('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(base64, 'base64'));
  }

  private actions(
    appUrl: string,
    storeUrl: string | undefined,
    isIos: boolean,
  ) {
    const unavailableLabel = isIos
      ? 'Descarga PGO desde App Store o TestFlight'
      : 'Próximamente en tiendas';
    const download = storeUrl
      ? `<a class="button secondary" href="${this.escapeHtml(storeUrl)}">Descargar PGO</a>`
      : `<p class="coming-soon">${unavailableLabel}</p>`;
    return `<div class="actions">
      <a class="button primary" href="${this.escapeHtml(appUrl)}">Abrir en PGO</a>
      ${download}
    </div>`;
  }

  private autoOpenScript(
    appUrl: string,
    storeUrl: string | undefined,
    autoOpen: boolean,
  ) {
    if (!autoOpen) return '';
    const encodedAppUrl = JSON.stringify(appUrl);
    const encodedStoreUrl = JSON.stringify(storeUrl ?? '');
    return `<script>
      (function () {
        var appUrl = ${encodedAppUrl};
        var storeUrl = ${encodedStoreUrl};
        var openedAt = Date.now();
        var didHide = false;
        function markHidden() { didHide = true; }
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) markHidden();
        });
        window.addEventListener('pagehide', markHidden);
        if (storeUrl) {
          window.setTimeout(function () {
            if (!didHide && Date.now() - openedAt < 2600) {
              window.location.href = storeUrl;
            }
          }, 1800);
        }
        window.location.href = appUrl;
      })();
    </script>`;
  }

  private buildImageUrl(
    request: Request,
    tournament: TournamentSharePreview,
  ): string {
    const photoUrl = tournament.photoUrl?.trim();
    if (photoUrl?.startsWith('http://') || photoUrl?.startsWith('https://')) {
      return photoUrl;
    }
    if (photoUrl?.startsWith('data:image/')) {
      const publicSlug = tournament.slug ?? this.slugify(tournament.title);
      return this.buildPublicUrl(`/torneos/${publicSlug}/image.jpg`);
    }
    return this.getFallbackImageUrl();
  }

  private buildDescription(tournament: TournamentSharePreview): string {
    const date = this.formatDateTime(tournament.startsAt);
    return `${tournament.location}, ${tournament.district} · ${date}`;
  }

  private formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Lima',
    }).format(value);
  }

  private buildPublicUrl(path: string): string {
    return `https://api.pgoapp.com${path}`;
  }

  private buildAndroidIntentUrl(id: string, fallbackUrl: string): string {
    return [
      `intent://tournaments/${encodeURIComponent(id)}`,
      '#Intent',
      'scheme=pgo',
      'package=com.pgo.app',
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`,
      'end',
    ].join(';');
  }

  private buildCustomSchemeUrl(id: string): string {
    return `pgo://tournaments/${encodeURIComponent(id)}`;
  }

  private storeUrlForPlatform(isIos: boolean, isAndroid: boolean) {
    if (isIos) {
      return (
        process.env.PGO_IOS_STORE_URL?.trim() || this.defaultIosStoreSearchUrl()
      );
    }
    if (isAndroid) {
      return (
        process.env.PGO_ANDROID_STORE_URL?.trim() ||
        'https://play.google.com/store/apps/details?id=com.pgo.app'
      );
    }
    return (
      process.env.PGO_ANDROID_STORE_URL?.trim() ||
      process.env.PGO_IOS_STORE_URL?.trim() ||
      undefined
    );
  }

  private defaultIosStoreSearchUrl(): string {
    return 'https://apps.apple.com/pe/search?term=PGO';
  }

  private iosAppStoreMeta(): string {
    const appStoreId = process.env.PGO_IOS_APP_STORE_ID?.trim();
    if (!appStoreId) return '';
    return `<meta property="al:ios:app_store_id" content="${this.escapeHtml(appStoreId)}">`;
  }

  private slugify(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized.length > 0 ? normalized : 'torneo';
  }

  private getFallbackImageUrl(): string {
    return 'https://via.placeholder.com/1200x630/1f3d5b/d6ff3f.png?text=PGO';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
