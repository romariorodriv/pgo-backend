import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  TournamentSharePreview,
  TournamentsService,
} from './tournaments.service';

@Controller('share/tournaments')
export class TournamentShareController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get(':id')
  async getSharePage(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const tournament = await this.tournamentsService.findSharePreview(id);
    const publicUrl = this.buildPublicUrl(request, `/share/tournaments/${id}`);
    const imageUrl = this.buildImageUrl(request, tournament);
    const description = this.buildDescription(tournament);

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
  <meta property="og:image" content="${this.escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${this.escapeHtml(imageUrl)}">
  <meta property="og:image:alt" content="${this.escapeHtml(tournament.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${this.escapeHtml(tournament.title)}">
  <meta name="twitter:description" content="${this.escapeHtml(description)}">
  <meta name="twitter:image" content="${this.escapeHtml(imageUrl)}">
</head>
<body>
  <main style="font-family: Arial, sans-serif; margin: 32px auto; max-width: 560px; padding: 0 16px;">
    <img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(tournament.title)}" style="border-radius: 16px; display: block; max-width: 100%; width: 100%;">
    <h1>${this.escapeHtml(tournament.title)}</h1>
    <p>${this.escapeHtml(description)}</p>
  </main>
</body>
</html>`);
  }

  @Get(':id/image')
  async getShareImage(@Param('id') id: string, @Res() response: Response) {
    const tournament = await this.tournamentsService.findSharePreview(id);
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

  private buildImageUrl(
    request: Request,
    tournament: TournamentSharePreview,
  ): string {
    const photoUrl = tournament.photoUrl?.trim();
    if (photoUrl?.startsWith('http://') || photoUrl?.startsWith('https://')) {
      return photoUrl;
    }
    if (photoUrl?.startsWith('data:image/')) {
      return this.buildPublicUrl(
        request,
        `/share/tournaments/${tournament.id}/image`,
      );
    }
    return this.getFallbackImageUrl();
  }

  private buildDescription(tournament: TournamentSharePreview): string {
    const date = new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(tournament.startsAt);
    return `${tournament.location}, ${tournament.district} - ${date}`;
  }

  private buildPublicUrl(request: Request, path: string): string {
    const protocol = request.header('x-forwarded-proto') ?? request.protocol;
    const host = request.header('x-forwarded-host') ?? request.get('host');
    return `${protocol}://${host}${path}`;
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
