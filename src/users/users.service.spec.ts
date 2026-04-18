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
import { StorageService } from 'src/storage/storage.service';
import { SearchIndexService } from 'src/search-index/search-index.service';

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
  displayName: 'Test User',
  email: 'test@test.com',
  bio: 'Test bio',
  location: 'NYC',
  avatarUrl: null,
  coverUrl: null,
  visibility: Visibility.PUBLIC,
  role: UserType.LISTENER,
  isCertified: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
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
  userId: 'user-123',
  platform: SocialPlatform.INSTAGRAM,
  url: 'https://instagram.com/test',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
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

// ── Mock Storage ─────────────────────────────────────────────
const mockStorage = {
  uploadImage: jest.fn(),
  deleteFile: jest.fn(),
};

const mockSearchIndexService = {
  indexUser: jest.fn(),
  indexTrack: jest.fn(),
  indexCollection: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

beforeEach(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: StorageService, useValue: mockStorage },
      { provide: SearchIndexService, useValue: mockSearchIndexService }, // ✅ ADD THIS
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
      expect(result).not.toHaveProperty('passHash');
      expect(result).not.toHaveProperty('suspendedById');
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
        socialLinks: [mockSocialLink],
      });

      const result = await service.getSocialLinks('user-123');

      expect(result).toEqual([mockSocialLink]);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { socialLinks: true },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSocialLinks('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when user has no links', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ socialLinks: [] });

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
// ── getPublicTracks ────────────────────────────────────────
describe('getPublicTracks', () => {
  const baseTrack = {
    id: 'track-1',
    title: 'Test Track',
    coverUrl: null,
    durationSeconds: 180,
    createdAt: new Date(),
    transcodingStatus: 'COMPLETED',
    isPublic: true,
    releaseDate: null,
    waveformUrl: null,
    genre: { label: 'Hip Hop' },
    user: {
      id: 'user-123',
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: null,
      isCertified: false,
    },
    trackArtists: [],
    _count: {
      likes: 5,
      reposts: 2,
      comments: 3,
      playHistory: 10,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return public tracks when viewer is not owner', async () => {
    mockPrisma.track.findMany.mockResolvedValue([baseTrack]);
    mockPrisma.track.count.mockResolvedValue(1);

    mockPrisma.trackLike.findMany.mockResolvedValue([]);
    mockPrisma.repost.findMany.mockResolvedValue([]);

    const result = await service.getPublicTracks(
      'target-user',
      'viewer-user',
      1,
      10,
    );

    expect(mockPrisma.track.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'target-user',
          isDeleted: false,
          isPublic: true, // ✅ important check
        }),
      }),
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].privacy).toBe('public');
  });

  it('should include private tracks when viewer is owner', async () => {
    const privateTrack = { ...baseTrack, isPublic: false };

    mockPrisma.track.findMany.mockResolvedValue([privateTrack]);
    mockPrisma.track.count.mockResolvedValue(1);

    mockPrisma.trackLike.findMany.mockResolvedValue([]);
    mockPrisma.repost.findMany.mockResolvedValue([]);

    const result = await service.getPublicTracks(
      'user-123',
      'user-123',
      1,
      10,
    );

    expect(mockPrisma.track.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false, // no isPublic filter
        }),
      }),
    );

    expect(result.data[0].privacy).toBe('private');
  });

  it('should correctly set interaction flags', async () => {
    mockPrisma.track.findMany.mockResolvedValue([baseTrack]);
    mockPrisma.track.count.mockResolvedValue(1);

    mockPrisma.trackLike.findMany.mockResolvedValue([
      { trackId: 'track-1' },
    ]);

    mockPrisma.repost.findMany.mockResolvedValue([
      { trackId: 'track-1' },
    ]);

    const result = await service.getPublicTracks(
      'target-user',
      'viewer-user',
      1,
      10,
    );

    expect(result.data[0].interaction.isLiked).toBe(true);
    expect(result.data[0].interaction.isReposted).toBe(true);
  });

  it('should return empty list when no tracks', async () => {
    mockPrisma.track.findMany.mockResolvedValue([]);
    mockPrisma.track.count.mockResolvedValue(0);

    mockPrisma.trackLike.findMany.mockResolvedValue([]);
    mockPrisma.repost.findMany.mockResolvedValue([]);

    const result = await service.getPublicTracks(
      'target-user',
      'viewer-user',
      1,
      10,
    );

    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
  });

  it('should correctly calculate hasMore', async () => {
    mockPrisma.track.findMany.mockResolvedValue(Array(10).fill(baseTrack));
    mockPrisma.track.count.mockResolvedValue(25);

    mockPrisma.trackLike.findMany.mockResolvedValue([]);
    mockPrisma.repost.findMany.mockResolvedValue([]);

    const result = await service.getPublicTracks(
      'target-user',
      'viewer-user',
      1,
      10,
    );

    expect(result.meta.hasMore).toBe(true);
  });
});
  // ── getReposts ────────────────────────────────────────────
  describe('getReposts', () => {
    const mockRepost = {
      id: 'repost-123',
      createdAt: new Date('2026-04-15'),
      track: mockTrack,
    };

    it('should return paginated reposts with nested track', async () => {
      mockPrisma.repost.findMany.mockResolvedValue([mockRepost]);
      mockPrisma.repost.count.mockResolvedValue(1);

      const result = await service.getReposts('user-123', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].repostId).toBe('repost-123');
      expect(result.data[0].track.id).toBe('track-123');
      expect(result.data[0].track.title).toBe('Test Track');
      expect(result.hasMore).toBe(false);
    });

    it('should return multiple reposts with correct pagination', async () => {
      const mockReposts = [mockRepost, mockRepost, mockRepost];
      mockPrisma.repost.findMany.mockResolvedValue(mockReposts);
      mockPrisma.repost.count.mockResolvedValue(3);

      const result = await service.getReposts('user-123', 1, 10);

      expect(result.data).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should correctly calculate hasMore when more pages exist', async () => {
      mockPrisma.repost.findMany.mockResolvedValue(Array(10).fill(mockRepost));
      mockPrisma.repost.count.mockResolvedValue(25);

      const result = await service.getReposts('user-123', 1, 10);

      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(10);
    });

    it('should apply correct skip and take values for page 2', async () => {
      mockPrisma.repost.findMany.mockResolvedValue([mockRepost]);
      mockPrisma.repost.count.mockResolvedValue(15);

      await service.getReposts('user-123', 2, 10);

      expect(mockPrisma.repost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (2-1) * 10
          take: 10,
        }),
      );
    });

    it('should return empty array when user has no reposts', async () => {
      mockPrisma.repost.findMany.mockResolvedValue([]);
      mockPrisma.repost.count.mockResolvedValue(0);

      const result = await service.getReposts('user-123', 1, 10);

      expect(result.data).toEqual([]);
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
          where: expect.objectContaining({ type: CollectionType.PLAYLIST }),
        }),
      );
    });
  });

  // ── getLikedTracks ────────────────────────────────────────
  describe('getLikedTracks', () => {
    const mockLike = {
      id: 'like-123',
      createdAt: new Date('2026-04-14'),
      track: mockTrack,
    };

    it('should return paginated liked tracks with nested track', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue([mockLike]);
      mockPrisma.trackLike.count.mockResolvedValue(1);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].likedAt).toEqual(mockLike.createdAt);
      expect(result.data[0].track.id).toBe('track-123');
      expect(result.data[0].track.title).toBe('Test Track');
      expect(result.hasMore).toBe(false);
    });

    it('should return multiple liked tracks', async () => {
      const mockLikes = Array(5).fill(mockLike);
      mockPrisma.trackLike.findMany.mockResolvedValue(mockLikes);
      mockPrisma.trackLike.count.mockResolvedValue(5);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.data).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('should correctly calculate hasMore when more pages exist', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue(Array(10).fill(mockLike));
      mockPrisma.trackLike.count.mockResolvedValue(25);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(10);
    });

    it('should apply correct skip and take values for different pages', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue([mockLike]);
      mockPrisma.trackLike.count.mockResolvedValue(50);

      await service.getLikedTracks('user-123', 3, 20);

      expect(mockPrisma.trackLike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40, // (3-1) * 20
          take: 20,
        }),
      );
    });

    it('should return empty array when user has no liked tracks', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue([]);
      mockPrisma.trackLike.count.mockResolvedValue(0);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should include track metadata like engagement counts', async () => {
      mockPrisma.trackLike.findMany.mockResolvedValue([mockLike]);
      mockPrisma.trackLike.count.mockResolvedValue(1);

      const result = await service.getLikedTracks('user-123', 1, 10);

      expect(result.data[0].track).toHaveProperty('likesCount');
      expect(result.data[0].track).toHaveProperty('commentsCount');
      expect(result.data[0].track).toHaveProperty('repostsCount');
    });
  });

  // ── getFollowList ─────────────────────────────────────────
  describe('getFollowList', () => {
    const mockFollowUser = {
      id: 'user-456',
      username: 'follower',
      displayName: 'Follower User',
      avatarUrl: null,
      _count: { followers: 10 },
    };

    it('should return followers with correct where clause', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockFollowUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getFollowerList('user-123', 1, 10);

      expect(result?.followers?.[0]?.followersCount).toBe(10);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            following: { some: { followingId: 'user-123' } },
            isDeleted: false,
            isActive: true,
          },
        }),
      );
    });

    it('should return following with correct where clause', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockFollowUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.getFollowingList('user-123', 1, 10);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followers: { some: { followerId: 'user-123' } },
            isDeleted: false,
            isActive: true,
          },
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
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        avatarUrl:
          'https://test.supabase.co/storage/v1/object/public/artwork/old-avatar.png',
        coverUrl:
          'https://test.supabase.co/storage/v1/object/public/artwork/old-cover.png',
      });

      mockStorage.uploadImage.mockResolvedValue(null);
      mockStorage.deleteFile.mockResolvedValue(undefined);
    });

    it('should update and return safe user fields only when no files are provided', async () => {
      const dto = { displayName: 'New Name', bio: 'New bio' };
      const updatedUser = {
        ...mockUser,
        displayName: 'New Name',
        bio: 'New bio',
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('user-123', dto);

      expect(result.displayName).toBe('New Name');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          avatarUrl: true,
          coverUrl: true,
        },
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { ...dto },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          bio: true,
          location: true,
          avatarUrl: true,
          coverUrl: true,
          visibility: true,
          role: true,
          isCertified: true,
          gender: true,
          dateOfBirth: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      expect(mockStorage.uploadImage).not.toHaveBeenCalled();
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('should upload avatar and update avatarUrl', async () => {
      const dto = { displayName: 'New Name' };

      const mockAvatarFile = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-avatar'),
      } as Express.Multer.File;

      const uploadedAvatarUrl =
        'https://test.supabase.co/storage/v1/object/public/artwork/new-avatar.png';

      mockStorage.uploadImage.mockResolvedValue(uploadedAvatarUrl);

      const updatedUser = {
        ...mockUser,
        displayName: 'New Name',
        avatarUrl: uploadedAvatarUrl,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('user-123', dto, {
        avatar: [mockAvatarFile],
      });

      expect(result.avatarUrl).toBe(uploadedAvatarUrl);

      expect(mockStorage.uploadImage).toHaveBeenCalledWith(mockAvatarFile);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          ...dto,
          avatarUrl: uploadedAvatarUrl,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          bio: true,
          location: true,
          avatarUrl: true,
          coverUrl: true,
          visibility: true,
          role: true,
          isCertified: true,
          gender: true,
          dateOfBirth: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        'artwork',
        'old-avatar.png',
      );
    });

    it('should upload cover and update coverUrl', async () => {
      const dto = { displayName: 'New Name' };

      const mockCoverFile = {
        originalname: 'cover.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-cover'),
      } as Express.Multer.File;

      const uploadedCoverUrl =
        'https://test.supabase.co/storage/v1/object/public/artwork/new-cover.png';

      mockStorage.uploadImage.mockResolvedValue(uploadedCoverUrl);

      const updatedUser = {
        ...mockUser,
        displayName: 'New Name',
        coverUrl: uploadedCoverUrl,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('user-123', dto, {
        cover: [mockCoverFile],
      });

      expect(result.coverUrl).toBe(uploadedCoverUrl);

      expect(mockStorage.uploadImage).toHaveBeenCalledWith(mockCoverFile);

      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        'artwork',
        'old-cover.png',
      );
    });

    it('should upload both avatar and cover', async () => {
      const dto = { displayName: 'New Name' };

      const mockAvatarFile = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-avatar'),
      } as Express.Multer.File;

      const mockCoverFile = {
        originalname: 'cover.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-cover'),
      } as Express.Multer.File;

      mockStorage.uploadImage
        .mockResolvedValueOnce(
          'https://test.supabase.co/storage/v1/object/public/artwork/new-avatar.png',
        )
        .mockResolvedValueOnce(
          'https://test.supabase.co/storage/v1/object/public/artwork/new-cover.png',
        );

      const updatedUser = {
        ...mockUser,
        displayName: 'New Name',
        avatarUrl:
          'https://test.supabase.co/storage/v1/object/public/artwork/new-avatar.png',
        coverUrl:
          'https://test.supabase.co/storage/v1/object/public/artwork/new-cover.png',
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserProfile('user-123', dto, {
        avatar: [mockAvatarFile],
        cover: [mockCoverFile],
      });

      expect(result.avatarUrl).toContain('new-avatar.png');
      expect(result.coverUrl).toContain('new-cover.png');

      expect(mockStorage.uploadImage).toHaveBeenCalledTimes(2);
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        'artwork',
        'old-avatar.png',
      );
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        'artwork',
        'old-cover.png',
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      const dto = { displayName: 'New Name' };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUserProfile('user-123', dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should not delete old avatar if avatar upload fails', async () => {
      const dto = { displayName: 'New Name' };

      const mockAvatarFile = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-avatar'),
      } as Express.Multer.File;

      mockStorage.uploadImage.mockResolvedValue(null);

      const updatedUser = {
        ...mockUser,
        displayName: 'New Name',
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await service.updateUserProfile('user-123', dto, {
        avatar: [mockAvatarFile],
      });

      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
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
          userId_platform: {
            userId: 'user-123',
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
