import { Test, TestingModule } from '@nestjs/testing';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

// ── Mock Service ────────────────────────────────────────────
const mockAdminAnalyticsService = {
  getSummary: jest.fn(),
  getAnalytics: jest.fn(),
  getTopStats: jest.fn(),
  getReportStats: jest.fn(),
};

describe('AdminAnalyticsController', () => {
  let controller: AdminAnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAnalyticsController],
      providers: [
        {
          provide: AdminAnalyticsService,
          useValue: mockAdminAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AdminAnalyticsController>(AdminAnalyticsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getSummary ────────────────────────────────────────────
  describe('getSummary', () => {
    it('should call service and return result', async () => {
      const mockResult = { totalUsers: 10 };

      mockAdminAnalyticsService.getSummary.mockResolvedValue(mockResult);

      const result = await controller.getSummary();

      expect(mockAdminAnalyticsService.getSummary).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  // ── getAnalytics ──────────────────────────────────────────
  describe('getAnalytics', () => {
    it('should call service with query dto', async () => {
      const query = { startDate: '2024-01-01', endDate: '2024-01-10' };

      mockAdminAnalyticsService.getAnalytics.mockResolvedValue({});

      await controller.getAnalytics(query);

      expect(mockAdminAnalyticsService.getAnalytics).toHaveBeenCalledWith(
        query,
      );
    });

    it('should return service result', async () => {
      const mockResult = { playsSeries: [] };

      mockAdminAnalyticsService.getAnalytics.mockResolvedValue(mockResult);

      const result = await controller.getAnalytics({ startDate: '2024-01-01', endDate: '2024-01-10' });

      expect(result).toEqual(mockResult);
    });
  });

  // ── getTopStats ───────────────────────────────────────────
  describe('getTopStats', () => {
    it('should call service with query dto', async () => {
      const query = { limit: 5 };

      mockAdminAnalyticsService.getTopStats.mockResolvedValue({});

      await controller.getTopStats(query);

      expect(mockAdminAnalyticsService.getTopStats).toHaveBeenCalledWith(query);
    });

    it('should return service result', async () => {
      const mockResult = { mostPlayedTracks: [] };

      mockAdminAnalyticsService.getTopStats.mockResolvedValue(mockResult);

      const result = await controller.getTopStats({ limit: 5 });

      expect(result).toEqual(mockResult);
    });
  });

  // ── getReportStats ────────────────────────────────────────
  describe('getReportStats', () => {
    it('should call service and return result', async () => {
      const mockResult = { byReason: [] };

      mockAdminAnalyticsService.getReportStats.mockResolvedValue(mockResult);

      const result = await controller.getReportStats();

      expect(mockAdminAnalyticsService.getReportStats).toHaveBeenCalled();

      expect(result).toEqual(mockResult);
    });
  });
});
