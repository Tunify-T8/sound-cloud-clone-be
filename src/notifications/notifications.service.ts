import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, ReferenceType, Channel } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly mailer: MailerService,
  ) {}

  // ─── Internal: called by other services (likes, follows, etc.) ───────────────

  async createNotification(data: {
    recipientId: string;
    actorId?: string;
    type: NotificationType;
    referenceType?: ReferenceType;
    referenceId?: string;
  }) {
    // Don't notify users about their own actions
    if (data.actorId && data.actorId === data.recipientId) return null;

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: data.recipientId,
        actorId: data.actorId ?? null,
        type: data.type,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
      },
      include: {
        actor: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });

    // Push to recipient if they're connected via WebSocket
    const formatted = await this.formatNotification(notification);

    //Socke.IO and FCM
    this.gateway.sendNotificationToUser(data.recipientId, formatted);

    // Email — only if recipient has email preference enabled for this type
    await this.sendEmailIfEnabled(data.recipientId, notification);

    return notification;
  }

  private async sendEmailIfEnabled(
    recipientId: string,
    notification: any,
  ): Promise<void> {
    // Get recipient email + username
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, username: true },
    });

    if (!recipient?.email) return;

    // Check email preference for this notification type
    const preferenceKey = this.getPreferenceKey(notification.type);
    if (!preferenceKey) return;

    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId: recipientId, channel: 'email' } },
    });

    // If no preference row yet, default is true (send email)
    const isEnabled = preference ? preference[preferenceKey] : true;
    if (!isEnabled) return;

    const actorUsername = notification.actor?.username;

    switch (notification.type as NotificationType) {
      case 'track_liked':
        await this.mailer.sendTrackLikedEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      case 'track_commented':
        await this.mailer.sendTrackCommentedEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      case 'track_reposted':
        await this.mailer.sendTrackRepostedEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      case 'user_followed':
        await this.mailer.sendUserFollowedEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      case 'new_message':
        await this.mailer.sendNewMessageEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      case 'new_release':
        await this.mailer.sendNewReleaseEmail(
          recipient.email,
          recipient.username,
          actorUsername,
        );
        break;
      // system and subscription have no actor — skip email
      default:
        break;
    }
  }

  private getPreferenceKey(type: NotificationType): string | null {
    const map: Partial<Record<NotificationType, string>> = {
      track_liked: 'trackLiked',
      track_commented: 'trackCommented',
      track_reposted: 'trackReposted',
      user_followed: 'userFollowed',
      new_message: 'newMessage',
      new_release: 'newRelease',
    };
    return map[type] ?? null;
  }

  // ─── Message builder ──────────────────────────────────────────────────────────

  buildMessage(type: NotificationType, actorUsername?: string): string {
    const actor = actorUsername ?? 'Someone';
    switch (type) {
      case 'track_liked':
        return `${actor} liked your track`;
      case 'track_commented':
        return `${actor} commented on your track`;
      case 'track_reposted':
        return `${actor} reposted your track`;
      case 'user_followed':
        return `${actor} followed you`;
      case 'new_message':
        return `${actor} sent you a message`;
      case 'new_release':
        return `${actor} released a new track`;
      case 'system':
        return `System notification`;
      case 'subscription':
        return `Your subscription has been updated`;
      default:
        return `You have a new notification`;
    }
  }

  // ─── Format a notification row into the API response shape ───────────────────

  private async formatNotification(n: any) {
    let isFollowed: boolean | null = null;

    if (n.type === 'user_followed' && n.actor?.id && n.recipientId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: n.recipientId, // does the recipient follow the actor back?
            followingId: n.actor.id,
          },
        },
      });
      isFollowed = !!follow;
    }

    return {
      id: n.id,
      type: n.type,
      actor: n.actor
        ? {
            id: n.actor.id,
            username: n.actor.username,
            avatarUrl: n.actor.avatarUrl ?? null,
          }
        : null,
      referenceType: n.referenceType ?? null,
      referenceId: n.referenceId ?? null,
      message: this.buildMessage(n.type, n.actor?.username),
      isRead: n.isRead,
      readAt: n.readAt ?? null,
      createdAt: n.createdAt,
      isFollowed,
    };
  }

  // ─── GET /notifications ───────────────────────────────────────────────────────

  async getNotifications(
    userId: string,
    page: number,
    limit: number,
    types?: NotificationType[],
    unreadOnly?: boolean,
  ) {
    const where: any = { recipientId: userId };
    if (types?.length) where.type = { in: types };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      this.prisma.notification.count({ where }),
      // unreadCount is always total unread, ignoring active filters
      this.prisma.notification.count({
        where: { recipientId: userId, isRead: false },
      }),
    ]);

    return {
      data: await Promise.all(notifications.map((n) => this.formatNotification(n))),
      meta: { page, limit, total, unreadCount },
    };
  }

  // ─── GET /notifications/unread-count ─────────────────────────────────────────

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { unreadCount };
  }

  // ─── PATCH /notifications/read-all ───────────────────────────────────────────

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }

  // ─── PATCH /notifications/:id ─────────────────────────────────────────────────

  async markOneAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return { notFound: true };
    }
    if (notification.recipientId !== userId) {
      return { forbidden: true };
    }
    if (notification.isRead) {
      // Already read — just return success, no need to update
      return { ok: true };
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    return { ok: true };
  }

  // ─── GET /notifications/preferences ──────────────────────────────────────────

  async getPreferences(userId: string) {
    // Upsert both channels with defaults if they don't exist yet
    const [push, email] = await this.prisma.$transaction([
      this.prisma.notificationPreference.upsert({
        where: { userId_channel: { userId, channel: Channel.push } },
        create: { userId, channel: Channel.push },
        update: {},
      }),
      this.prisma.notificationPreference.upsert({
        where: { userId_channel: { userId, channel: Channel.email } },
        create: { userId, channel: Channel.email },
        update: {},
      }),
    ]);

    return {
      push: this.formatPreferenceChannel(push),
      email: this.formatPreferenceChannel(email),
    };
  }

  private formatPreferenceChannel(row: any) {
    return {
      trackLiked: row.trackLiked,
      trackCommented: row.trackCommented,
      trackReposted: row.trackReposted,
      userFollowed: row.userFollowed,
      newRelease: row.newRelease,
      newMessage: row.newMessage,
      system: row.system,
      subscription: row.subscription,
    };
  }

  // ─── PATCH /notifications/preferences ────────────────────────────────────────

  async updatePreferences(
    userId: string,
    push?: Partial<Record<string, boolean>>,
    email?: Partial<Record<string, boolean>>,
  ) {
    const validKeys = [
      'trackLiked',
      'trackCommented',
      'trackReposted',
      'userFollowed',
      'newRelease',
      'newMessage',
      'system',
      'subscription',
    ];

    const updates: Promise<any>[] = [];

    if (push && Object.keys(push).length) {
      const invalidKey = Object.keys(push).find((k) => !validKeys.includes(k));
      if (invalidKey) return { invalidKey };
      updates.push(
        this.prisma.notificationPreference.upsert({
          where: { userId_channel: { userId, channel: Channel.push } },
          create: { userId, channel: Channel.push, ...push },
          update: push,
        }),
      );
    }

    if (email && Object.keys(email).length) {
      const invalidKey = Object.keys(email).find((k) => !validKeys.includes(k));
      if (invalidKey) return { invalidKey };
      updates.push(
        this.prisma.notificationPreference.upsert({
          where: { userId_channel: { userId, channel: Channel.email } },
          create: { userId, channel: Channel.email, ...email },
          update: email,
        }),
      );
    }

    await Promise.all(updates);
    return { ok: true };
  }

  // ─── Device token management ──────────────────────────────────────────────────

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId }, // reassigns token if it belonged to another account
      create: { token, userId, platform },
    });
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
  }
}
