import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FeedListDto, FeedPostDto } from './dto/feed-item.dto';

interface RawFeedRow {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  durationSeconds: number;
  coverUrl: string | null;
  waveformUrl: string | null;
  comment_count: bigint;
  like_count: bigint;
  play_count: bigint;
  activity_at: Date;
  action: 'post' | 'repost';
  actor_username: string;
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
    g.label                   AS genre,
    t."durationSeconds"       AS "durationSeconds",
    t."coverUrl"              AS "coverUrl",
    t."waveformUrl"           AS "waveformUrl",
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
    ) AS play_count
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
        r."createdAt"          AS activity_at,
        'repost'::text         AS action,
        COALESCE(u_reposter."displayName", u_reposter.username) AS actor_username
      FROM "Repost" r
      JOIN "Track" t          ON r."trackId" = t.id
      JOIN "User"  u_owner    ON t."userId"  = u_owner.id
      JOIN "User"  u_reposter ON r."userId"  = u_reposter.id
      LEFT JOIN "Genre" g     ON t."genreId" = g.id
      WHERE r."userId" = ANY($1::text[])
        AND ${trackFilters}
    `
      : '';

    const sinceFilter = sinceTimestamp
      ? `AND activity_at > $3::timestamptz`
      : '';
    const pagination = sinceTimestamp ? '' : `LIMIT $2 OFFSET ${skip}`;

    const query = `
    SELECT * FROM (
      SELECT
        ${trackColumns},
        t."createdAt"          AS activity_at,
        'post'::text           AS action,
        COALESCE(u_owner."displayName", u_owner.username) AS actor_username
      FROM "Track" t
      JOIN "User"  u_owner ON t."userId"  = u_owner.id
      LEFT JOIN "Genre" g  ON t."genreId" = g.id
      WHERE t."userId" = ANY($1::text[])
        AND ${trackFilters}

      ${repostUnion}
    ) AS feed
    WHERE 1=1 ${sinceFilter}
    ORDER BY activity_at DESC
    ${pagination}
  `;

    const params: unknown[] = sinceTimestamp
      ? [followedIds, limit, sinceTimestamp]
      : [followedIds, limit];

    const rows = (await this.prisma.$queryRawUnsafe<RawFeedRow[]>(
      query,
      ...params,
    )) as RawFeedRow[];

    const trackIds = rows.map((r) => r.id);

    const [likedSet, repostedSet] = await Promise.all([
      this.prisma.trackLike
        .findMany({
          where: { userId, trackId: { in: trackIds } },
          select: { trackId: true },
        })
        .then((likes) => new Set(likes.map((l) => l.trackId))),
      this.prisma.repost
        .findMany({
          where: { userId, trackId: { in: trackIds } },
          select: { trackId: true },
        })
        .then((reposts) => new Set(reposts.map((r) => r.trackId))),
    ]);

    const items: FeedPostDto[] = rows.map((row) => ({
      id: row.id,
      action: {
        username: row.actor_username,
        action: row.action,
        date: row.activity_at.toISOString(),
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
}
