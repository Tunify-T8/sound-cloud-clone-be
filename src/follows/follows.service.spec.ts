import { Test, TestingModule } from '@nestjs/testing';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchIndexService } from 'src/search-index/search-index.service';

describe('FollowsService', () => {
  let service: FollowsService;

  const mockPrisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    follow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockSearchIndexService = {
    indexUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    jest.clearAllMocks();
  });

  // ── FOLLOW USER ─────────────────────────────────────────────
  describe('followUser', () => {
    const followerId = 'f1';
    const followingId = 'u2';

    it('should throw BadRequest when following self', async () => {
      await expect(service.followUser('id', 'id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFound when target does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.followUser(followerId, followingId)).rejects.toThrow(NotFoundException);
    });

    it('should throw Forbidden when blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: followingId, isDeleted: false, isActive: true, isBanned: false, isSuspended: false });
      mockPrisma.userBlock.findFirst.mockResolvedValue({ id: 'b1' });
      await expect(service.followUser(followerId, followingId)).rejects.toThrow(ForbiddenException);
    });

    it('should follow successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: followingId, isDeleted: false, isActive: true, isBanned: false, isSuspended: false });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.follow.create.mockResolvedValue({ id: 'f1' });

      const result = await service.followUser(followerId, followingId);
      expect(result).toEqual({ message: 'Followed successfully' });
    });

    it('should throw Conflict when already following (P2002)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: followingId,
        isDeleted: false,
        isActive: true,
        isBanned: false,
        isSuspended: false,
      });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.follow.create.mockRejectedValue(p2002Error);

      await expect(service.followUser(followerId, followingId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── UNFOLLOW USER ───────────────────────────────────────────
  describe('unfollowUser', () => {
    const followerId = 'f1';
    const followingId = 'u2';

    it('should throw BadRequest when unfollowing self', async () => {
      await expect(service.unfollowUser('id', 'id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFound if not following', async () => {
      mockPrisma.follow.findFirst.mockResolvedValue(null);
      await expect(service.unfollowUser(followerId, followingId)).rejects.toThrow(NotFoundException);
    });

    it('should unfollow successfully', async () => {
      mockPrisma.follow.findFirst.mockResolvedValue({ id: 'f1' });
      mockPrisma.follow.delete.mockResolvedValue({ id: 'f1' });

      const result = await service.unfollowUser(followerId, followingId);
      expect(result).toEqual({ message: 'Unfollowed successfully' });
    });
  });

  // ── BLOCK USER ──────────────────────────────────────────────
  describe('blockUser', () => {
    const blockerId = 'b1';
    const blockedId = 'u2';

    it('should throw BadRequest when blocking self', async () => {
      await expect(service.blockUser('id', 'id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFound if target invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.blockUser(blockerId, blockedId)).rejects.toThrow(NotFoundException);
    });

    it('should throw Conflict if already blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: blockedId, isDeleted: false, isActive: true, isBanned: false, isSuspended: false });
      mockPrisma.userBlock.findFirst.mockResolvedValue({ id: 'b1' });
      await expect(service.blockUser(blockerId, blockedId)).rejects.toThrow(ConflictException);
    });

    it('should block successfully and remove follows', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: blockedId, isDeleted: false, isActive: true, isBanned: false, isSuspended: false });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.follow.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.userBlock.create.mockResolvedValue({ id: 'blk1' });

      const result = await service.blockUser(blockerId, blockedId);
      expect(result).toEqual({ message: 'User blocked successfully' });
    });
  });

  // ── UNBLOCK USER ────────────────────────────────────────────
  describe('unblockUser', () => {
    const blockerId = 'b1';
    const blockedId = 'u2';

    it('should throw NotFound if not blocked', async () => {
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      await expect(service.unblockUser(blockerId, blockedId)).rejects.toThrow(NotFoundException);
    });

    it('should unblock successfully', async () => {
      mockPrisma.userBlock.findFirst.mockResolvedValue({ id: 'blk1' });
      mockPrisma.userBlock.delete.mockResolvedValue({ id: 'blk1' });

      const result = await service.unblockUser(blockerId, blockedId);
      expect(result).toEqual({ message: 'User unblocked successfully' });
    });
  });

  // ── GET BLOCKED USERS ───────────────────────────────────────
  describe('getBlockedUsers', () => {
    it('should return paginated blocked users', async () => {
      const blockerId = 'b1';
      const page = 1;
      const limit = 2;

      mockPrisma.userBlock.findMany.mockResolvedValue([
        { id: 'blk1', createdAt: new Date(), blocked: { id: 'u2', username: 'user2', displayName: 'User Two', avatarUrl: 'avatar.png' } },
      ]);
      mockPrisma.userBlock.count.mockResolvedValue(1);

      const result = await service.getBlockedUsers(blockerId, page, limit);
      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);
      expect(result.hasMore).toBe(false);
    });
  });

  // ── GET FOLLOW STATUS ───────────────────────────────────────
  describe('getFollowStatus', () => {
    const currentUserId = 'u1';
    const targetId = 'u2';

    it('should return false for self', async () => {
      const result = await service.getFollowStatus(currentUserId, currentUserId);
      expect(result).toEqual({ isFollowing: false, isBlocked: false });
    });

    it('should throw NotFound if target invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getFollowStatus(currentUserId, targetId)).rejects.toThrow(NotFoundException);
    });

    it('should return follow and block status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: targetId, isDeleted: false, isActive: true });
      mockPrisma.follow.findFirst.mockResolvedValue({ id: 'f1' });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);

      const result = await service.getFollowStatus(currentUserId, targetId);
      expect(result).toEqual({ isFollowing: true, isBlocked: false });
    });
  });

  // ── GET TRUE FRIENDS ────────────────────────────────────────
  describe('getTrueFriends', () => {
    it('should return mutual follows paginated', async () => {
      const userId = 'u1';
      const page = 1;
      const limit = 2;

      mockPrisma.follow.findMany
        .mockResolvedValueOnce([{ followingId: 'u2' }, { followingId: 'u3' }])
        .mockResolvedValueOnce([
          { follower: { id: 'u2', username: 'user2', displayName: 'User Two', avatarUrl: '', location: 'loc', isCertified: true, _count: { followers: 10 } } },
        ]);
      mockPrisma.follow.count.mockResolvedValue(1);

      const result = await service.getTrueFriends(userId, page, limit);
      expect(result.data.length).toBe(1);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);
      expect(result.hasMore).toBe(false);
    });
  });

  // ── GET SUGGESTED USERS ─────────────────────────────────────
  describe('getSuggestedUsers', () => {
    it('should return suggested users with exclusions', async () => {
      const userId = 'u1';
      const page = 1;
      const limit = 2;

      mockPrisma.follow.findMany
        .mockResolvedValueOnce([{ followingId: 'u2' }])
        .mockResolvedValueOnce([{ followingId: 'u4' }]);
      mockPrisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'u3' }]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u5', username: 'user5', avatarUrl: '', coverUrl: '', role: 'LISTENER', isCertified: false, _count: { followers: 5 } }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getSuggestedUsers(userId, page, limit);
      expect(result.data.length).toBe(1);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);
      expect(result.hasMore).toBe(false);
    });
  });

  // ── GET SUGGESTED ARTISTS ───────────────────────────────────
  describe('getSuggestedArtists', () => {
    it('should return suggested artists', async () => {
      const userId = 'u1';
      const page = 1;
      const limit = 2;

      mockPrisma.follow.findMany
        .mockResolvedValueOnce([{ followingId: 'u2' }])
        .mockResolvedValueOnce([{ followingId: 'u4' }]);
      mockPrisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'u3' }]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'a1', username: 'artist1', avatarUrl: '', coverUrl: '', role: 'ARTIST', isCertified: true, _count: { followers: 10 } }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getSuggestedArtists(userId, page, limit);
      expect(result.data.length).toBe(1);
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);
      expect(result.hasMore).toBe(false);
    });
  });
});
