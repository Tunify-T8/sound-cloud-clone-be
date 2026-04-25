import { Test, TestingModule } from '@nestjs/testing';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

// ── Mock Prisma ─────────────────────────────────────────────
const mockPrisma = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  track: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  playHistory: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  report: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  reportReason: {
    findMany: jest.fn(),
  },
};

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminAnalyticsService>(AdminAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getSummary ────────────────────────────────────────────
  describe('getSummary', () => {
    it('should return aggregated summary', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      mockPrisma.track.count
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(6);

      mockPrisma.playHistory.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10);

      mockPrisma.report.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);

      const result = await service.getSummary();

      expect(result.totalUsers).toBe(10);
      expect(result.newUsersToday).toBe(2);
      expect(result.newTracksToday).toBe(3);
      expect(result.totalPlays).toBe(100);
      expect(result.pendingReports).toBe(2);
      expect(result.generatedAt).toBeDefined();
    });

    it('should call prisma with correct filters', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.playHistory.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      await service.getSummary();

      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false },
        }),
      );
    });
  });

  // ── getAnalytics ──────────────────────────────────────────
  describe('getAnalytics', () => {
    it('should throw if start >= end', async () => {
      await expect(
        service.getAnalytics({
          startDate: '2024-01-10',
          endDate: '2024-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return empty series when no data', async () => {
      mockPrisma.playHistory.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.track.findMany.mockResolvedValue([]);
      mockPrisma.report.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-03',
      } as any);

      expect(result.playsSeries).toHaveLength(3);
      expect(result.activeUsersSeries[0].value).toBe(0);
    });

    it('should compute active users using Set logic', async () => {
      mockPrisma.playHistory.findMany.mockResolvedValue([
        { playedAt: new Date('2024-01-01'), userId: 'u1' },
        { playedAt: new Date('2024-01-01'), userId: 'u1' },
        { playedAt: new Date('2024-01-01'), userId: 'u2' },
      ]);

      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.track.findMany.mockResolvedValue([]);
      mockPrisma.report.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
      } as any);

      expect(result.activeUsersSeries[0].value).toBe(2);
    });
  });

  // ── getTopStats ───────────────────────────────────────────
  describe('getTopStats', () => {
    it('should return hydrated results', async () => {
      mockPrisma.playHistory.groupBy
        .mockResolvedValueOnce([{ trackId: 't1', _count: { trackId: 5 } }])
        .mockResolvedValueOnce([{ userId: 'u1', _count: { userId: 10 } }]);

      mockPrisma.report.groupBy
        .mockResolvedValueOnce([{ targetId: 't1', _count: { targetId: 3 } }])
        .mockResolvedValueOnce([{ targetId: 'u1', _count: { targetId: 2 } }]);

      mockPrisma.track.findUnique.mockResolvedValue({
        id: 't1',
        title: 'Track',
        user: { username: 'user', displayName: null },
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'user',
        displayName: null,
      });

      const result = await service.getTopStats({ limit: 5 });

      expect(result.mostPlayedTracks[0]?.count).toBe(5);
      expect(result.mostReportedUsers[0]?.count).toBe(2);
    });

    it('should filter null hydrated results', async () => {
      mockPrisma.playHistory.groupBy.mockResolvedValue([
        { trackId: 't1', _count: { trackId: 5 } },
      ]);

      mockPrisma.report.groupBy.mockResolvedValue([]);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.track.findUnique.mockResolvedValue(null);

      const result = await service.getTopStats({ limit: 5 });

      expect(result.mostPlayedTracks).toEqual([]);
    });
  });

  // ── getReportStats ────────────────────────────────────────
  describe('getReportStats', () => {
    it('should compute stats correctly', async () => {
      mockPrisma.report.groupBy
        .mockResolvedValueOnce([{ reasonId: 'r1', _count: { reasonId: 2 } }])
        .mockResolvedValueOnce([
          { targetType: 'TRACK', _count: { targetType: 2 } },
        ])
        .mockResolvedValueOnce([{ status: 'RESOLVED', _count: { status: 2 } }]);

      mockPrisma.report.findMany.mockResolvedValue([
        {
          createdAt: new Date('2024-01-01'),
          reviewedAt: new Date('2024-01-02'),
        },
      ]);

      mockPrisma.reportReason.findMany.mockResolvedValue([
        { id: 'r1', label: 'Spam' },
      ]);

      mockPrisma.report.count.mockResolvedValue(2);

      const result = await service.getReportStats();

      expect(result.byReason[0].label).toBe('Spam');
      expect(result.resolutionRate).toBe(100);
      expect(result.avgResolutionHours).toBeGreaterThan(0);
    });

    it('should handle zero reports edge case', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([]);
      mockPrisma.report.findMany.mockResolvedValue([]);
      mockPrisma.reportReason.findMany.mockResolvedValue([]);
      mockPrisma.report.count.mockResolvedValue(0);

      const result = await service.getReportStats();

      expect(result.resolutionRate).toBe(0);
      expect(result.avgResolutionHours).toBe(0);
    });
  });
});
