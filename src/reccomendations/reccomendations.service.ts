import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ReasonType,
  RecommendationItemDto,
  RecommendationsResponseDto,
} from './dto/recommendations.dto';

// ─── Raw query return types ───────────────────────────────────────────────────

interface RawTrendingTrack {
  id: string;
  title: string;
  audioUrl: string;
  coverUrl: string | null;
  waveformUrl: string | null;
  durationSeconds: number;
  artist_id: string;
  artist_username: string;
  artist_display_name: string | null;
  artist_avatar_url: string | null;
  like_count: bigint;
  play_count: bigint;
}

// ─── Prisma select shape for a full track ────────────────────────────────────

const trackSelect = {
  id: true,
  title: true,
  audioUrl: true,
  coverUrl: true,
  waveformUrl: true,
  durationSeconds: true,
  tags: { select: { tag: true } },
  genre: { select: { label: true } },
  user: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
    },
  },
  _count: {
    select: { likes: true, playHistory: true },
  },
} as const;

type TrackWithRelations = {
  id: string;
  title: string;
  audioUrl: string;
  coverUrl: string | null;
  waveformUrl: string | null;
  durationSeconds: number;
  tags: { tag: string }[];
  genre: { label: string } | null;
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  _count: { likes: number; playHistory: number };
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
    // We fetch extra candidates so we can shuffle within tiers and still fill pages
    const poolSize = limit * 5;

    // ── Build exclusion sets ──────────────────────────────────────────────────
    const [excludeIds, blockedUserIds] = await Promise.all([
      this.getExcludeTrackIds(userId),
      this.getBlockedUserIds(userId),
    ]);

    // ── Run tiers in order ────────────────────────────────────────────────────
    const candidates: RecommendationItemDto[] = [];

    // Tier 1 — Social (tracks liked/reposted by followed users)
    if (candidates.length < poolSize) {
      const followedIds = await this.getFollowedUserIds(userId);
      if (followedIds.length > 0) {
        const tier1 = await this.tierSocial(
          followedIds,
          excludeIds,
          blockedUserIds,
          poolSize,
        );
        candidates.push(...tier1);
      }
    }

    // Tier 2 — Taste (users who share your likes → their other likes)
    if (candidates.length < poolSize) {
      const likedTrackIds = await this.getLikedTrackIds(userId);
      if (likedTrackIds.length >= 2) {
        const seen = new Set(candidates.map((c) => c.id));
        const tier2 = await this.tierTaste(
          userId,
          likedTrackIds,
          [...excludeIds, ...seen],
          blockedUserIds,
          poolSize,
        );
        candidates.push(...tier2);
      }
    }

    // Tier 3 — Tag (tracks sharing top tags from your play history)
    if (candidates.length < poolSize) {
      const listenedIds = await this.getListenedTrackIds(userId);
      if (listenedIds.length > 0) {
        const seen = new Set(candidates.map((c) => c.id));
        const tier3 = await this.tierTag(
          listenedIds,
          [...excludeIds, ...seen],
          blockedUserIds,
          poolSize,
        );
        candidates.push(...tier3);
      }
    }

    // Tier 4 — Genre (top genre from play history)
    if (candidates.length < poolSize) {
      const seen = new Set(candidates.map((c) => c.id));
      const tier4 = await this.tierGenre(
        userId,
        [...excludeIds, ...seen],
        blockedUserIds,
        poolSize,
      );
      candidates.push(...tier4);
    }

    // Tier 5 — Trending fallback (only if all other tiers empty)
    if (candidates.length === 0) {
      const tier5 = await this.tierTrending(
        excludeIds,
        blockedUserIds,
        poolSize,
      );
      candidates.push(...tier5);
    }

    // ── No data at all ────────────────────────────────────────────────────────
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

    // ── Deduplicate by trackId (a track can appear in multiple tiers) ─────────
    const seen = new Map<string, RecommendationItemDto>();
    for (const item of candidates) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
    const unique = Array.from(seen.values());

    // ── Paginate ──────────────────────────────────────────────────────────────
    const total = unique.length;
    const page_data = unique.slice(skip, skip + limit);

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
  ): RecommendationItemDto {
    return {
      id: track.id,
      title: track.title,
      audioUrl: track.audioUrl,
      coverUrl: track.coverUrl,
      waveformUrl: track.waveformUrl,
      durationSeconds: track.durationSeconds,
      likesCount: track._count.likes,
      playsCount: track._count.playHistory,
      tags: track.tags.map((t) => t.tag),
      genre: track.genre?.label ?? null,
      artist: {
        id: track.user.id,
        username: track.user.username,
        display_name: track.user.display_name,
        avatar_url: track.user.avatar_url,
      },
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
    followedIds: string[],
    excludeIds: string[],
    blockedUserIds: string[],
    poolSize: number,
  ): Promise<RecommendationItemDto[]> {
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
      take: poolSize * 2,
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
      take: poolSize * 2,
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
      .slice(0, poolSize)
      .map(({ track, username }) =>
        this.mapTrack(
          track,
          `Because you follow ${username}`,
          ReasonType.FOLLOW,
        ),
      );
  }

  // ─── Tier 2: Taste ────────────────────────────────────────────────────────
  // Users who liked ≥2 tracks you liked → surface their other likes

  private async tierTaste(
    userId: string,
    likedTrackIds: string[],
    excludeIds: string[],
    blockedUserIds: string[],
    poolSize: number,
  ): Promise<RecommendationItemDto[]> {
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
      take: poolSize * 2,
    });

    const unique = new Map<string, TrackWithRelations>();
    for (const l of theirLikes) {
      if (!unique.has(l.track.id))
        unique.set(l.track.id, l.track as TrackWithRelations);
    }

    return this.shuffle(Array.from(unique.values()))
      .slice(0, poolSize)
      .map((track) =>
        this.mapTrack(
          track,
          `Because you listened to ${reasonTrackTitle}`,
          ReasonType.TASTE,
        ),
      );
  }

  // ─── Tier 3: Tag ──────────────────────────────────────────────────────────
  // Tracks sharing top tags from your most-played tracks

  private async tierTag(
    listenedTrackIds: string[],
    excludeIds: string[],
    blockedUserIds: string[],
    poolSize: number,
  ): Promise<RecommendationItemDto[]> {
    // Get top 5 tags from listened tracks
    const tagRows = await this.prisma.trackTag.groupBy({
      by: ['tag'],
      where: { trackId: { in: listenedTrackIds } },
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: 5,
    });

    if (tagRows.length === 0) return [];

    const topTags = tagRows.map((r) => r.tag);
    const results: RecommendationItemDto[] = [];

    // For each tag, find tracks — this gives us per-tag reason strings
    for (const tag of topTags) {
      const tracks = await this.prisma.track.findMany({
        where: {
          ...this.safeTrackWhere(
            [...excludeIds, ...results.map((r) => r.id)],
            blockedUserIds,
          ),
          tags: { some: { tag } },
        },
        select: trackSelect,
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(poolSize / topTags.length),
      });

      const shuffled = this.shuffle(tracks);
      for (const track of shuffled) {
        results.push(
          this.mapTrack(
            track as TrackWithRelations,
            `Because you like #${tag}`,
            ReasonType.TAG,
          ),
        );
      }
    }

    return results;
  }

  // ─── Tier 4: Genre ────────────────────────────────────────────────────────
  // Tracks in your top genre from play history

  private async tierGenre(
    userId: string,
    excludeIds: string[],
    blockedUserIds: string[],
    poolSize: number,
  ): Promise<RecommendationItemDto[]> {
    // Top genre from play history via raw query (same pattern as existing discover)
    const topGenres = await this.prisma.$queryRawUnsafe<
      { genreId: string; label: string }[]
    >(
      `
        SELECT t."genreId", g."label"
        FROM "PlayHistory" ph
        JOIN "Track" t ON ph."trackId" = t.id
        JOIN "Genre" g ON t."genreId" = g.id
        WHERE ph."userId" = $1
          AND t."genreId" IS NOT NULL
        GROUP BY t."genreId", g."label"
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `,
      userId,
    );

    if (topGenres.length === 0) return [];

    const { genreId, label } = topGenres[0];

    const tracks = await this.prisma.track.findMany({
      where: {
        ...this.safeTrackWhere(excludeIds, blockedUserIds),
        genreId,
      },
      select: trackSelect,
      orderBy: { createdAt: 'desc' },
      take: poolSize,
    });

    return this.shuffle(tracks as TrackWithRelations[]).map((track) =>
      this.mapTrack(track, `Because you listen to ${label}`, ReasonType.GENRE),
    );
  }

  // ─── Tier 5: Trending fallback ────────────────────────────────────────────
  // Most liked + played in the last 7 days — only fires when all other tiers empty

  private async tierTrending(
    excludeIds: string[],
    blockedUserIds: string[],
    poolSize: number,
  ): Promise<RecommendationItemDto[]> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7);

    const excludeFilter =
      excludeIds.length > 0
        ? `AND t.id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})`
        : '';

    const blockedFilter =
      blockedUserIds.length > 0
        ? `AND u.id NOT IN (${blockedUserIds
            .map((_, i) => `$${excludeIds.length + i + 2}`)
            .join(', ')})`
        : '';

    const params: unknown[] = [
      periodStart.toISOString(),
      ...excludeIds,
      ...blockedUserIds,
    ];

    const rows = await this.prisma.$queryRawUnsafe<RawTrendingTrack[]>(
      `
        SELECT
          t.id,
          t.title,
          t."audioUrl"                              AS "audioUrl",
          t."coverUrl"                              AS "coverUrl",
          t."waveformUrl"                           AS "waveformUrl",
          t."durationSeconds"                       AS "durationSeconds",
          u.id                                      AS artist_id,
          u.username                                AS artist_username,
          u."display_name"                          AS artist_display_name,
          u."avatar_url"                            AS artist_avatar_url,
          (
            SELECT COUNT(*) FROM "TrackLike" tl
            WHERE tl."trackId" = t.id
              AND tl."createdAt" >= $1::timestamptz
          )                                         AS like_count,
          (
            SELECT COUNT(*) FROM "PlayHistory" ph
            WHERE ph."trackId" = t.id
              AND ph."playedAt" >= $1::timestamptz
          )                                         AS play_count
        FROM "Track" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."isDeleted" = false
          AND t."isHidden"  = false
          AND t."isPublic"  = true
          AND u."is_suspended" = false
          AND u."is_banned"    = false
          AND u."is_deleted"   = false
          ${excludeFilter}
          ${blockedFilter}
        ORDER BY (like_count * 2 + play_count) DESC
        LIMIT ${poolSize}
      `,
      ...params,
    );

    // Fetch tags separately (raw SQL can't easily join array relations)
    const trackIds = rows.map((r) => r.id);
    const tagRows = await this.prisma.trackTag.findMany({
      where: { trackId: { in: trackIds } },
      select: { trackId: true, tag: true },
    });
    const tagMap = new Map<string, string[]>();
    for (const t of tagRows) {
      if (!tagMap.has(t.trackId)) tagMap.set(t.trackId, []);
      tagMap.get(t.trackId)!.push(t.tag);
    }

    return this.shuffle(rows).map((row) => ({
      id: row.id,
      title: row.title,
      audioUrl: row.audioUrl,
      coverUrl: row.coverUrl,
      waveformUrl: row.waveformUrl,
      durationSeconds: row.durationSeconds,
      likesCount: Number(row.like_count),
      playsCount: Number(row.play_count),
      tags: tagMap.get(row.id) ?? [],
      genre: null, // not needed for trending fallback
      artist: {
        id: row.artist_id,
        username: row.artist_username,
        display_name: row.artist_display_name,
        avatar_url: row.artist_avatar_url,
      },
      reason: 'Popular right now',
      reasonType: ReasonType.TRENDING,
    }));
  }
}
