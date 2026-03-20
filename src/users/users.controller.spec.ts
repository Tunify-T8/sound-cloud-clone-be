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
  updateSocialLinks: jest.fn(),
  updateUserProfile: jest.fn(),
  deleteSocialLink: jest.fn(),
};

// ── Mock user extracted by @CurrentUser() decorator ──────────
const mockJwtPayload = {
  userId: 'user-123',
  email: 'test@test.com',
  role: 'USER',
};

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
    it('should call service with userId and dto', async () => {
      const dto = { display_name: 'New Name' };
      mockUsersService.updateUserProfile.mockResolvedValue({ id: 'user-123' });

      await controller.updateProfile(dto, mockJwtPayload);

      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        dto,
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
});
