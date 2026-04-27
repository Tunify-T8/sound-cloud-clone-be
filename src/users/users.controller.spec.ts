import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { CollectionType, SocialPlatform } from '@prisma/client';
import { ParseSocialPlatformPipe } from './pipes/parse-social-platform.pipe';

// ── Mock Service ──────────────────────────────────────────────
const mockUsersService = {
  getCurrentUser: jest.fn(),
  getUser: jest.fn(),
  getSocialLinks: jest.fn(),
  getTracks: jest.fn(),
  getReposts: jest.fn(),
  getCollections: jest.fn(),
  getLikedTracks: jest.fn(),
  getFollowerList: jest.fn(),
  getFollowingList: jest.fn(),
  getFavoriteGenres: jest.fn(),
  getPublicTracks: jest.fn(),
  updateSocialLinks: jest.fn(),
  updateUserProfile: jest.fn(),
  deleteSocialLink: jest.fn(),
  getMyConversations: jest.fn(),
  createConversation: jest.fn(),
  getUnreadMessagesCount: jest.fn(),
  getUploadStats: jest.fn(),
  getUploadMinutes: jest.fn(),
  getUserCollections: jest.fn(),
};

// ── Mock user extracted by @CurrentUser() decorator ──────────
const mockJwtPayload = {
  userId: 'user-123',
  email: 'test@test.com',
  role: 'USER',
};

