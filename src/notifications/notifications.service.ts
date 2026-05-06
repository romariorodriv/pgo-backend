import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly firebaseApp: App | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.firebaseApp = this.createFirebaseApp();
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Token de notificacion requerido');
    }

    const device = await this.prisma.pushDeviceToken.upsert({
      where: { token: normalizedToken },
      create: {
        userId,
        token: normalizedToken,
        platform: platform.trim() || 'unknown',
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: platform.trim() || 'unknown',
        lastSeenAt: new Date(),
      },
    });

    return {
      id: device.id,
      platform: device.platform,
      lastSeenAt: device.lastSeenAt,
    };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    return this.sendToUsers([userId], payload);
  }

  async sendToAllUsers(
    payload: PushPayload,
    options?: { excludeUserIds?: string[] },
  ) {
    const devices = await this.prisma.pushDeviceToken.findMany({
      where: {
        userId:
          options?.excludeUserIds && options.excludeUserIds.length > 0
            ? { notIn: options.excludeUserIds }
            : undefined,
      },
      select: { token: true },
    });

    return this.sendToDevices(devices, payload);
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!this.firebaseApp) {
      this.logger.warn(
        'Firebase Admin no esta configurado. Se omitio el envio push.',
      );
      return { sent: 0, skipped: true };
    }

    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return { sent: 0, skipped: false };
    }

    const devices = await this.prisma.pushDeviceToken.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { token: true },
    });

    return this.sendToDevices(devices, payload);
  }

  private async sendToDevices(
    devices: { token: string }[],
    payload: PushPayload,
  ) {
    if (!this.firebaseApp) {
      this.logger.warn(
        'Firebase Admin no esta configurado. Se omitio el envio push.',
      );
      return { sent: 0, skipped: true };
    }

    if (devices.length === 0) {
      return { sent: 0, skipped: false };
    }

    try {
      let successCount = 0;
      let failureCount = 0;
      const invalidTokens: string[] = [];

      for (let index = 0; index < devices.length; index += 500) {
        const chunk = devices.slice(index, index + 500);
        const response = await getMessaging(
          this.firebaseApp,
        ).sendEachForMulticast({
          tokens: chunk.map((device) => device.token),
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data ?? {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'pgo_default',
              icon: 'ic_pgo_notification',
              color: '#17263A',
              sound: 'default',
            },
          },
        });

        successCount += response.successCount;
        failureCount += response.failureCount;
        invalidTokens.push(
          ...response.responses
            .map((item, itemIndex) => ({
              token: chunk[itemIndex].token,
              error: item.error?.code,
            }))
            .filter((item) =>
              [
                'messaging/invalid-registration-token',
                'messaging/registration-token-not-registered',
              ].includes(item.error ?? ''),
            )
            .map((item) => item.token),
        );
      }

      if (invalidTokens.length > 0) {
        await this.prisma.pushDeviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }

      return {
        sent: successCount,
        failed: failureCount,
      };
    } catch (error) {
      this.logger.error('No se pudo enviar push por Firebase', error);
      return { sent: 0, failed: devices.length };
    }
  }

  private createFirebaseApp() {
    if (getApps().length > 0) {
      return getApps()[0];
    }

    const serviceAccountJson = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    const serviceAccountPath = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );

    if (!serviceAccountJson && !serviceAccountPath) {
      return null;
    }

    try {
      const credentials = serviceAccountJson
        ? JSON.parse(serviceAccountJson)
        : JSON.parse(readFileSync(serviceAccountPath!, 'utf8'));

      return initializeApp({
        credential: cert(credentials),
      });
    } catch (error) {
      this.logger.error('No se pudo inicializar Firebase Admin', error);
      return null;
    }
  }
}
