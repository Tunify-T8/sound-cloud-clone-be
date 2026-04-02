import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FeedListDto, FeedPostDto } from './dto/feed-item.dto';
import {
  GetTrendingQueryDto,
  TrendingListDto,
  TrendingPeriod,
  TrendingType,
} from './dto/trending.dto';
import { DiscoverListDto, GetDiscoverQueryDto } from './dto/discover.dto';
import { ArtistDto, SuggestionListDto } from './dto/suggested-artists.dto';
import { UserType } from '@prisma/client';

interface RawTopGenre {
  genreId: string;
}

interface RawFeedRow {
  id: string;
  title: string;
  artist: string;
  artist_id: string;
  artist_avatar: string | null;
  artist_is_certified: boolean;
  genre: string | null;
  durationSeconds: number;
  coverUrl: string | null;
  waveformUrl: string | null;
  comment_count: bigint;
  like_count: bigint;
  play_count: bigint;
  repost_count: bigint;
  activity_at: Date;
  action: 'post' | 'repost';
  actor_username: string;
  actor_avatar: string | null;
  actor_id: string;
}

interface RawTrendingTrack {
  id: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  score: bigint;
}

interface RawTrendingCollection {
  id: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  score: bigint;
}

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    userId: string,
    page: number = 1,
    limit: number = 20,
    includeReposts: boolean = true,
    sinceTimestamp?: string,
  ): Promise<FeedListDto> {
    const skip = (page - 1) * limit;

    const followed = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    if (followed.length === 0) {
      return { items: [], page, limit, hasMore: false };
    }

    const followedIds = followed.map((f) => f.followingId);

    const trackColumns = `
    t.id,
    t.title,
    COALESCE(u_owner."displayName", u_owner.username) AS artist,
    u_owner.id                                        AS artist_id,
    u_owner."avatarUrl"                               AS artist_avatar,
    u_owner."isCertified"                             AS artist_is_certified,
    g.label                                           AS genre,
    t."durationSeconds"                               AS "durationSeconds",
    t."coverUrl"                                      AS "coverUrl",
    t."waveformUrl"                                   AS "waveformUrl",
    (
      SELECT COUNT(*) FROM "Comment" c
      WHERE c."trackId" = t.id
        AND c."isDeleted" = false
        AND c."isHidden"  = false
    ) AS comment_count,
    (
      SELECT COUNT(*) FROM "TrackLike" tl
      WHERE tl."trackId" = t.id
    ) AS like_count,
    (
      SELECT COUNT(*) FROM "PlayHistory" ph
      WHERE ph."trackId" = t.id
    ) AS play_count,
    (
      SELECT COUNT(*) FROM "Repost" r2
      WHERE r2."trackId" = t.id
    ) AS repost_count
  `;

    const trackFilters = `
    t."isDeleted" = false
    AND t."isHidden" = false
    AND t."isPublic" = true
  `;

    const repostUnion = includeReposts
      ? `
      UNION ALL
      SELECT
        ${trackColumns},
        r."createdAt"                                       AS activity_at,
        'repost'::text                                      AS action,
        COALESCE(u_reposter."displayName", u_reposter.username) AS actor_username,
        u_reposter."avatarUrl"                              AS actor_avatar,
        u_reposter.id                                       AS actor_id
      FROM "Repost" r
      JOIN "Track" t          ON r."trackId"  = t.id
      JOIN "User"  u_owner    ON t."userId"   = u_owner.id
      JOIN "User"  u_reposter ON r."userId"   = u_reposter.id
      LEFT JOIN "Genre" g     ON t."genreId"  = g.id
      WHERE r."userId" = ANY($1::text[])
        AND ${trackFilters}
    `
      : '';

    const sinceFilter = sinceTimestamp
      ? `AND activity_at > $2::timestamptz`
      : '';
    const pagination = sinceTimestamp ? '' : `LIMIT $2 OFFSET $3`;

    const query = `
    SELECT * FROM (
      SELECT
        ${trackColumns},
        t."createdAt"                                       AS activity_at,
        'post'::text                                        AS action,
        COALESCE(u_owner."displayName", u_owner.username)  AS actor_username,
        u_owner."avatarUrl"                                 AS actor_avatar,
        u_owner.id                                          AS actor_id
      FROM "Track" t
      JOIN "User"  u_owner ON t."userId"  = u_owner.id
      LEFT JOIN "Genre" g  ON t."genreId" = g.id
      WHERE t."userId" = ANY($1::text[])
        AND ${trackFilters}

      ${repostUnion}
    ) AS feed
    WHERE 1=1
      ${sinceFilter}
    ORDER BY activity_at DESC
    ${pagination}
  `;

    const params: unknown[] = sinceTimestamp
      ? [followedIds, sinceTimestamp]
      : [followedIds, limit, skip];

    const rows = (await this.prisma.$queryRawUnsafe<RawFeedRow[]>(
      query,
      ...params,
    )) as RawFeedRow[];

    const trackIds = [...new Set(rows.map((r) => r.id))];

    const [likedSet, repostedSet] = await Promise.all([
      this.prisma.trackLike
        .findMany({
          where: {
            userId,
            trackId: { in: trackIds.length > 0 ? trackIds : ['__none__'] },
          },
          select: { trackId: true },
        })
        .then((likes) => new Set(likes.map((l) => l.trackId))),
      this.prisma.repost
        .findMany({
          where: {
            userId,
            trackId: { in: trackIds.length > 0 ? trackIds : ['__none__'] },
          },
          select: { trackId: true },
        })
        .then((reposts) => new Set(reposts.map((r) => r.trackId))),
    ]);

    const items: FeedPostDto[] = rows.map((row) => ({
      trackId: row.id,
      artistId: row.artist_id,
      artistAvatarUrl: row.artist_avatar ?? '',
      artistIsCertified: row.artist_is_certified,
      action: {
        id: row.actor_id,
        username: row.actor_username,
        action: row.action,
        date: row.activity_at.toISOString(),
        avatarUrl: row.actor_avatar,
      },
      title: row.title,
      artist: row.artist,
      genre: row.genre ?? undefined,
      durationInSeconds: row.durationSeconds,
      coverUrl: row.coverUrl,
      waveformUrl: row.waveformUrl,
      numberOfComments: Number(row.comment_count),
      numberOfLikes: Number(row.like_count),
      numberOfListens: Number(row.play_count),
      numberOfReposts: Number(row.repost_count),
      isLiked: likedSet.has(row.id),
      isReposted: repostedSet.has(row.id),
    }));

    return {
      items,
      page,
      limit,
      hasMore: sinceTimestamp ? false : items.length === limit,
    };
  }

  async getTrending(dto: GetTrendingQueryDto): Promise<TrendingListDto> {
    const { type, period = TrendingPeriod.WEEK, genreId } = dto;

    const periodStart = this.getPeriodStart(period);

    const items =
      type === TrendingType.TRACK
        ? await this.getTrendingTracks(periodStart, genreId)
        : await this.getTrendingCollections(
            type === TrendingType.ALBUM ? 'ALBUM' : 'PLAYLIST',
            periodStart,
            genreId,
          );

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        artist: item.artist,
        coverUrl: item.coverUrl,
        type,
        score: Number(item.score),
      })),
      type,
      period,
      genreId,
    };
  }

  private getPeriodStart(period: TrendingPeriod): Date {
    const now = new Date();
    if (period === TrendingPeriod.DAY) {
      now.setDate(now.getDate() - 1);
    } else if (period === TrendingPeriod.WEEK) {
      now.setDate(now.getDate() - 7);
    } else {
      now.setMonth(now.getMonth() - 1);
    }
    return now;
  }

  private async getTrendingTracks(
    periodStart: Date,
    genreId?: string,
  ): Promise<RawTrendingTrack[]> {
    const genreFilter = genreId ? `AND t."genreId" = $2` : '';

    const params: unknown[] = genreId
      ? [periodStart.toISOString(), genreId]
      : [periodStart.toISOString()];

    const query = `
      SELECT
        t.id,
        t.title                                   AS name,
        COALESCE(u."displayName", u.username)     AS artist,
        t."coverUrl"                              AS "coverUrl",
        (
          SELECT COUNT(*) FROM "PlayHistory" ph
          WHERE ph."trackId" = t.id
            AND ph."playedAt" >= $1::timestamptz
        ) * 1
        +
        (
          SELECT COUNT(*) FROM "TrackLike" tl
          WHERE tl."trackId" = t.id
            AND tl."createdAt" >= $1::timestamptz
        ) * 2                                     AS score
      FROM "Track" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."isDeleted" = false
        AND t."isHidden"  = false
        AND t."isPublic"  = true
        ${genreFilter}
      ORDER BY score DESC
      LIMIT 10
    `;

    return this.prisma.$queryRawUnsafe<RawTrendingTrack[]>(
      query,
      ...params,
    ) as Promise<RawTrendingTrack[]>;
  }

  private async getTrendingCollections(
    type: 'ALBUM' | 'PLAYLIST',
    periodStart: Date,
    genreId?: string,
  ): Promise<RawTrendingCollection[]> {
    // genre filter joins through CollectionTrack → Track
    const genreFilter = genreId ? `AND t."genreId" = $3` : '';

    const params: unknown[] = genreId
      ? [type, periodStart.toISOString(), genreId]
      : [type, periodStart.toISOString()];

    const query = `
      SELECT
        c.id,
        c.title                                   AS name,
        COALESCE(u."displayName", u.username)     AS artist,
        c."coverUrl"                              AS "coverUrl",
        COUNT(ph.id)                              AS score
      FROM "Collection" c
      JOIN "User" u             ON c."userId"      = u.id
      JOIN "CollectionTrack" ct ON ct."collectionId" = c.id
      JOIN "Track" t            ON ct."trackId"    = t.id
      LEFT JOIN "PlayHistory" ph
             ON ph."trackId" = t.id
            AND ph."playedAt" >= $2::timestamptz
      WHERE c.type       = $1::"CollectionType"
        AND c."isDeleted" = false
        AND c."isPublic"  = true
        AND t."isDeleted" = false
        AND t."isHidden"  = false
        AND t."isPublic"  = true
        ${genreFilter}
      GROUP BY c.id, c.title, u."displayName", u.username, c."coverUrl"
      ORDER BY score DESC
      LIMIT 10
    `;

    return this.prisma.$queryRawUnsafe<RawTrendingCollection[]>(
      query,
      ...params,
    ) as Promise<RawTrendingCollection[]>;
  }

  async getDiscover(
    dto: GetDiscoverQueryDto,
    userId?: string,
  ): Promise<DiscoverListDto> {
    const { page = 1, limit = 20, genreId } = dto;
    const skip = (page - 1) * limit;

    // logged-out or no play history → recent uploads
    if (!userId) {
      return this.getRecentUploads(skip, limit, page, genreId, false);
    }

    // check if user has any play history at all
    const hasHistory = await this.prisma.playHistory.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!hasHistory) {
      return this.getRecentUploads(skip, limit, page, genreId, false);
    }

    // get user's top 3 genres from play history
    const topGenres = (await this.prisma.$queryRawUnsafe<RawTopGenre[]>(
      `
        SELECT t."genreId"
        FROM "PlayHistory" ph
        JOIN "Track" t ON ph."trackId" = t.id
        WHERE ph."userId" = $1
          AND t."genreId" IS NOT NULL
        GROUP BY t."genreId"
        ORDER BY COUNT(*) DESC
        LIMIT 3
      `,
      userId,
    )) as RawTopGenre[];

    // no genre data (all their history is genre-less tracks) → recent uploads
    if (topGenres.length === 0) {
      return this.getRecentUploads(skip, limit, page, genreId, false);
    }

    const topGenreIds = topGenres.map((g) => g.genreId);

    // get tracks already heard by this user
    const heard = await this.prisma.playHistory.findMany({
      where: { userId },
      select: { trackId: true },
    });
    const heardIds = heard.map((h) => h.trackId);

    // fetch personalized recent tracks matching top genres, excluding heard
    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where: {
          isDeleted: false,
          isHidden: false,
          isPublic: true,
          genreId: genreId
            ? genreId // explicit genre filter takes priority
            : { in: topGenreIds },
          id: { notIn: heardIds.length > 0 ? heardIds : undefined },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          coverUrl: true,
          waveformUrl: true,
          durationSeconds: true,
          createdAt: true,
          user: {
            select: {
              username: true,
              displayName: true,
            },
          },
          genre: {
            select: { label: true },
          },
        },
      }),
      this.prisma.track.count({
        where: {
          isDeleted: false,
          isHidden: false,
          isPublic: true,
          genreId: genreId ? genreId : { in: topGenreIds },
          id: { notIn: heardIds.length > 0 ? heardIds : undefined },
        },
      }),
    ]);

    // not enough personalized results → fall back to recent uploads
    if (tracks.length === 0) {
      return this.getRecentUploads(skip, limit, page, genreId, false);
    }

    return {
      items: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.user.displayName ?? t.user.username,
        coverUrl: t.coverUrl,
        waveformUrl: t.waveformUrl,
        durationSeconds: t.durationSeconds,
        genre: t.genre?.label ?? null,
        createdAt: t.createdAt,
      })),
      page,
      limit,
      hasMore: skip + tracks.length < total,
      personalized: true,
    };
  }

  async getSuggestedArtists(
    page: number,
    limit: number,
    userId?: string,
  ): Promise<SuggestionListDto> {
    const skip = (page - 1) * limit;

    // ── Get followed artists (for exclusion) ───────────────────
    let followedArtistIds: string[] = [];

    if (userId) {
      const follows = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });

      followedArtistIds = follows.map((f) => f.followingId);
    }

    const excludedIds = new Set<string>(followedArtistIds);
    if (userId) excludedIds.add(userId);

    // ── Aggregate GLOBAL listens per artist (optimized) ────────
    const listenedArtists = await this.prisma.$queryRaw<
      { userId: string; plays: number }[]
    >`
    SELECT t."userId", COUNT(ph."trackId")::int AS plays
    FROM "PlayHistory" ph
    JOIN "Track" t ON ph."trackId" = t.id
    JOIN "User" u ON t."userId" = u.id
    WHERE t."isDeleted" = false
      AND t."isHidden" = false
      AND t."isPublic" = true
      AND u.role = 'ARTIST'
      AND u."isDeleted" = false
      AND u."isActive" = true
      AND u."isSuspended" = false
      AND u."isBanned" = false
    GROUP BY t."userId"
    ORDER BY plays DESC
  `;

    const listenedArtistIds = listenedArtists
      .map((artist) => artist.userId)
      .filter((id) => !excludedIds.has(id));

    // ── Fallback artists (must have at least one public track) ─
    const remainingArtists = await this.prisma.user.findMany({
      where: {
        role: UserType.ARTIST,
        isDeleted: false,
        isActive: true,
        isSuspended: false,
        isBanned: false,
        id: {
          notIn: [...listenedArtistIds, ...excludedIds],
        },
        tracks: {
          some: {
            isDeleted: false,
            isHidden: false,
            isPublic: true,
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const remainingArtistIds = remainingArtists.map((artist) => artist.id);

    // ── Final ranking: listened first, then fallback artists ───
    const rankedArtistIds = [...listenedArtistIds, ...remainingArtistIds];

    const total = rankedArtistIds.length;
    const paginatedArtistIds = rankedArtistIds.slice(skip, skip + limit);
    const hasMore = skip + limit < total;

    if (!paginatedArtistIds.length) {
      return {
        items: [],
        page,
        limit,
        hasMore,
      };
    }

    // ── Fetch final artist data ────────────────────────────────
    const artists = await this.prisma.user.findMany({
      where: {
        id: { in: paginatedArtistIds },
        role: UserType.ARTIST,
        isDeleted: false,
        isActive: true,
        isSuspended: false,
        isBanned: false,
        tracks: {
          some: {
            isDeleted: false,
            isHidden: false,
            isPublic: true,
          },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isCertified: true,
        _count: {
          select: {
            followers: true,
            tracks: {
              where: {
                isDeleted: false,
                isHidden: false,
                isPublic: true,
              },
            },
          },
        },
      },
    });

    const artistMap = new Map(artists.map((artist) => [artist.id, artist]));

    const items: ArtistDto[] = paginatedArtistIds
      .map((id) => artistMap.get(id))
      .filter(
        (artist): artist is Exclude<typeof artist, undefined> =>
          artist !== undefined && !excludedIds.has(artist.id),
      )
      .map((artist) => ({
        id: artist.id,
        username: artist.username,
        displayName: artist.displayName,
        isCertified: artist.isCertified,
        avatarUrl: artist.avatarUrl,
        followersCount: artist._count.followers,
        tracksCount: artist._count.tracks,
      }));

    return {
      items,
      page,
      limit,
      hasMore,
    };
  }

  private async getRecentUploads(
    skip: number,
    limit: number,
    page: number,
    genreId: string | undefined,
    personalized: boolean,
  ): Promise<DiscoverListDto> {
    const where = {
      isDeleted: false,
      isHidden: false,
      isPublic: true,
      ...(genreId ? { genreId } : {}),
    };

    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          coverUrl: true,
          waveformUrl: true,
          durationSeconds: true,
          createdAt: true,
          user: {
            select: {
              username: true,
              displayName: true,
            },
          },
          genre: {
            select: { label: true },
          },
        },
      }),
      this.prisma.track.count({ where }),
    ]);

    return {
      items: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.user.displayName ?? t.user.username,
        coverUrl: t.coverUrl,
        waveformUrl: t.waveformUrl,
        durationSeconds: t.durationSeconds,
        genre: t.genre?.label ?? null,
        createdAt: t.createdAt,
      })),
      page,
      limit,
      hasMore: skip + tracks.length < total,
      personalized,
    };
  }
}
