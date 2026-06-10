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

    this.logger.log(
      `Push token registrado: platform=${device.platform} token=${this.maskPushToken(device.token)}`,
    );

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
    const recipients = await this.prisma.user.findMany({
      where:
        options?.excludeUserIds && options.excludeUserIds.length > 0
          ? { id: { notIn: options.excludeUserIds } }
          : undefined,
      select: { id: true },
    });
    await this.createInboxNotifications(
      recipients.map((recipient) => recipient.id),
      payload,
    );

    const devices = await this.prisma.pushDeviceToken.findMany({
      where: {
        userId:
          options?.excludeUserIds && options.excludeUserIds.length > 0
            ? { notIn: options.excludeUserIds }
            : undefined,
      },
      select: { token: true, platform: true },
    });

    return this.sendToDevices(devices, payload);
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return { sent: 0, skipped: false };
    }

    await this.createInboxNotifications(uniqueUserIds, payload);

    if (!this.firebaseApp) {
      this.logger.warn(
        'Firebase Admin no esta configurado. Se omitio el envio push.',
      );
      return { sent: 0, skipped: true };
    }

    const devices = await this.prisma.pushDeviceToken.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { token: true, platform: true },
    });

    return this.sendToDevices(devices, payload);
  }

  async listForUser(userId: string) {
    const notifications = await this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    const unreadCount = notifications.filter(
      (notification) => notification.readAt === null,
    ).length;

    return {
      unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
    };
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.appNotification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.appNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }

  async deleteForUser(userId: string, notificationId: string) {
    await this.prisma.appNotification.deleteMany({
      where: { id: notificationId, userId },
    });

    return { ok: true };
  }

  private async createInboxNotifications(
    userIds: string[],
    payload: PushPayload,
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) return;

    await this.prisma.appNotification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type: payload.data?.type ?? 'GENERAL',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      })),
    });
  }

  private async sendToDevices(
    devices: { token: string; platform: string }[],
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
              channelId: 'pgo_default_sound',
              icon: 'ic_pgo_notification',
              color: '#17263A',
              sound: 'pgo_notification',
            },
          },
          apns: {
            headers: {
              'apns-priority': '10',
            },
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        });

        successCount += response.successCount;
        failureCount += response.failureCount;
        invalidTokens.push(
          ...response.responses
            .map((item, itemIndex) => ({
              token: chunk[itemIndex].token,
              platform: chunk[itemIndex].platform,
              error: item.error?.code,
            }))
            .filter((item) =>
              [
                'messaging/invalid-registration-token',
                'messaging/registration-token-not-registered',
                'messaging/mismatched-credential',
              ].includes(item.error ?? ''),
            )
            .map((item) => item.token),
        );
        const errorCodes = response.responses
          .map((item, itemIndex) => ({
            code: item.error?.code,
            platform: chunk[itemIndex].platform,
            token: this.maskPushToken(chunk[itemIndex].token),
          }))
          .filter((item) => Boolean(item.code));
        if (errorCodes.length > 0) {
          this.logger.warn(
            `Errores push Firebase: ${errorCodes
              .map((item) => `${item.platform}:${item.code}:${item.token}`)
              .join(', ')}`,
          );
        }
      }

      if (invalidTokens.length > 0) {
        await this.prisma.pushDeviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }

      this.logger.log(
        `Push enviado: tokens=${devices.length}, platforms=${this.platformSummary(devices)}, ok=${successCount}, failed=${failureCount}`,
      );

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

  private maskPushToken(token: string) {
    if (!token) return 'empty';
    if (token.length <= 12) return `${token.slice(0, 2)}...`;
    return `${token.slice(0, 6)}...${token.slice(-6)}`;
  }

  private platformSummary(devices: { platform: string }[]) {
    const counts = devices.reduce<Record<string, number>>((acc, device) => {
      const platform = device.platform || 'unknown';
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([platform, count]) => `${platform}:${count}`)
      .join(',');
  }
}
