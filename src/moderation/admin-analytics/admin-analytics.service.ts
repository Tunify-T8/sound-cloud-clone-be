import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AnalyticsQueryDto,
  TopStatsQueryDto,
} from '../dto/analytics-query.dto';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Summary ────────────────────────────────────────────────────
  async getSummary() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      artistCount,
      listenerCount,
      totalTracks,
      newTracksToday,
      newTracksThisWeek,
      totalPlays,
      playsToday,
      completedPlays,
      trackStorage,
      totalReports,
      pendingReports,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: startOfToday } },
      }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: startOfWeek } },
      }),
      this.prisma.user.count({
        where: {
          isDeleted: false,
          playHistory: { some: { playedAt: { gte: thirtyDaysAgo } } },
        },
      }),
      this.prisma.user.count({
        where: { isDeleted: false, isSuspended: true },
      }),
      this.prisma.user.count({ where: { isDeleted: false, isBanned: true } }),
      this.prisma.user.count({ where: { isDeleted: false, role: 'ARTIST' } }), // ← new
      this.prisma.user.count({ where: { isDeleted: false, role: 'LISTENER' } }), // ← new
      this.prisma.track.count({ where: { isDeleted: false } }),
      this.prisma.track.count({
        where: { isDeleted: false, createdAt: { gte: startOfToday } },
      }),
      this.prisma.track.count({
        where: { isDeleted: false, createdAt: { gte: startOfWeek } },
      }),
      this.prisma.playHistory.count(),
      this.prisma.playHistory.count({
        where: { playedAt: { gte: startOfToday } },
      }),
      this.prisma.playHistory.count({ where: { completed: true } }), // ← new
      this.prisma.track.aggregate({
        where: { isDeleted: false },
        _sum: { fileSizeBytes: true },
      }),
      this.prisma.report.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    const totalStorageBytes = trackStorage._sum.fileSizeBytes ?? 0;
    const totalStorageGB = Math.round((totalStorageBytes / 1e9) * 100) / 100;

    const playThroughRate =
      totalPlays > 0
        ? Math.round((completedPlays / totalPlays) * 1000) / 10
        : 0;
    const artistToListenerRatio =
      listenerCount > 0
        ? Math.round((artistCount / listenerCount) * 100) / 100
        : null;

    return {
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      artistCount,
      listenerCount,
      artistToListenerRatio,
      totalTracks,
      newTracksToday,
      newTracksThisWeek,
      totalPlays,
      playsToday,
      completedPlays,
      playThroughRate,
      totalStorageBytes,
      totalStorageGB,
      totalReports,
      pendingReports,
      generatedAt: now.toISOString(),
    };
  }

  // ── Analytics time series ──────────────────────────────────────

  async getAnalytics(dto: AnalyticsQueryDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    if (start >= end) {
      throw new BadRequestException('startDate must be before endDate');
    }

    const dates = this.generateDateRange(start, end);

    const [plays, signups, tracks, reports] = await Promise.all([
      this.prisma.playHistory.findMany({
        where: { playedAt: { gte: start, lte: end } },
        select: { playedAt: true, userId: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: start, lte: end }, isDeleted: false },
        select: { createdAt: true },
      }),
      this.prisma.track.findMany({
        where: { createdAt: { gte: start, lte: end }, isDeleted: false },
        select: { createdAt: true },
      }),
      this.prisma.report.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { createdAt: true },
      }),
    ]);

    const playsSeries = dates.map((date) => ({
      date,
      value: plays.filter((p) => this.isSameDay(p.playedAt, date)).length,
    }));

    const activeUsersSeries = dates.map((date) => {
      const uniqueUsers = new Set(
        plays
          .filter((p) => this.isSameDay(p.playedAt, date))
          .map((p) => p.userId),
      );
      return { date, value: uniqueUsers.size };
    });

    const newSignupsSeries = dates.map((date) => ({
      date,
      value: signups.filter((u) => this.isSameDay(u.createdAt, date)).length,
    }));

    const newTracksSeries = dates.map((date) => ({
      date,
      value: tracks.filter((t) => this.isSameDay(t.createdAt, date)).length,
    }));

    const newReportsSeries = dates.map((date) => ({
      date,
      value: reports.filter((r) => this.isSameDay(r.createdAt, date)).length,
    }));

    return {
      rangeStart: dto.startDate,
      rangeEnd: dto.endDate,
      playsSeries,
      activeUsersSeries,
      newSignupsSeries,
      newTracksSeries,
      newReportsSeries,
    };
  }

  // ── Top stats ──────────────────────────────────────────────────

  async getTopStats(dto: TopStatsQueryDto) {
    const limit = dto.limit ?? 10;

    const [
      mostPlayedTracks,
      mostReportedTracks,
      mostReportedUsers,
      mostActiveUsers,
    ] = await Promise.all([
      // Most played tracks
      this.prisma.playHistory.groupBy({
        by: ['trackId'],
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: limit,
      }),

      // Most reported tracks
      this.prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'TRACK' },
        _count: { targetId: true },
        orderBy: { _count: { targetId: 'desc' } },
        take: limit,
      }),

      // Most reported users
      this.prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'USER' },
        _count: { targetId: true },
        orderBy: { _count: { targetId: 'desc' } },
        take: limit,
      }),

      // Most active users by play count
      this.prisma.playHistory.groupBy({
        by: ['userId'],
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: limit,
      }),
    ]);

    // Hydrate track details
    const hydrateTrack = async (items: {
      targetId?: string;
      trackId?: string;
      _count: Record<string, number>;
    }) => {
      const id = 'trackId' in items ? items.trackId : items.targetId;
      const count = Object.values(items._count)[0];
      const track = await this.prisma.track.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          user: { select: { displayName: true, username: true } },
        },
      });
      if (!track) return null;
      return {
        trackId: track.id,
        title: track.title,
        artistName: track.user.displayName ?? track.user.username,
        count,
      };
    };

    // Hydrate user details
    const hydrateUser = async (item: {
      targetId?: string;
      userId?: string;
      _count: Record<string, number>;
    }) => {
      const id = 'userId' in item ? item.userId : item.targetId;
      const count = Object.values(item._count)[0];
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true, displayName: true },
      });
      if (!user) return null;
      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        count,
      };
    };

    const [
      mostPlayedTracksHydrated,
      mostReportedTracksHydrated,
      mostReportedUsersHydrated,
      mostActiveUsersHydrated,
    ] = await Promise.all([
      Promise.all(mostPlayedTracks.map(hydrateTrack)),
      Promise.all(mostReportedTracks.map(hydrateTrack)),
      Promise.all(mostReportedUsers.map(hydrateUser)),
      Promise.all(mostActiveUsers.map(hydrateUser)),
    ]);

    return {
      mostPlayedTracks: mostPlayedTracksHydrated.filter(Boolean),
      mostReportedTracks: mostReportedTracksHydrated.filter(Boolean),
      mostReportedUsers: mostReportedUsersHydrated.filter(Boolean),
      mostActiveUsers: mostActiveUsersHydrated.filter(Boolean),
    };
  }

  // ── Report stats ───────────────────────────────────────────────

  async getReportStats() {
    const [byReason, byEntityType, byStatus, resolvedReports] =
      await Promise.all([
        this.prisma.report.groupBy({
          by: ['reasonId'],
          _count: { reasonId: true },
          orderBy: { _count: { reasonId: 'desc' } },
        }),
        this.prisma.report.groupBy({
          by: ['targetType'],
          _count: { targetType: true },
        }),
        this.prisma.report.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        this.prisma.report.findMany({
          where: {
            status: { in: ['RESOLVED', 'REJECTED'] },
            reviewedAt: { not: null },
          },
          select: { createdAt: true, reviewedAt: true },
        }),
      ]);

    // Hydrate reason labels
    const reasons = await this.prisma.reportReason.findMany({
      select: { id: true, label: true },
    });
    const reasonMap = new Map(reasons.map((r) => [r.id, r.label]));

    const total = await this.prisma.report.count();
    const resolved =
      byStatus.find((s) => s.status === 'RESOLVED')?._count.status ?? 0;
    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;

    const avgResolutionHours =
      resolvedReports.length > 0
        ? resolvedReports.reduce((acc, r) => {
            const diffMs = r.reviewedAt!.getTime() - r.createdAt.getTime();
            return acc + diffMs / (1000 * 60 * 60);
          }, 0) / resolvedReports.length
        : 0;

    return {
      byReason: byReason.map((r) => ({
        reasonId: r.reasonId,
        label: reasonMap.get(r.reasonId) ?? r.reasonId,
        count: r._count.reasonId,
      })),
      byEntityType: byEntityType.map((e) => ({
        entityType: e.targetType,
        count: e._count.targetType,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
      resolutionRate: Math.round(resolutionRate * 10) / 10,
      avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  private generateDateRange(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  private isSameDay(date: Date, dateString: string): boolean {
    return date.toISOString().split('T')[0] === dateString;
  }
}
