import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordReset(email: string, resetToken: string) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('MAIL_FROM');
    const resetUrl = this.configService.get<string>('PASSWORD_RESET_URL');

    if (!apiKey || !from || !resetUrl) {
      this.logger.warn('password_reset_email_skipped reason=missing_provider');
      return { sent: false };
    }

    const link = `${resetUrl}${resetUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(resetToken)}`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Restablece tu contrasena de PGO',
          text:
            'Usa este enlace para restablecer tu contrasena de PGO. ' +
            'El enlace vence en 30 minutos y solo puede usarse una vez: ' +
            link,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `password_reset_email_failed status=${response.status}`,
        );
        return { sent: false };
      }

      return { sent: true };
    } catch (error) {
      this.logger.error(
        `password_reset_email_failed type=${(error as Error).name}`,
      );
      return { sent: false };
    }
  }
}