const mockRequest = {
  user: {
    userId: 'user-123',
  },
} as any;

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      // Override guards — in unit tests we don't test auth,
      // we just make the guard always pass
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      // Override pipe — we don't test pipe logic here, just that
      // the controller passes the value through to the service
      .overridePipe(ParseSocialPlatformPipe)
      .useValue({ transform: (v: string) => v.toUpperCase() })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getCurrentUser ────────────────────────────────────────
  describe('getCurrentUser', () => {
    it('should call service with userId from jwt payload', async () => {
      mockUsersService.getCurrentUser.mockResolvedValue({ id: 'user-123' });

      await controller.getCurrentUser(mockJwtPayload);

      expect(mockUsersService.getCurrentUser).toHaveBeenCalledWith('user-123');
    });
  });

  // ── getUser ───────────────────────────────────────────────
  describe('getUser', () => {
    it('should call service with id and optional userId', async () => {
      mockUsersService.getUser.mockResolvedValue({ id: 'user-456' });

      await controller.getUser('user-456', mockJwtPayload);

      expect(mockUsersService.getUser).toHaveBeenCalledWith(
        'user-456',
        'user-123',
      );
    });

    it('should call service with undefined userId when no jwt payload', async () => {
      mockUsersService.getUser.mockResolvedValue({ id: 'user-456' });

      await controller.getUser('user-456', undefined);

      expect(mockUsersService.getUser).toHaveBeenCalledWith(
        'user-456',
        undefined,
      );
    });
  });

  // ── getSocialLinks ────────────────────────────────────────
  describe('getSocialLinks', () => {
    it('should call service with userId', async () => {
      mockUsersService.getSocialLinks.mockResolvedValue([]);

      await controller.getSocialLinks(mockJwtPayload);

      expect(mockUsersService.getSocialLinks).toHaveBeenCalledWith('user-123');
    });
  });

  // ── getTracks ─────────────────────────────────────────────
  describe('getTracks', () => {
    it('should call service with userId and pagination', async () => {
      mockUsersService.getTracks.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getTracks(mockJwtPayload, 1, 10);

      expect(mockUsersService.getTracks).toHaveBeenCalledWith(
        'user-123',
        1,
        10,
      );
    });
  });
  // ── getPublicUserTracks (controller) ───────────────────────
  describe('getPublicUserTracks', () => {
    it('should call service with correct params', async () => {
      const mockResult = {
        data: [],
        meta: { page: 1, limit: 10, total: 0, hasMore: false },
      };

      mockUsersService.getPublicTracks.mockResolvedValue(mockResult);

      const result = await controller.getPublicUserTracks(
        'target-user-1',
        mockJwtPayload as any,
        1,
        10,
      );

      expect(mockUsersService.getPublicTracks).toHaveBeenCalledWith(
        'target-user-1',
        'user-123',
        1,
        10,
      );

      expect(result).toEqual(mockResult);
    });

    it('should pass correct pagination values', async () => {
      mockUsersService.getPublicTracks.mockResolvedValue({});

      await controller.getPublicUserTracks(
        'target-user-1',
        mockJwtPayload as any,
        2,
        5,
      );

      expect(mockUsersService.getPublicTracks).toHaveBeenCalledWith(
        'target-user-1',
        'user-123',
        2,
        5,
      );
    });
  });
  // ── getReposts ────────────────────────────────────────────
  describe('getReposts', () => {
    it('should call service with userId and pagination', async () => {
      mockUsersService.getReposts.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getReposts(mockJwtPayload, 1, 10);

      expect(mockUsersService.getReposts).toHaveBeenCalledWith(
        'user-123',
        1,
        10,
      );
    });

    it('should return reposts with pagination metadata', async () => {
      const mockRepostsResponse = {
        data: [
          {
            repostId: 'repost-1',
            repostedAt: new Date(),
            track: {
              id: 'track-1',
              title: 'Test Track',
              audioUrl: 'https://example.com/audio.mp3',
              coverUrl: null,
              duration: 180,
              likesCount: 10,
              commentsCount: 2,
              repostsCount: 1,
              createdAt: new Date(),
            },
          },
        ],
        hasMore: false,
      };

      mockUsersService.getReposts.mockResolvedValue(mockRepostsResponse);

      const result = await controller.getReposts(mockJwtPayload, 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].repostId).toBe('repost-1');
      expect(result.data[0].track.title).toBe('Test Track');
      expect(result.hasMore).toBe(false);
    });
  });

  // ── getUserReposts ────────────────────────────────────────
  describe('getUserReposts', () => {
    it('should call service with userId and pagination', async () => {
      mockUsersService.getReposts.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getUserReposts('user-456', 1, 10);

      expect(mockUsersService.getReposts).toHaveBeenCalledWith(
        'user-456',
        1,
        10,
      );
    });

    it('should use default pagination when not provided', async () => {
      mockUsersService.getReposts.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getUserReposts('user-456');

      expect(mockUsersService.getReposts).toHaveBeenCalledWith(
        'user-456',
        1,
        10,
      );
    });

    it('should return another user reposts with tracks', async () => {
      const mockUserRepostsResponse = {
        data: [
          {
            repostId: 'repost-1',
            repostedAt: new Date('2026-04-15'),
            track: {
              id: 'track-1',
              title: 'Another User Track',
              audioUrl: 'https://example.com/audio.mp3',
              coverUrl: 'https://example.com/cover.png',
              duration: 240,
              likesCount: 50,
              commentsCount: 5,
              repostsCount: 3,
              createdAt: new Date('2026-04-10'),
            },
          },
        ],
        hasMore: true,
      };

      mockUsersService.getReposts.mockResolvedValue(mockUserRepostsResponse);

      const result = await controller.getUserReposts('user-456', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].track.title).toBe('Another User Track');
      expect(result.hasMore).toBe(true);
    });
  });

  // ── getAlbums ─────────────────────────────────────────────
  describe('getAlbums', () => {
    it('should call service with ALBUM collection type', async () => {
      mockUsersService.getCollections.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getAlbums(mockJwtPayload, 1, 10);

      expect(mockUsersService.getCollections).toHaveBeenCalledWith(
        'user-123',
        CollectionType.ALBUM,
        1,
        10,
      );
    });
  });

  // ── getPlaylists ──────────────────────────────────────────
  describe('getPlaylists', () => {
    it('should call service with PLAYLIST collection type', async () => {
      mockUsersService.getCollections.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getPlaylists(mockJwtPayload, 1, 10);

      expect(mockUsersService.getCollections).toHaveBeenCalledWith(
        'user-123',
        CollectionType.PLAYLIST,
        1,
        10,
      );
    });
  });

  // ── getLikedTracks ────────────────────────────────────────
  describe('getLikedTracks', () => {
    it('should call service with userId and pagination', async () => {
      mockUsersService.getLikedTracks.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getLikedTracks(mockJwtPayload, 1, 10);

      expect(mockUsersService.getLikedTracks).toHaveBeenCalledWith(
        'user-123',
        1,
        10,
      );
    });

    it('should return liked tracks with pagination metadata', async () => {
      const mockLikedTracksResponse = {
        data: [
          {
            likedAt: new Date(),
            track: {
              id: 'track-1',
              title: 'Liked Track',
              description: 'A track I like',
              audioUrl: 'https://example.com/audio.mp3',
              coverUrl: 'https://example.com/cover.png',
              duration: 180,
              likesCount: 100,
              commentsCount: 10,
              repostsCount: 5,
              createdAt: new Date(),
            },
          },
        ],
        page: 1,
        limit: 10,
        hasMore: false,
      };
      mockUsersService.getLikedTracks.mockResolvedValue(
        mockLikedTracksResponse,
      );

      const result = await controller.getLikedTracks(mockJwtPayload, 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('likedAt');
      expect(result.data[0]).toHaveProperty('track');
      expect(result.data[0].track).toHaveProperty('id');
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination with different page and limit', async () => {
      mockUsersService.getLikedTracks.mockResolvedValue({
        data: [],
        hasMore: true,
      });

      await controller.getLikedTracks(mockJwtPayload, 2, 20);

      expect(mockUsersService.getLikedTracks).toHaveBeenCalledWith(
        'user-123',
        2,
        20,
      );
    });
  });

  // ── getMyFollowers ────────────────────────────────────────
  describe('getMyFollowers', () => {
    it('should call service with userId and cast pagination to numbers', async () => {
      mockUsersService.getFollowerList.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getMyFollowers(mockJwtPayload, 2, 5);

      // +page and +limit cast strings to numbers in the controller
      expect(mockUsersService.getFollowerList).toHaveBeenCalledWith(
        'user-123',
        2,
        5,
      );
    });
  });

  // ── getMyFollowing ────────────────────────────────────────
  describe('getMyFollowing', () => {
    it('should call service with userId and cast pagination to numbers', async () => {
      mockUsersService.getFollowingList.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getMyFollowing(mockJwtPayload, 2, 5);

      expect(mockUsersService.getFollowingList).toHaveBeenCalledWith(
        'user-123',
        2,
        5,
      );
    });
  });

  // ── getFavoriteGenres ─────────────────────────────────────
  describe('getFavoriteGenres', () => {
    it('should call service with userId', async () => {
      mockUsersService.getFavoriteGenres.mockResolvedValue([]);

      await controller.getFavoriteGenres(mockJwtPayload);

      expect(mockUsersService.getFavoriteGenres).toHaveBeenCalledWith(
        'user-123',
      );
    });
  });

  // ── getFollowers (public) ─────────────────────────────────
  describe('getFollowers', () => {
    it('should call service with id and pagination', async () => {
      mockUsersService.getFollowerList.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getFollowers('user-456', 1, 10);

      expect(mockUsersService.getFollowerList).toHaveBeenCalledWith(
        'user-456',
        1,
        10,
      );
    });
  });

  // ── getFollowing (public) ─────────────────────────────────
  describe('getFollowing', () => {
    it('should call service with id and pagination', async () => {
      mockUsersService.getFollowingList.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getFollowing('user-456', 1, 10);

      expect(mockUsersService.getFollowingList).toHaveBeenCalledWith(
        'user-456',
        1,
        10,
      );
    });
  });

  // ── updateSocialLinks ─────────────────────────────────────
  describe('updateSocialLinks', () => {
    it('should call service with userId and dto', async () => {
      const dto = {
        links: [
          {
            platform: SocialPlatform.INSTAGRAM,
            url: 'https://instagram.com/x',
          },
        ],
      };
      mockUsersService.updateSocialLinks.mockResolvedValue([]);

      await controller.updateSocialLinks(dto, mockJwtPayload);

      expect(mockUsersService.updateSocialLinks).toHaveBeenCalledWith(
        'user-123',
        dto,
      );
    });
  });

  // ── updateProfile ─────────────────────────────────────────
  describe('updateProfile', () => {
    it('should call service with userId, dto, and undefined files when no files are provided', async () => {
      const dto = { displayName: 'New Name' };
      mockUsersService.updateUserProfile.mockResolvedValue({ id: 'user-123' });

      await controller.updateProfile(dto, mockJwtPayload, undefined);

      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        dto,
        undefined,
      );
    });

    it('should call service with userId, dto, and avatar file', async () => {
      const dto = { displayName: 'New Name' };

      const files = {
        avatar: [
          {
            originalname: 'avatar.png',
            mimetype: 'image/png',
            buffer: Buffer.from('fake-avatar'),
          } as Express.Multer.File,
        ],
      };

      mockUsersService.updateUserProfile.mockResolvedValue({ id: 'user-123' });

      await controller.updateProfile(dto, mockJwtPayload, files);

      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        dto,
        files,
      );
    });

    it('should call service with userId, dto, and cover file', async () => {
      const dto = { displayName: 'New Name' };

      const files = {
        cover: [
          {
            originalname: 'cover.png',
            mimetype: 'image/png',
            buffer: Buffer.from('fake-cover'),
          } as Express.Multer.File,
        ],
      };

      mockUsersService.updateUserProfile.mockResolvedValue({ id: 'user-123' });

      await controller.updateProfile(dto, mockJwtPayload, files);

      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        dto,
        files,
      );
    });

    it('should call service with userId, dto, and both avatar and cover files', async () => {
      const dto = { displayName: 'New Name' };

      const files = {
        avatar: [
          {
            originalname: 'avatar.png',
            mimetype: 'image/png',
            buffer: Buffer.from('fake-avatar'),
          } as Express.Multer.File,
        ],
        cover: [
          {
            originalname: 'cover.png',
            mimetype: 'image/png',
            buffer: Buffer.from('fake-cover'),
          } as Express.Multer.File,
        ],
      };

      mockUsersService.updateUserProfile.mockResolvedValue({ id: 'user-123' });

      await controller.updateProfile(dto, mockJwtPayload, files);

      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        dto,
        files,
      );
    });
  });

  // ── deleteSocialLink ──────────────────────────────────────
  describe('deleteSocialLink', () => {
    it('should call service with userId and platform', async () => {
      mockUsersService.deleteSocialLink.mockResolvedValue(undefined);

      await controller.deleteSocialLink(
        SocialPlatform.INSTAGRAM,
        mockJwtPayload,
      );

      expect(mockUsersService.deleteSocialLink).toHaveBeenCalledWith(
        'user-123',
        SocialPlatform.INSTAGRAM,
      );
    });
  });

  // ── getMyConversations ────────────────────────────────────
  describe('getMyConversations', () => {
    it('should call service with correct parameters', async () => {
      const mockResponse = {
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockUsersService.getMyConversations.mockResolvedValue(mockResponse);

      const result = await controller.getMyConversations(mockJwtPayload, 1, 20);

      expect(mockUsersService.getMyConversations).toHaveBeenCalledWith(
        'user-123',
        1,
        20,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should use default pagination values', async () => {
      const mockResponse = {
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockUsersService.getMyConversations.mockResolvedValue(mockResponse);

      await controller.getMyConversations(mockJwtPayload);

      expect(mockUsersService.getMyConversations).toHaveBeenCalledWith(
        'user-123',
        1,
        20,
      );
    });
  });

  // ── createConversation ────────────────────────────────────
  describe('createConversation', () => {
    it('should call service with userId and otherUserId', async () => {
      const mockResponse = { conversationId: 'conv-123' };
      mockUsersService.createConversation.mockResolvedValue(mockResponse);

      const result = await controller.createConversation(
        mockJwtPayload,
        'other-user-456',
      );

      expect(mockUsersService.createConversation).toHaveBeenCalledWith(
        'user-123',
        'other-user-456',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  // ── getUnreadMessagesCount ────────────────────────────────
  describe('getUnreadMessagesCount', () => {
    it('should call service with userId', async () => {
      const mockResponse = { unreadCount: 5 };
      mockUsersService.getUnreadMessagesCount.mockResolvedValue(mockResponse);

      const result = await controller.getUnreadMessagesCount(mockJwtPayload);

      expect(mockUsersService.getUnreadMessagesCount).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return zero unread count', async () => {
      const mockResponse = { unreadCount: 0 };
      mockUsersService.getUnreadMessagesCount.mockResolvedValue(mockResponse);

      const result = await controller.getUnreadMessagesCount(mockJwtPayload);

      expect(result.unreadCount).toBe(0);
    });
  });

  // ── getUploadStats ────────────────────────────────────────
  describe('getUploadStats', () => {
    it('should return upload stats for authenticated user', async () => {
      const mockResponse = {
        tier: 'PRO',
        uploadMinutesLimit: 200,
        uploadMinutesUsed: 50,
        uploadMinutesRemaining: 150,
        canReplaceFiles: true,
        canScheduleRelease: true,
        canAccessAdvancedTab: true,
      };
      mockUsersService.getUploadStats.mockResolvedValue(mockResponse);

      const result = await controller.getUploadStats(mockRequest);

      expect(mockUsersService.getUploadStats).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockResponse);
      expect(result.uploadMinutesRemaining).toBe(150);
    });

    it('should return free tier stats when no subscription', async () => {
      const mockResponse = {
        tier: 'FREE',
        uploadMinutesLimit: 100,
        uploadMinutesUsed: 0,
        uploadMinutesRemaining: 100,
        canReplaceFiles: false,
        canScheduleRelease: false,
        canAccessAdvancedTab: false,
      };
      mockUsersService.getUploadStats.mockResolvedValue(mockResponse);

      const result = await controller.getUploadStats(mockRequest);

      expect(result.tier).toBe('FREE');
      expect(result.canReplaceFiles).toBe(false);
    });

    it('should extract userId from request object', async () => {
      mockUsersService.getUploadStats.mockResolvedValue({});

      await controller.getUploadStats(mockRequest);

      expect(mockUsersService.getUploadStats).toHaveBeenCalledWith(
        mockRequest.user?.userId,
      );
    });
  });

  // ── getUploadMinutes ──────────────────────────────────────
  describe('getUploadMinutes', () => {
    it('should return upload minutes info', async () => {
      const mockResponse = {
        tier: 'PRO',
        uploadMinutesLimit: 200,
        uploadMinutesUsed: 75,
        uploadMinutesRemaining: 125,
      };
      mockUsersService.getUploadMinutes.mockResolvedValue(mockResponse);

      const result = await controller.getUploadMinutes('user-456');

      expect(mockUsersService.getUploadMinutes).toHaveBeenCalledWith(
        'user-456',
      );
      expect(result.uploadMinutesRemaining).toBe(125);
    });

    it('should handle NO_PLAN tier', async () => {
      const mockResponse = {
        tier: 'NO_PLAN',
        uploadMinutesLimit: 99,
        uploadMinutesUsed: 0,
        uploadMinutesRemaining: 99,
      };
      mockUsersService.getUploadMinutes.mockResolvedValue(mockResponse);

      const result = await controller.getUploadMinutes('user-456');

      expect(result.tier).toBe('NO_PLAN');
    });
  });

  // ── getLikedTracksByUser (public) ─────────────────────────────
  describe('getLikedTracksByUser', () => {
    it('should call service with id and pagination', async () => {
      mockUsersService.getLikedTracks.mockResolvedValue({
        data: [],
        hasMore: false,
      });

      await controller.getLikedTracksByUser('user-456', 1, 10);

      expect(mockUsersService.getLikedTracks).toHaveBeenCalledWith(
        'user-456',
        1,
        10,
      );
    });
  });

  // ── getUserCollections ────────────────────────────────────
  describe('getUserCollections', () => {
    it('should return user collections with pagination', async () => {
      const mockResponse = {
        data: [
          {
            id: 'coll-123',
            title: 'My Playlist',
            tracksCount: 10,
            likesCount: 5,
          },
        ],
        page: 1,
        limit: 10,
        total: 1,
        hasMore: false,
      };
      mockUsersService.getUserCollections.mockResolvedValue(mockResponse);

      const result = await controller.getUserCollections(
        'testuser',
        1,
        10,
        mockRequest,
      );

      expect(mockUsersService.getUserCollections).toHaveBeenCalledWith(
        'testuser',
        'user-123',
        1,
        10,
      );
      expect(result.data).toHaveLength(1);
    });

    it('should pass undefined requesterId when not authenticated', async () => {
      const mockResponse = {
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        hasMore: false,
      };
      mockUsersService.getUserCollections.mockResolvedValue(mockResponse);

      const unauthenticatedRequest = { user: undefined };
      await controller.getUserCollections(
        'testuser',
        1,
        10,
        unauthenticatedRequest as any,
      );

      expect(mockUsersService.getUserCollections).toHaveBeenCalledWith(
        'testuser',
        undefined,
        1,
        10,
      );
    });

    it('should use default pagination values', async () => {
      mockUsersService.getUserCollections.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        hasMore: false,
      });

      await controller.getUserCollections('testuser', 1, 10, undefined);

      expect(mockUsersService.getUserCollections).toHaveBeenCalledWith(
        'testuser',
        undefined,
        1,
        10,
      );
    });

    it('should return empty collections when user has none', async () => {
      mockUsersService.getUserCollections.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        hasMore: false,
      });

      const result = await controller.getUserCollections(
        'testuser',
        1,
        10,
        undefined,
      );

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ── getUserAlbums ────────────────────────────────────────
  describe('getUserAlbums', () => {
    it('should call getUserCollections with ALBUM type', async () => {
      const mockResponse = {
        data: [{ id: 'album-123', title: 'My Album', tracksCount: 5 }],
        page: 1,
        limit: 10,
        total: 1,
        hasMore: false,
      };
      mockUsersService.getUserCollections.mockResolvedValue(mockResponse);

      await controller.getUserAlbums('testuser', 1, 10, mockRequest);

      expect(mockUsersService.getUserCollections).toHaveBeenCalledWith(
        'testuser',
        'user-123',
        1,
        10,
        'ALBUM',
      );
    });

    it('should pass CollectionType.ALBUM to service', async () => {
      mockUsersService.getUserCollections.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        hasMore: false,
      });

      await controller.getUserAlbums('testuser', 2, 20, mockRequest);

      const call = mockUsersService.getUserCollections.mock.calls[0];
      expect(call[4]).toBe('ALBUM');
    });
  });

  // ── getUserPlaylists ──────────────────────────────────────
  describe('getUserPlaylists', () => {
    it('should call getUserCollections with PLAYLIST type', async () => {
      const mockResponse = {
        data: [{ id: 'pl-123', title: 'My Playlist', tracksCount: 15 }],
        page: 1,
        limit: 10,
        total: 1,
        hasMore: false,
      };
      mockUsersService.getUserCollections.mockResolvedValue(mockResponse);

      await controller.getUserPlaylists('testuser', 1, 10, mockRequest);

      expect(mockUsersService.getUserCollections).toHaveBeenCalledWith(
        'testuser',
        'user-123',
        1,
        10,
        'PLAYLIST',
      );
    });

    it('should pass CollectionType.PLAYLIST to service', async () => {
      mockUsersService.getUserCollections.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        hasMore: false,
      });

      await controller.getUserPlaylists('testuser', 3, 15, mockRequest);

      const call = mockUsersService.getUserCollections.mock.calls[0];
      expect(call[4]).toBe('PLAYLIST');
    });
  });
});
