import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { MailerService } from '../mailer/mailer.service';
import { NotificationType, Channel } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RECIPIENT_ID = 'user-recipient';
const ACTOR_ID = 'user-actor';
const NOTIFICATION_ID = 'notif-abc';

const baseNotification = {
  id: NOTIFICATION_ID,
  recipientId: RECIPIENT_ID,
  actorId: ACTOR_ID,
  type: NotificationType.track_liked,
  referenceType: 'track',
  referenceId: 'track-123',
  isRead: false,
  readAt: null,
  createdAt: new Date(),
  actor: {
    id: ACTOR_ID,
    username: 'actor_user',
    avatarUrl: 'avatar.jpg',
  },
};

const basePreferenceRow = {
  userId: RECIPIENT_ID,
  channel: Channel.email,
  trackLiked: true,
  trackCommented: true,
  trackReposted: true,
  userFollowed: true,
  newRelease: true,
  newMessage: true,
  system: true,
  subscription: true,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  notification: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue(basePreferenceRow),
  },
  follow: {
    findUnique: jest.fn(),
  },
  deviceToken: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeGatewayMock = () => ({
  sendNotificationToUser: jest.fn(),
});

const makeMailerMock = () => ({
  sendTrackLikedEmail: jest.fn(),
  sendTrackCommentedEmail: jest.fn(),
  sendTrackRepostedEmail: jest.fn(),
  sendUserFollowedEmail: jest.fn(),
  sendNewMessageEmail: jest.fn(),
  sendNewReleaseEmail: jest.fn(),
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let gateway: ReturnType<typeof makeGatewayMock>;
  let mailer: ReturnType<typeof makeMailerMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    gateway = makeGatewayMock();
    mailer = makeMailerMock();

    prisma.notification.create.mockResolvedValue(baseNotification);
    prisma.user.findUnique.mockResolvedValue({
      email: 'recipient@example.com',
      username: 'recipient_user',
    });
    prisma.notificationPreference.findUnique.mockResolvedValue(basePreferenceRow);
    prisma.follow.findUnique.mockResolvedValue(null);

    prisma.$transaction.mockImplementation(async (queries) => {
      return Promise.all(queries);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────────────────────────────────
  // createNotification
  // ──────────────────────────────────────────────────────────────────────────

  it('creates notification and sends websocket + email', async () => {
    const result = await service.createNotification({
      recipientId: RECIPIENT_ID,
      actorId: ACTOR_ID,
      type: NotificationType.track_liked,
    });

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(gateway.sendNotificationToUser).toHaveBeenCalled();
    expect(mailer.sendTrackLikedEmail).toHaveBeenCalled();
    expect(result?.id).toBe(NOTIFICATION_ID);
  });

  it('skips self notifications', async () => {
    const result = await service.createNotification({
      recipientId: ACTOR_ID,
      actorId: ACTOR_ID,
      type: NotificationType.track_liked,
    });

    expect(result).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // buildMessage
  // ──────────────────────────────────────────────────────────────────────────

  it('builds message correctly', () => {
    expect(service.buildMessage(NotificationType.track_liked, 'alice'))
      .toBe('alice liked your track');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getNotifications
  // ──────────────────────────────────────────────────────────────────────────

  it('applies type filter correctly', async () => {
    await service.getNotifications(
      RECIPIENT_ID,
      1,
      10,
      [NotificationType.track_liked],
    );

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: [NotificationType.track_liked] },
        }),
      }),
    );
  });

  it('returns formatted notifications', async () => {
    prisma.notification.findMany.mockResolvedValue([baseNotification]);

    const result = await service.getNotifications(RECIPIENT_ID, 1, 10);

    expect(result.data[0].message).toBe('actor_user liked your track');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getUnreadCount
  // ──────────────────────────────────────────────────────────────────────────

  it('returns unread count', async () => {
    prisma.notification.count.mockResolvedValue(5);

    const result = await service.getUnreadCount(RECIPIENT_ID);

    expect(result).toEqual({ unreadCount: 5 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markAllAsRead
  // ──────────────────────────────────────────────────────────────────────────

  it('marks all as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.markAllAsRead(RECIPIENT_ID);

    expect(result.updatedCount).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markOneAsRead
  // ──────────────────────────────────────────────────────────────────────────

  it('marks one notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      ...baseNotification,
      isRead: false,
    });

    prisma.notification.update.mockResolvedValue({});

    const result = await service.markOneAsRead(
      RECIPIENT_ID,
      NOTIFICATION_ID,
    );

    expect(result).toEqual({ ok: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getPreferences
  // ──────────────────────────────────────────────────────────────────────────

  it('upserts preferences for both channels', async () => {
    await service.getPreferences(RECIPIENT_ID);

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledTimes(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updatePreferences
  // ──────────────────────────────────────────────────────────────────────────

  it('updates preferences', async () => {
    const result = await service.updatePreferences(
      RECIPIENT_ID,
      { trackLiked: false },
      undefined,
    );

    expect(result).toEqual({ ok: true });
  });

  it('rejects invalid key', async () => {
    const result = await service.updatePreferences(
      RECIPIENT_ID,
      { badKey: true } as any,
      undefined,
    );

    expect(result).toEqual({ invalidKey: 'badKey' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // device tokens
  // ──────────────────────────────────────────────────────────────────────────

  it('registers device token', async () => {
    await service.registerDeviceToken(RECIPIENT_ID, 'token', 'android');

    expect(prisma.deviceToken.upsert).toHaveBeenCalled();
  });

  it('removes device token', async () => {
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    await service.removeDeviceToken(RECIPIENT_ID, 'token');

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalled();
  });
});