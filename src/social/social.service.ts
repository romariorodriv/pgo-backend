import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Friendship, FriendshipStatus, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type FriendshipWithUsers = Friendship & {
  requester: SocialUser;
  addressee: SocialUser;
  userA: SocialUser;
  userB: SocialUser;
};

type SocialUser = {
  id: string;
  name: string;
  email: string;
  profile: {
    photoUrl: string | null;
    category: string | null;
    rankingPosition: number;
    preferredClub: string | null;
  } | null;
};

const socialUserSelect = {
  id: true,
  name: true,
  email: true,
  profile: {
    select: {
      photoUrl: true,
      category: true,
      rankingPosition: true,
      preferredClub: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: this.friendshipInclude(),
      orderBy: { updatedAt: 'desc' },
    });

    return friendships.map((friendship) => {
      const friend = this.otherUser(friendship, userId);
      return {
        ...friend,
        friendshipId: friendship.id,
        friendshipStatus: friendship.status,
      };
    });
  }

  async listRequests(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendship.findMany({
        where: {
          addresseeId: userId,
          status: FriendshipStatus.PENDING,
        },
        include: this.friendshipInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendship.findMany({
        where: {
          requesterId: userId,
          status: FriendshipStatus.PENDING,
        },
        include: this.friendshipInclude(),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      incoming: incoming.map((friendship) =>
        this.formatConnection(friendship, userId),
      ),
      outgoing: outgoing.map((friendship) =>
        this.formatConnection(friendship, userId),
      ),
    };
  }

  async requestFriend(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new BadRequestException('No puedes agregarte a ti mismo');
    }

    await this.ensureUserExists(addresseeId);
    const pair = this.buildPair(requesterId, addresseeId);

    const existing = await this.prisma.friendship.findUnique({
      where: {
        userAId_userBId: pair,
      },
      include: this.friendshipInclude(),
    });

    if (!existing) {
      const created = await this.prisma.friendship.create({
        data: {
          requesterId,
          addresseeId,
          userAId: pair.userAId,
          userBId: pair.userBId,
          status: FriendshipStatus.PENDING,
        },
        include: this.friendshipInclude(),
      });

      await this.notifyFriendRequest(created);

      return this.formatConnection(created, requesterId);
    }

    if (existing.status === FriendshipStatus.ACCEPTED) {
      return this.formatConnection(existing, requesterId);
    }

    if (existing.status === FriendshipStatus.BLOCKED) {
      throw new ForbiddenException(
        'No se puede enviar solicitud a este usuario',
      );
    }

    if (
      existing.status === FriendshipStatus.PENDING &&
      existing.addresseeId === requesterId
    ) {
      return this.acceptExisting(requesterId, existing);
    }

    if (
      existing.status === FriendshipStatus.PENDING &&
      existing.requesterId === requesterId
    ) {
      return this.formatConnection(existing, requesterId);
    }

    const updated = await this.prisma.friendship.update({
      where: { id: existing.id },
      data: {
        requesterId,
        addresseeId,
        status: FriendshipStatus.PENDING,
      },
      include: this.friendshipInclude(),
    });

    await this.notifyFriendRequest(updated);

    return this.formatConnection(updated, requesterId);
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.findConnectionForUser(userId, friendshipId);

    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('Solo el destinatario puede aceptar');
    }

    if (friendship.status === FriendshipStatus.ACCEPTED) {
      return this.formatConnection(friendship, userId);
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('La solicitud ya no esta pendiente');
    }

    return this.acceptExisting(userId, friendship);
  }

  async rejectRequest(userId: string, friendshipId: string) {
    const friendship = await this.findConnectionForUser(userId, friendshipId);

    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('Solo el destinatario puede rechazar');
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('La solicitud ya no esta pendiente');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendshipStatus.REJECTED },
      include: this.friendshipInclude(),
    });

    return this.formatConnection(updated, userId);
  }

  async blockUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('No puedes bloquearte a ti mismo');
    }

    await this.ensureUserExists(targetUserId);
    const pair = this.buildPair(userId, targetUserId);

    const previous = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: pair },
    });

    const connection = await this.prisma.$transaction(async (tx) => {
      if (previous?.status === FriendshipStatus.ACCEPTED) {
        await this.adjustFriendCounters(tx, previous, -1);
      }

      return tx.friendship.upsert({
        where: { userAId_userBId: pair },
        create: {
          requesterId: userId,
          addresseeId: targetUserId,
          userAId: pair.userAId,
          userBId: pair.userBId,
          status: FriendshipStatus.BLOCKED,
        },
        update: {
          requesterId: userId,
          addresseeId: targetUserId,
          status: FriendshipStatus.BLOCKED,
        },
        include: this.friendshipInclude(),
      });
    });

    return this.formatConnection(connection, userId);
  }

  async removeConnection(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('No puedes eliminarte a ti mismo');
    }

    const pair = this.buildPair(userId, targetUserId);
    const existing = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: pair },
      include: this.friendshipInclude(),
    });

    if (!existing) {
      return { removed: true };
    }

    if (existing.status === FriendshipStatus.BLOCKED) {
      if (existing.requesterId !== userId) {
        throw new ForbiddenException('No puedes modificar este bloqueo');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.friendship.delete({
        where: { id: existing.id },
      });

      if (existing.status === FriendshipStatus.ACCEPTED) {
        await this.adjustFriendCounters(tx, existing, -1);
      }
    });

    return { removed: true };
  }

  async getConnectionStatus(currentUserId: string, targetUserIds: string[]) {
    if (targetUserIds.length === 0) {
      return new Map<string, { id: string; status: FriendshipStatus }>();
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: currentUserId, userBId: { in: targetUserIds } },
          { userBId: currentUserId, userAId: { in: targetUserIds } },
        ],
      },
      select: {
        id: true,
        status: true,
        userAId: true,
        userBId: true,
      },
    });

    const statusByUser = new Map<
      string,
      { id: string; status: FriendshipStatus }
    >();

    for (const friendship of friendships) {
      const targetId =
        friendship.userAId === currentUserId
          ? friendship.userBId
          : friendship.userAId;
      statusByUser.set(targetId, {
        id: friendship.id,
        status: friendship.status,
      });
    }

    return statusByUser;
  }

  private async acceptExisting(
    userId: string,
    friendship: FriendshipWithUsers,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.friendship.update({
        where: { id: friendship.id },
        data: { status: FriendshipStatus.ACCEPTED },
        include: this.friendshipInclude(),
      });

      await this.adjustFriendCounters(tx, friendship, 1);

      return accepted;
    });

    return this.formatConnection(updated, userId);
  }

  private async findConnectionForUser(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: this.friendshipInclude(),
    });

    if (!friendship) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return friendship;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  private buildPair(userId: string, otherUserId: string) {
    const [userAId, userBId] = [userId, otherUserId].sort();
    return { userAId, userBId };
  }

  private otherUser(friendship: FriendshipWithUsers, currentUserId: string) {
    return friendship.userAId === currentUserId
      ? friendship.userB
      : friendship.userA;
  }

  private formatConnection(
    friendship: FriendshipWithUsers,
    currentUserId: string,
  ) {
    return {
      id: friendship.id,
      status: friendship.status,
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      isIncoming:
        friendship.addresseeId === currentUserId &&
        friendship.status === FriendshipStatus.PENDING,
      isOutgoing:
        friendship.requesterId === currentUserId &&
        friendship.status === FriendshipStatus.PENDING,
      user: this.otherUser(friendship, currentUserId),
    };
  }

  private friendshipInclude() {
    return {
      requester: { select: socialUserSelect },
      addressee: { select: socialUserSelect },
      userA: { select: socialUserSelect },
      userB: { select: socialUserSelect },
    };
  }

  private async notifyFriendRequest(friendship: FriendshipWithUsers) {
    await this.notificationsService.sendToUser(friendship.addresseeId, {
      title: 'Nueva solicitud de amistad',
      body: `${friendship.requester.name} quiere agregarte como amigo`,
      data: {
        type: 'friend_request',
        friendshipId: friendship.id,
        requesterId: friendship.requesterId,
      },
    });
  }

  private async adjustFriendCounters(
    tx: Prisma.TransactionClient,
    friendship: Pick<Friendship, 'userAId' | 'userBId'>,
    delta: 1 | -1,
  ) {
    await Promise.all([
      this.adjustSingleFriendCounter(tx, friendship.userAId, delta),
      this.adjustSingleFriendCounter(tx, friendship.userBId, delta),
    ]);
  }

  private async adjustSingleFriendCounter(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: 1 | -1,
  ) {
    await tx.profile.upsert({
      where: { userId },
      create: {
        userId,
        friendsCount: delta > 0 ? 1 : 0,
      },
      update: {
        friendsCount: delta > 0 ? { increment: 1 } : { decrement: 1 },
      },
    });

    if (delta < 0) {
      await tx.profile.updateMany({
        where: {
          userId,
          friendsCount: { lt: 0 },
        },
        data: {
          friendsCount: 0,
        },
      });
    }
  }
}
