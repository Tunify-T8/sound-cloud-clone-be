import { Test, TestingModule } from '@nestjs/testing';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

const mockFeedService = {
  getFeed: jest.fn(),
  getTrending: jest.fn(),
  getDiscover: jest.fn(),
};

describe('FeedController', () => {
  let controller: FeedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [{ provide: FeedService, useValue: mockFeedService }],
    }).compile();

    controller = module.get<FeedController>(FeedController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getFeed ───────────────────────────────────────────────
  describe('getFeed', () => {
    it('should call service with correct params', async () => {
      mockFeedService.getFeed.mockResolvedValue({});

      const user = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'user',
      };

      await controller.getFeed(user, 1, 10, true, undefined);

      expect(mockFeedService.getFeed).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
        true,
        undefined,
      );
    });

    it('should correctly parse includeReposts=false', async () => {
      mockFeedService.getFeed.mockResolvedValue({});

      const user = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'user',
      };

      await controller.getFeed(user, 1, 10, 'false' as unknown as boolean, undefined);

      expect(mockFeedService.getFeed).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
        false,
        undefined,
      );
    });
  });

  // ── getTrending ───────────────────────────────────────────
  describe('getTrending', () => {
    it('should call service with query dto', async () => {
      const query = { type: 'TRACK' };

      await controller.getTrending(query as any);

      expect(mockFeedService.getTrending).toHaveBeenCalledWith(query);
    });
  });

  // ── getDiscover ───────────────────────────────────────────
  describe('getDiscover', () => {
    it('should pass userId when user exists', async () => {
      const query = { page: 1 };
      const user = { userId: 'user-1' };

      await controller.getDiscover(query as any, user as any);

      expect(mockFeedService.getDiscover).toHaveBeenCalledWith(query, 'user-1');
    });

    it('should pass undefined when user not provided', async () => {
      const query = { page: 1 };

      await controller.getDiscover(query as any, undefined);

      expect(mockFeedService.getDiscover).toHaveBeenCalledWith(
        query,
        undefined,
      );
    });
  });
});
