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
    aggregate: jest.fn(), 
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

  // ── getSummary ──────────────────────────────────
  describe('getSummary', () => {
    it('should return aggregated summary with new fields', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(10) // totalUsers
        .mockResolvedValueOnce(2) // newUsersToday
        .mockResolvedValueOnce(5) // newUsersThisWeek
        .mockResolvedValueOnce(7) // activeUsers
        .mockResolvedValueOnce(1) // suspendedUsers
        .mockResolvedValueOnce(1) // bannedUsers
        .mockResolvedValueOnce(4) // artistCount
        .mockResolvedValueOnce(6); // listenerCount

      mockPrisma.track.count
        .mockResolvedValueOnce(20) // totalTracks
        .mockResolvedValueOnce(3) // newTracksToday
        .mockResolvedValueOnce(6); // newTracksThisWeek

      mockPrisma.playHistory.count
        .mockResolvedValueOnce(100) // totalPlays
        .mockResolvedValueOnce(10) // playsToday
        .mockResolvedValueOnce(68); // completedPlays

    mockPrisma.track.aggregate.mockResolvedValueOnce({
      _sum: { fileSizeBytes: 5_000_000_000 },
    });

      mockPrisma.report.count
        .mockResolvedValueOnce(4) // totalReports
        .mockResolvedValueOnce(2); // pendingReports

      const result = await service.getSummary();

      expect(result.totalUsers).toBe(10);
      expect(result.artistCount).toBe(4);
      expect(result.listenerCount).toBe(6);
      expect(result.artistToListenerRatio).toBe(0.67);
      expect(result.completedPlays).toBe(68);
      expect(result.playThroughRate).toBe(68); // 68/100 * 100
      expect(result.totalStorageBytes).toBe(5_000_000_000);
      expect(result.totalStorageGB).toBe(5);
      expect(result.generatedAt).toBeDefined();
    });

    it('should return playThroughRate of 0 when totalPlays is 0', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.track.aggregate = jest.fn().mockResolvedValueOnce({
        _sum: { fileSizeBytes: null },
      });
      mockPrisma.playHistory.count
        .mockResolvedValueOnce(0) // totalPlays
        .mockResolvedValueOnce(0) // playsToday
        .mockResolvedValueOnce(0); // completedPlays
      mockPrisma.report.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result.playThroughRate).toBe(0);
    });

    it('should return totalStorageBytes of 0 when fileSizeBytes is null', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.track.aggregate = jest.fn().mockResolvedValueOnce({
        _sum: { fileSizeBytes: null },
      });
      mockPrisma.playHistory.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result.totalStorageBytes).toBe(0);
      expect(result.totalStorageGB).toBe(0);
    });

    it('should return null artistToListenerRatio when listenerCount is 0', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(5) // totalUsers
        .mockResolvedValueOnce(0) // newUsersToday
        .mockResolvedValueOnce(0) // newUsersThisWeek
        .mockResolvedValueOnce(0) // activeUsers
        .mockResolvedValueOnce(0) // suspendedUsers
        .mockResolvedValueOnce(0) // bannedUsers
        .mockResolvedValueOnce(5) // artistCount
        .mockResolvedValueOnce(0); // listenerCount

      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.track.aggregate = jest.fn().mockResolvedValueOnce({
        _sum: { fileSizeBytes: null },
      });
      mockPrisma.playHistory.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result.artistToListenerRatio).toBeNull();
    });

    it('should query artists and listeners by role', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.track.aggregate = jest.fn().mockResolvedValueOnce({
        _sum: { fileSizeBytes: null },
      });
      mockPrisma.playHistory.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      await service.getSummary();

      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false, role: 'ARTIST' },
        }),
      );
      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false, role: 'LISTENER' },
        }),
      );
    });

    it('should query completed plays', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.track.count.mockResolvedValue(0);
      mockPrisma.track.aggregate = jest.fn().mockResolvedValueOnce({
        _sum: { fileSizeBytes: null },
      });
      mockPrisma.playHistory.count.mockResolvedValue(0);
      mockPrisma.report.count.mockResolvedValue(0);

      await service.getSummary();

      expect(mockPrisma.playHistory.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { completed: true },
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
