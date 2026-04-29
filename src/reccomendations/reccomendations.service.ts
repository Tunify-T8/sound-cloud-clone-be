import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ReasonType,
  RecommendationItemDto,
  RecommendationsResponseDto,
} from './dto/reccomendations.dto';

// ─── Prisma select shape for a full track ────────────────────────────────────
const trackSelect = {
  id: true,
  title: true,
  audioUrl: true,
  coverUrl: true,
  waveformUrl: true,
  durationSeconds: true,
  genre: { select: { label: true } },
  user: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
      isCertified: true,
    },
  },
  _count: {
    select: { likes: true, playHistory: true, comments: true, reposts: true },
  },
} as const;

type TrackWithRelations = {
  id: string;
  title: string;
  audioUrl: string;
  coverUrl: string | null;
  waveformUrl: string | null;
  durationSeconds: number;
  genre: { label: string } | null;
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    isCertified: boolean;
  };
  _count: {
    likes: number;
    playHistory: number;
    comments: number;
    reposts: number;
  };
};

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public entry point ────────────────────────────────────────────────────

  async getRecommendations(
    userId: string,
    page: number,
    limit: number,
  ): Promise<RecommendationsResponseDto> {
    const skip = (page - 1) * limit;
    const poolSize = limit * 5;

    // ── Build exclusion sets ────────────────────────────────────────────────
    const [excludeIds, blockedUserIds, likedTrackIds, repostedTrackIds] =
      await Promise.all([
        this.getExcludeTrackIds(userId),
        this.getBlockedUserIds(userId),
        this.getLikedTrackIds(userId),
        this.getRepostedTrackIds(userId),
      ]);

    const likedIdSet = new Set(likedTrackIds);
    const repostedIdSet = new Set(repostedTrackIds);

    // Global dedup set
    const seenIds = new Set<string>(excludeIds);

    const candidates: RecommendationItemDto[] = [];

    // helper to add items safely
    const addItems = (items: RecommendationItemDto[]) => {
      for (const item of items) {
        if (!seenIds.has(item.trackId)) {
          seenIds.add(item.trackId);
          candidates.push(item);
        }
      }
    };

    // ── Tier 1: Social ──────────────────────────────────────────────────────
    if (candidates.length < poolSize) {
      const followedIds = await this.getFollowedUserIds(userId);

      if (followedIds.length > 0) {
        const remaining = poolSize - candidates.length;

        const tier1 = await this.tierSocial(
          excludeIds,
          remaining,
          followedIds,
          blockedUserIds,
          likedIdSet,
          repostedIdSet,
        );

        addItems(tier1);
      }
    }

    // ── Tier 2: Taste ───────────────────────────────────────────────────────
    if (candidates.length < poolSize && likedTrackIds.length >= 2) {
      const remaining = poolSize - candidates.length;

      const tier2 = await this.tierTaste(
        excludeIds,
        remaining,
        userId,
        likedTrackIds,
        blockedUserIds,
        likedIdSet,
        repostedIdSet,
      );

      addItems(tier2);
    }

    // ── Tier 3: Tag ─────────────────────────────────────────────────────────
    if (candidates.length < poolSize) {
      const listenedIds = await this.getListenedTrackIds(userId);

      if (listenedIds.length > 0) {
        const remaining = poolSize - candidates.length;

        const tier3 = await this.tierTag(
          excludeIds,
          remaining,
          listenedIds,
          blockedUserIds,
          likedIdSet,
          repostedIdSet,
        );

        addItems(tier3);
      }
    }

    // ── Tier 4: Genre ───────────────────────────────────────────────────────
    if (candidates.length < poolSize) {
      const remaining = poolSize - candidates.length;

      const tier4 = await this.tierGenre(
        excludeIds,
        remaining,
        userId,
        blockedUserIds,
        likedIdSet,
        repostedIdSet,
      );

      addItems(tier4);
    }

    // ── No data ─────────────────────────────────────────────────────────────
    if (candidates.length === 0) {
      return {
        data: [],
        page,
        limit,
        hasMore: false,
        meta: {
          code: 'NO_DATA',
          message: 'Listen to some tracks to get personalized recommendations.',
        },
      };
    }

    // ── Pagination (FINAL STEP ONLY) ─────────────────────────────────────────
    const total = candidates.length;
    const page_data = candidates.slice(skip, skip + limit);

    if (page_data.length === 0 && page > 1) {
      return {
        data: [],
        page,
        limit,
        hasMore: false,
        meta: {
          code: 'NO_DATA',
          message:
            total === 0
              ? 'No recommendations available.'
              : 'No more recommendations.',
        },
      };
    }

    return {
      data: page_data,
      page,
      limit,
      hasMore: skip + page_data.length < total,
    };
  }

  // ─── Exclusion helpers ─────────────────────────────────────────────────────

  private async getExcludeTrackIds(userId: string): Promise<string[]> {
    const [played, liked] = await Promise.all([
      this.prisma.playHistory.findMany({
        where: { userId },
        select: { trackId: true },
      }),
      this.prisma.trackLike.findMany({
        where: { userId },
        select: { trackId: true },
      }),
    ]);
    const ids = new Set([
      ...played.map((p) => p.trackId),
      ...liked.map((l) => l.trackId),
    ]);
    return Array.from(ids);
  }

  private async getBlockedUserIds(userId: string): Promise<string[]> {
    // Exclude both users this person blocked AND users who blocked this person
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== userId) ids.add(b.blockerId);
      if (b.blockedId !== userId) ids.add(b.blockedId);
    }
    return Array.from(ids);
  }

  private async getRepostedTrackIds(userId: string): Promise<string[]> {
    const reposts = await this.prisma.repost.findMany({
      where: { userId },
      select: { trackId: true },
    });
    return reposts.map((r) => r.trackId);
  }

  private async getFollowedUserIds(userId: string): Promise<string[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return follows.map((f) => f.followingId);
  }

  private async getLikedTrackIds(userId: string): Promise<string[]> {
    const likes = await this.prisma.trackLike.findMany({
      where: { userId },
      select: { trackId: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return likes.map((l) => l.trackId);
  }

  private async getListenedTrackIds(userId: string): Promise<string[]> {
    const plays = await this.prisma.playHistory.findMany({
      where: { userId },
      select: { trackId: true },
      orderBy: { playedAt: 'desc' },
      take: 50,
    });
    return plays.map((p) => p.trackId);
  }

  // ─── Shared track filter ───────────────────────────────────────────────────

  private safeTrackWhere(excludeIds: string[], blockedUserIds: string[]) {
    return {
      isDeleted: false,
      isHidden: false,
      isPublic: true,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      user: {
        is_suspended: false,
        is_banned: false,
        is_deleted: false,
        ...(blockedUserIds.length > 0 ? { id: { notIn: blockedUserIds } } : {}),
      },
    };
  }

  // ─── Map helper ───────────────────────────────────────────────────────────

  private mapTrack(
    track: TrackWithRelations,
    reason: string,
    reasonType: ReasonType,
    likedIdSet: Set<string>,
    repostedIdSet: Set<string>,
  ): RecommendationItemDto {
    return {
      trackId: track.id,
      artistId: track.user.id,
      artistAvatarUrl: track.user.avatar_url,
      artistIsCertified: track.user.isCertified,
      title: track.title,
      artist: track.user.display_name ?? track.user.username,
      genre: track.genre?.label ?? null,
      durationInSeconds: track.durationSeconds,
      coverUrl: track.coverUrl,
      waveformUrl: track.waveformUrl,
      numberOfComments: track._count.comments,
      numberOfLikes: track._count.likes,
      numberOfReposts: track._count.reposts,
      numberOfListens: track._count.playHistory,
      isLiked: likedIdSet.has(track.id),
      isReposted: repostedIdSet.has(track.id),
      reason,
      reasonType,
    };
  }
  // ─── Fisher-Yates shuffle ─────────────────────────────────────────────────

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ─── Tier 1: Social ───────────────────────────────────────────────────────
  // Tracks liked or reposted by users you follow, with their username as reason

  private async tierSocial(
    excludeIds: string[],
    remaining: number,
    followedIds: string[],
    blockedUserIds: string[],
    likedIdSet: Set<string>,
    repostedIdSet: Set<string>,
  ): Promise<RecommendationItemDto[]> {
    if (remaining <= 0) return [];
    // Get recent likes by followed users, grouped to pick a reason username
    const recentLikes = await this.prisma.trackLike.findMany({
      where: {
        userId: { in: followedIds },
        track: this.safeTrackWhere(excludeIds, blockedUserIds),
      },
      select: {
        user: { select: { username: true } },
        track: { select: trackSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: remaining * 2,
    });

    const recentReposts = await this.prisma.repost.findMany({
      where: {
        userId: { in: followedIds },
        track: this.safeTrackWhere(excludeIds, blockedUserIds),
      },
      select: {
        user: { select: { username: true } },
        track: { select: trackSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: remaining * 2,
    });

    // Merge, pick one reason username per trackId (first encountered)
    const trackReasonMap = new Map<
      string,
      { track: TrackWithRelations; username: string }
    >();

    for (const item of [...recentLikes, ...recentReposts]) {
      if (!trackReasonMap.has(item.track.id)) {
        trackReasonMap.set(item.track.id, {
          track: item.track as TrackWithRelations,
          username: item.user.username,
        });
      }
    }

    const entries = this.shuffle(Array.from(trackReasonMap.values()));

    return entries
      .slice(0, remaining)
      .map(({ track, username }) =>
        this.mapTrack(
          track,
          `Because you follow ${username}`,
          ReasonType.FOLLOW,
          likedIdSet,
          repostedIdSet,
        ),
      );
  }

  // ─── Tier 2: Taste ────────────────────────────────────────────────────────
  // Users who liked ≥2 tracks you liked → surface their other likes

  private async tierTaste(
    excludeIds: string[],
    remaining: number,
    userId: string,
    likedTrackIds: string[],
    blockedUserIds: string[],
    likedIdSet: Set<string>,
    repostedIdSet: Set<string>,
  ): Promise<RecommendationItemDto[]> {
    if (remaining <= 0) return [];
    // Find users with overlapping taste (≥2 shared liked tracks)
    const overlapping = await this.prisma.trackLike.groupBy({
      by: ['userId'],
      where: {
        trackId: { in: likedTrackIds },
        userId: { not: userId, notIn: blockedUserIds },
      },
      _count: { trackId: true },
      having: { trackId: { _count: { gte: 2 } } },
      orderBy: { _count: { trackId: 'desc' } },
      take: 30,
    });

    if (overlapping.length === 0) return [];

    const similarUserIds = overlapping.map((u) => u.userId);

    // Pick a shared track to use in the reason string (first liked track that overlaps)
    const sharedLike = await this.prisma.trackLike.findFirst({
      where: {
        userId: { in: similarUserIds },
        trackId: { in: likedTrackIds },
      },
      select: { track: { select: { title: true } } },
    });

    const reasonTrackTitle = sharedLike?.track.title ?? 'a track you liked';

    // Get tracks those similar users liked that you haven't heard
    const theirLikes = await this.prisma.trackLike.findMany({
      where: {
        userId: { in: similarUserIds },
        track: this.safeTrackWhere(excludeIds, blockedUserIds),
      },
      select: { track: { select: trackSelect } },
      orderBy: { createdAt: 'desc' },
      take: remaining * 2,
    });

    const unique = new Map<string, TrackWithRelations>();
    for (const l of theirLikes) {
      if (!unique.has(l.track.id))
        unique.set(l.track.id, l.track as TrackWithRelations);
    }

    return this.shuffle(Array.from(unique.values()))
      .slice(0, remaining)
      .map((track) =>
        this.mapTrack(
          track,
          `Because you liked ${reasonTrackTitle}`,
          ReasonType.TASTE,
          likedIdSet,
          repostedIdSet,
        ),
      );
  }

  // ─── Tier 3: Tag ──────────────────────────────────────────────────────────
  // Tracks sharing top tags from your most-played tracks
  private async tierTag(
    excludeIds: string[],
    remaining: number,
    listenedTrackIds: string[],
    blockedUserIds: string[],
    likedIdSet: Set<string>,
    repostedIdSet: Set<string>,
  ): Promise<RecommendationItemDto[]> {
    if (remaining <= 0) return [];
    // Get top 5 tags from listened tracks
    const tagRows = await this.prisma.trackTag.groupBy({
      by: ['tag'],
      where: { trackId: { in: listenedTrackIds } },
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: remaining * 2,
    });

    if (tagRows.length === 0) return [];

    const topTags = tagRows.map((r) => r.tag);
    const results: RecommendationItemDto[] = [];

    let remainingLeft = remaining;

    for (const tag of topTags) {
      if (remainingLeft <= 0) break;

      const perTagLimit = Math.ceil(remainingLeft / topTags.length);

      const tracks = await this.prisma.track.findMany({
        where: {
          ...this.safeTrackWhere(
            [...excludeIds, ...results.map((r) => r.trackId)],
            blockedUserIds,
          ),
          tags: { some: { tag } },
        },
        select: trackSelect,
        orderBy: { createdAt: 'desc' },
        take: perTagLimit,
      });

      const shuffled = this.shuffle(tracks);

      for (const track of shuffled) {
        if (remainingLeft <= 0) break;

        results.push(
          this.mapTrack(
            track as TrackWithRelations,
            `Because you like #${tag}`,
            ReasonType.TAG,
            likedIdSet,
            repostedIdSet,
          ),
        );

        remainingLeft--;
      }
    }

    return results.slice(0, remaining);
  }

  // ─── Tier 4: Genre ────────────────────────────────────────────────────────
  // Tracks in your top genre from play history

  private async tierGenre(
    excludeIds: string[],
    remaining: number,
    userId: string,
    blockedUserIds: string[],
    likedIdSet: Set<string>,
    repostedIdSet: Set<string>,
  ): Promise<RecommendationItemDto[]> {
    // Top genre from play history via raw query (same pattern as existing discover)
    if (remaining <= 0) return [];
    const topGenres = await this.prisma.$queryRaw<
      { genreId: string; label: string }[]
    >`
        SELECT t."genreId", g."label"
        FROM "PlayHistory" ph
        JOIN "Track" t ON ph."trackId" = t.id
        JOIN "Genre" g ON t."genreId" = g.id
        WHERE ph."userId" = ${userId}
          AND t."genreId" IS NOT NULL
        GROUP BY t."genreId", g."label"
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

    if (topGenres.length === 0) return [];

    const { genreId, label } = topGenres[0];

    const tracks = await this.prisma.track.findMany({
      where: {
        ...this.safeTrackWhere(excludeIds, blockedUserIds),
        genreId,
      },
      select: trackSelect,
      orderBy: { createdAt: 'desc' },
      take: remaining * 2,
    });

    return this.shuffle(tracks as TrackWithRelations[]).map((track) =>
      this.mapTrack(
        track,
        `Because you listen to ${label}`,
        ReasonType.GENRE,
        likedIdSet,
        repostedIdSet,
      ),
    );
  }
}
