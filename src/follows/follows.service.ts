import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma ,NotificationType, ReferenceType} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
    });
    if (!target || target.isDeleted || !target.isActive) {
      throw new NotFoundException('User not found');
    }
    if (target.isBanned || target.isSuspended) {
      throw new NotFoundException('User not found');
    }

    // Check blocking (both directions)
    const isBlocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: followingId, blockedId: followerId }, // they blocked me
          { blockerId: followerId, blockedId: followingId }, // I blocked them
        ],
      },
    });
    if (isBlocked) {
      throw new ForbiddenException('Cannot follow due to blocking');
    }

    try {
      await this.prisma.follow.create({
        data: { followerId, followingId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Unique constraint violation → already following
        throw new ConflictException('You are already following this user');
      }
      throw error; // rethrow other unexpected errors
    }

    // ── Notify the target user ──
    await this.notifications?.createNotification({
      recipientId: followingId, // the person being followed
      actorId: followerId, // the person who followed
      type: NotificationType.user_followed,
      referenceType: ReferenceType.user,
      referenceId: followerId, // "actor followed you" — reference points to actor
    });

    return { message: 'Followed successfully' };
  }

  // ── Unfollow a user ───────────────────────────────────────────
  async unfollowUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }

    const existing = await this.prisma.follow.findFirst({
      where: { followerId, followingId },
    });
    if (!existing) {
      throw new NotFoundException('You are not following this user');
    }

    await this.prisma.follow.delete({
      where: { id: existing.id },
    });

    return { message: 'Unfollowed successfully' };
  }

  // ── Block a user ──────────────────────────────────────────────
  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
    });
    if (!target || target.isDeleted || !target.isActive) {
      throw new NotFoundException('User not found');
    }
    if (target.isBanned || target.isSuspended) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.userBlock.findFirst({
      where: { blockerId, blockedId },
    });
    if (existing) {
      throw new ConflictException('You have already blocked this user');
    }

    // remove any follow relationship in both directions on block
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });

    await this.prisma.userBlock.create({
      data: { blockerId, blockedId },
    });

    return { message: 'User blocked successfully' };
  }

  // ── Unblock a user ────────────────────────────────────────────
  async unblockUser(blockerId: string, blockedId: string) {
    const existing = await this.prisma.userBlock.findFirst({
      where: { blockerId, blockedId },
    });
    if (!existing) {
      throw new NotFoundException('You have not blocked this user');
    }

    await this.prisma.userBlock.delete({
      where: { id: existing.id },
    });

    return { message: 'User unblocked successfully' };
  }

  // ── Get my blocked users list ─────────────────────────────────
  async getBlockedUsers(blockerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [blocks, total] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          blocked: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.userBlock.count({ where: { blockerId } }),
    ]);

    return {
      data: blocks.map((b) => ({
        blockId: b.id,
        blockedAt: b.createdAt,
        user: {
          id: b.blocked.id,
          username: b.blocked.username,
          displayName: b.blocked.displayName,
          avatarUrl: b.blocked.avatarUrl,
        },
      })),
      total,
      page,
      limit,
      hasMore: skip + blocks.length < total,
    };
  }

  // ── Get follow status ─────────────────────────────────────────
  async getFollowStatus(currentUserId: string, targetId: string) {
    if (currentUserId === targetId) {
      return { isFollowing: false, isBlocked: false };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target || target.isDeleted || !target.isActive) {
      throw new NotFoundException('User not found');
    }

    const [follow, block] = await Promise.all([
      this.prisma.follow.findFirst({
        where: { followerId: currentUserId, followingId: targetId },
      }),
      this.prisma.userBlock.findFirst({
        where: { blockerId: currentUserId, blockedId: targetId },
      }),
    ]);

    return {
      isFollowing: !!follow,
      isBlocked: !!block,
    };
  }

  // ── Get true friends (mutual follows) ────────────────────────
  async getTrueFriends(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // people I follow
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { data: [], page, limit, total: 0, hasMore: false };
    }

    // from those, find who also follows me back
    const [mutuals, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          followerId: { in: followingIds },
          followingId: userId,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              location: true,
              isCertified: true,
              _count: { select: { followers: true } },
            },
          },
        },
      }),
      this.prisma.follow.count({
        where: {
          followerId: { in: followingIds },
          followingId: userId,
        },
      }),
    ]);

    return {
      data: mutuals.map((m) => ({
        id: m.follower.id,
        username: m.follower.username,
        displayName: m.follower.displayName,
        avatarUrl: m.follower.avatarUrl,
        location: m.follower.location,
        followersCount: m.follower._count.followers,
        isCertified: m.follower.isCertified,
        isFollowing: true,
        isBlocked: false,
      })),
      page,
      limit,
      total,
      hasMore: skip + mutuals.length < total,
    };
  }

  // ── Get suggested users (all) ─────────────────────────────────
  async getSuggestedUsers(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // get IDs of people I follow
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);

    // get IDs of people who blocked me or I blocked
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );

    // excluded IDs = myself + people I follow + blocked
    const excludedIds = [...new Set([userId, ...followingIds, ...blockedIds])];

    // friends of friends — users followed by people I follow
    const friendsOfFriends = await this.prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: { notIn: excludedIds },
      },
      select: { followingId: true },
    });

    const suggestedIds = [
      ...new Set(friendsOfFriends.map((f) => f.followingId)),
    ];

    // if not enough suggestions, fill with popular users
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { notIn: excludedIds },
          isDeleted: false,
          isActive: true,
          isBanned: false,
          isSuspended: false,
          ...(suggestedIds.length > 0
            ? { id: { in: suggestedIds, notIn: excludedIds } }
            : {}),
        },
        skip,
        take: limit,
        orderBy: { followers: { _count: 'desc' } },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          coverUrl: true,
          role: true,
          isCertified: true,
          _count: { select: { followers: true } },
        },
      }),
      this.prisma.user.count({
        where: {
          id: { notIn: excludedIds },
          isDeleted: false,
          isActive: true,
          isBanned: false,
          isSuspended: false,
          ...(suggestedIds.length > 0
            ? { id: { in: suggestedIds, notIn: excludedIds } }
            : {}),
        },
      }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        coverUrl: u.coverUrl,
        role: u.role,
        isCertified: u.isCertified,
        followersCount: u._count.followers,
        isFollowing: false,
      })),
      page,
      limit,
      total,
      hasMore: skip + users.length < total,
    };
  }

  // ── Get suggested artists only ────────────────────────────────
  async getSuggestedArtists(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);

    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );

    const excludedIds = [...new Set([userId, ...followingIds, ...blockedIds])];

    const friendsOfFriends = await this.prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: { notIn: excludedIds },
      },
      select: { followingId: true },
    });

    const suggestedIds = [
      ...new Set(friendsOfFriends.map((f) => f.followingId)),
    ];

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { notIn: excludedIds },
          isDeleted: false,
          isActive: true,
          isBanned: false,
          isSuspended: false,
          role: 'ARTIST',
          ...(suggestedIds.length > 0
            ? { id: { in: suggestedIds, notIn: excludedIds } }
            : {}),
        },
        skip,
        take: limit,
        orderBy: { followers: { _count: 'desc' } },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          coverUrl: true,
          role: true,
          isCertified: true,
          _count: { select: { followers: true } },
        },
      }),
      this.prisma.user.count({
        where: {
          id: { notIn: excludedIds },
          isDeleted: false,
          isActive: true,
          isBanned: false,
          isSuspended: false,
          role: 'ARTIST',
          ...(suggestedIds.length > 0
            ? { id: { in: suggestedIds, notIn: excludedIds } }
            : {}),
        },
      }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        coverUrl: u.coverUrl,
        role: u.role,
        isCertified: u.isCertified,
        followersCount: u._count.followers,
        isFollowing: false,
      })),
      page,
      limit,
      total,
      hasMore: skip + users.length < total,
    };
  }
}
