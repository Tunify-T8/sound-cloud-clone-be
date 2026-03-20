import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import {
  CollectionType,
  SocialPlatform,
  Visibility,
  UserType,
} from '@prisma/client';

// ── Mock Prisma ───────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  track: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  follow: {
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  trackLike: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  repost: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  collection: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  userSocialLink: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  playHistory: {
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Reusable mock data ────────────────────────────────────────
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  display_name: 'Test User',
  email: 'test@test.com',
  bio: 'Test bio',
  location: 'NYC',
  avatar_url: null,
  cover_url: null,
  visibility: Visibility.PUBLIC,
  role: UserType.LISTENER,
  is_verified: false,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null,
};

const mockTrack = {
  id: 'track-123',
  title: 'Test Track',
  description: null,
  audioUrl: 'https://cdn.example.com/audio.mp3',
  coverUrl: null,
  durationSeconds: 180,
  createdAt: new Date(),
  _count: { likes: 5, comments: 2, reposts: 1 },
};

const mockSocialLink = {
  id: 'link-123',
  user_id: 'user-123',
  platform: SocialPlatform.INSTAGRAM,
  url: 'https://instagram.com/test',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const mockCollection = {
  id: 'col-123',
  title: 'Test Album',
  description: null,
  coverUrl: null,
  isPublic: true,
  createdAt: new Date(),
  _count: { tracks: 3, likes: 10 },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getCurrentUser ────────────────────────────────────────
  describe('getCurrentUser', () => {
    it('should return full user dto with counts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.track.count.mockResolvedValue(5);
      mockPrisma.follow.count
        .mockResolvedValueOnce(100) // followersCount
        .mockResolvedValueOnce(50); // followingCount
      mockPrisma.trackLike.count.mockResolvedValue(200);

      const result = await service.getCurrentUser('user-123');

      expect(result.id).toBe('user-123');
      expect(result.tracksCount).toBe(5);
      expect(result.followersCount).toBe(100);
      expect(result.followingCount).toBe(50);
      expect(result.likesReceived).toBe(200);
      // sensitive fields must not be present
      expect(result).not.toHaveProperty('pass_hash');
      expect(result).not.toHaveProperty('suspended_by_id');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getUser ───────────────────────────────────────────────
  describe('getUser', () => {
    it('should return public profile with counts when user is public', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.follow.findFirst.mockResolvedValue(null);
      mockPrisma.track.count.mockResolvedValue(3);
      mockPrisma.follow.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);
      mockPrisma.trackLike.count.mockResolvedValue(20);

      const result = await service.getUser('user-123', 'viewer-456');

      expect(result).toHaveProperty('tracksCount');
      expect(result).toHaveProperty('followersCount');
    });

    it('should return limited profile when user is private and viewer is not following', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        visibility: Visibility.PRIVATE,
      });
      mockPrisma.follow.findFirst.mockResolvedValue(null);

      const result = await service.getUser('user-123', 'viewer-456');

      expect(result).not.toHaveProperty('tracksCount');
      expect(result).not.toHaveProperty('followersCount');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getSocialLinks ────────────────────────────────────────
  describe('getSocialLinks', () => {
    it('should return social links for a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        social_links: [mockSocialLink],
      });

      const result = await service.getSocialLinks('user-123');

      expect(result).toEqual([mockSocialLink]);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { social_links: true },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSocialLinks('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when user has no links', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ social_links: [] });

      const result = await service.getSocialLinks('user-123');

      expect(result).toEqual([]);
    });
  });

  // ── getTracks ─────────────────────────────────────────────
  describe('getTracks', () => {
    it('should return paginated tracks', async () => {
      mockPrisma.track.findMany.mockResolvedValue([mockTrack]);
      mockPrisma.track.count.mockResolvedValue(1);

      const result = await service.getTracks('user-123', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].likesCount).toBe(5);
      expect(result.data[0].duration).toBe(180);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(false);
    });

    it('should correctly calculate hasMore when more pages exist', async () => {
      mockPrisma.track.findMany.mockResolvedValue(Array(10).fill(mockTrack));
      mockPrisma.track.count.mockResolvedValue(25);

      const result = await service.getTracks('user-123', 1, 10);

      expect(result.hasMore).toBe(true);
    });
  });

  // ── getReposts ────────────────────────────────────────────
  describe('getReposts', () => {
    const mockRepost = {
      id: 'repost-123',
      createdAt: new Date(),
      track: mockTrack,
    };

    it('should return paginated reposts with nested track', async () => {
      mockPrisma.repost.findMany.mockResolvedValue([mockRepost]);
      mockPrisma.repost.count.mockResolvedValue(1);

      const result = await service.getReposts('user-123', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].repostId).toBe('repost-123');
      expect(result.data[0].track.id).toBe('track-123');
      expect(result.hasMore).toBe(false);
    });
  });

  // ── getCollections ────────────────────────────────────────
  describe('getCollections', () => {
    it('should return paginated albums', async () => {
      mockPrisma.collection.findMany.mockResolvedValue([mockCollection]);
      mockPrisma.collection.count.mockResolvedValue(1);

      const result = await service.getCollections(
        'user-123',
        CollectionType.ALBUM,
        1,
        10,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tracksCount).toBe(3);
      expect(result.data[0].likesCount).toBe(10);
      expect(result.hasMore).toBe(false);
    });

    it('should return paginated playlists', async () => {
      mockPrisma.collection.findMany.mockResolvedValue([mockCollection]);
      mockPrisma.collection.count.mockResolvedValue(1);

      const result = await service.getCollections(
        'user-123',
        CollectionType.PLAYLIST,
        1,
        10,
      );

      expect(result.data).toHaveLength(1);
      // verify it queried with correct type
      expect(mockPrisma.collection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ type: CollectionType.PLAYLIST }),
        }),
      );
    });
  });

  // ── getLikedTracks ────────────────────────────────────────
  describe('getLikedTracks', () => {
    const mockLike = {
      id: 'like-123',
      createdAt: new Date(),
      track: mockTrack,
    };

    it('should return paginated liked tracks with nested track', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue([mockLike]);
      mockPrisma.trackLike.count.mockResolvedValue(1);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].likedAt).toEqual(mockLike.createdAt);
      expect(result.data[0].track.id).toBe('track-123');
      expect(result.hasMore).toBe(false);
    });
  });

  // ── getFollowList ─────────────────────────────────────────
  describe('getFollowList', () => {
    const mockFollowUser = {
      id: 'user-456',
      username: 'follower',
      display_name: 'Follower User',
      avatar_url: null,
      _count: { followers: 10 },
    };

    it('should return followers with correct where clause', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockFollowUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getFollowerList('user-123', 1, 10);

      expect(result.data[0].followersCount).toBe(10);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            following: { some: { followingId: 'user-123' } },
          }),
        }),
      );
    });

    it('should return following with correct where clause', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockFollowUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.getFollowingList('user-123', 1, 10);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            followers: { some: { followerId: 'user-123' } },
          }),
        }),
      );
    });

    it('should correctly calculate hasMore', async () => {
      mockPrisma.user.findMany.mockResolvedValue(
        Array(10).fill(mockFollowUser),
      );
      mockPrisma.user.count.mockResolvedValue(25);

      const result = await service.getFollowerList('user-123', 1, 10);

      expect(result.hasMore).toBe(true);
    });
  });

  // ── updateSocialLinks ─────────────────────────────────────
  describe('updateSocialLinks', () => {
    it('should run upserts in a transaction and return updated links', async () => {
      const dto = {
        links: [
          {
            platform: SocialPlatform.INSTAGRAM,
            url: 'https://instagram.com/x',
          },
        ],
      };

      mockPrisma.$transaction.mockResolvedValue([mockSocialLink]);
      mockPrisma.userSocialLink.findMany.mockResolvedValue([
        { platform: SocialPlatform.INSTAGRAM, url: 'https://instagram.com/x' },
      ]);

      const result = await service.updateSocialLinks('user-123', dto);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].platform).toBe(SocialPlatform.INSTAGRAM);
    });
  });

  // ── updateUserProfile ─────────────────────────────────────
  describe('updateUserProfile', () => {
    it('should update and return safe user fields only', async () => {
      const dto = { display_name: 'New Name', bio: 'New bio' };
      const updatedUser = {
        ...mockUser,
        display_name: 'New Name',
        bio: 'New bio',
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('user-123', dto);

      expect(result.display_name).toBe('New Name');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { ...dto },
        select: {
          id: true,
          username: true,
          display_name: true,
          email: true,
          bio: true,
          location: true,
          avatar_url: true,
          cover_url: true,
          visibility: true,
          role: true,
          is_verified: true,
          gender: true,
          date_of_birth: true,
          created_at: true,
          updated_at: true,
        },
      });
    });
  });

  // ── deleteSocialLink ──────────────────────────────────────
  describe('deleteSocialLink', () => {
    it('should delete social link when it exists', async () => {
      mockPrisma.userSocialLink.delete.mockResolvedValue(mockSocialLink);

      const result = await service.deleteSocialLink(
        'user-123',
        SocialPlatform.INSTAGRAM,
      );

      expect(result).toEqual(mockSocialLink);
      expect(mockPrisma.userSocialLink.delete).toHaveBeenCalledWith({
        where: {
          user_id_platform: {
            user_id: 'user-123',
            platform: SocialPlatform.INSTAGRAM,
          },
        },
      });
    });

    it('should throw NotFoundException when link does not exist', async () => {
      mockPrisma.userSocialLink.delete.mockRejectedValue(new Error('P2025'));

      await expect(
        service.deleteSocialLink('user-123', SocialPlatform.INSTAGRAM),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getFavoriteGenres ─────────────────────────────────────
  describe('getFavoriteGenres', () => {
    it('should return empty array when user has no play history', async () => {
      mockPrisma.playHistory.groupBy.mockResolvedValue([]);

      const result = await service.getFavoriteGenres('user-123');

      expect(result).toEqual([]);
    });

    it('should return top 5 genres sorted by play count', async () => {
      mockPrisma.playHistory.groupBy.mockResolvedValue([
        { trackId: 'track-1', _count: { trackId: 10 } },
        { trackId: 'track-2', _count: { trackId: 5 } },
      ]);

      mockPrisma.track.findMany.mockResolvedValue([
        { genreId: 'genre-1', genre: { id: 'genre-1', label: 'Hip Hop' } },
        { genreId: 'genre-2', genre: { id: 'genre-2', label: 'Electronic' } },
      ]);

      const result = await service.getFavoriteGenres('user-123');

      expect(result.length).toBeLessThanOrEqual(5);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('label');
      // count must not be exposed to the client
      expect(result[0]).not.toHaveProperty('count');
    });
  });
});
