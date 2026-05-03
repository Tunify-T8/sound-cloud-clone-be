import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';
import { SEARCH_INDEXES } from './constants/search.constants';
import {
  GlobalSearchDto,
  SearchTracksDto,
  SearchCollectionsDto,
  SearchPeopleDto,
  TrackSearchResultDto,
  CollectionSearchResultDto,
  UserSearchResultDto,
  CollectionTrackPreviewDto,
  PaginatedSearchResultDto,
  PaginatedTrackSearchDto,
  PaginatedCollectionSearchDto,
  PaginatedUserSearchDto,
  TimeAdded,
  DurationFilter,
  PeopleSort,
  AutocompleteResultDto,
} from './dto/search.dto';

interface OpenSearchHit<T> {
  _id: string;
  _score: number;
  _source: T;
}

interface OpenSearchResponse<T> {
  hits: {
    total: { value: number };
    hits: OpenSearchHit<T>[];
  };
}

interface TrackSource {
  title: string;
  artistDisplayName: string | null;
  artistUsername: string;
  genre: string | null;
  durationSeconds: number;
  coverUrl: string | null;
  likesCount: number;
  playsCount: number;
  repostsCount: number;
  allowDownloads: boolean;
  createdAt: string;
}

interface CollectionSource {
  title: string;
  artistDisplayName: string | null;
  artistUsername: string;
  type: string;
  description: string | null;
  coverUrl: string | null;
  trackCount: number;
  createdAt: string;
}

interface UserSource {
  username: string;
  displayName: string | null;
  location: string | null;
  isCertified: boolean;
  followersCount: number;
  avatarUrl: string | null;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly openSearch: OpensearchService,
    private readonly prisma: PrismaService,
  ) {}

  // ── /search ───────────────────────────────────────────────────

  async globalSearch(
    dto: GlobalSearchDto,
    userId?: string,
  ): Promise<PaginatedSearchResultDto> {
    const { q, page = 1, limit = 20 } = dto;
    const from = (page - 1) * limit;

    const response = (await this.openSearch.search(
      [SEARCH_INDEXES.TRACKS, SEARCH_INDEXES.USERS, SEARCH_INDEXES.COLLECTIONS],
      {
        from,
        size: limit,
        query: {
          multi_match: {
            query: q,
            fields: [
              'title^3',
              'username^3',
              'displayName^2',
              'artistUsername^2',
              'artistDisplayName^2',
              'description',
              'genre',
              'tags',
            ],
            fuzziness: 'AUTO',
          },
        },
      },
    )) as OpenSearchResponse<TrackSource & CollectionSource & UserSource>;

    const hits = response.hits.hits;
    const total = response.hits.total.value;

    const data = await Promise.all(
      hits.map((hit) => this.mapGlobalHit(hit, userId)),
    );

    return { data, total, page, limit, hasMore: from + hits.length < total };
  }

  // ── /search/tracks ────────────────────────────────────────────

  async searchTracks(dto: SearchTracksDto): Promise<PaginatedTrackSearchDto> {
    const {
      q,
      page = 1,
      limit = 20,
      tag,
      timeAdded,
      duration,
      allowDownloads,
    } = dto;
    const from = (page - 1) * limit;

    const must: unknown[] = [
      {
        multi_match: {
          query: q,
          fields: [
            'title^3', // prefix matching on title
            'title.autocomplete^2',
            'artistUsername^2',
            'artistUsername.autocomplete',
            'artistDisplayName^2',
            'artistDisplayName.autocomplete',
            'description',
            'tags',
            'genre',
          ],
          fuzziness: 'AUTO',
        },
      },
    ];

    const filter: unknown[] = [];

    if (tag) filter.push({ term: { tags: tag } });
    if (allowDownloads !== undefined) filter.push({ term: { allowDownloads } });
    if (timeAdded && timeAdded !== TimeAdded.ALL_TIME) {
      filter.push({
        range: { createdAt: { gte: this.resolveTimeAdded(timeAdded) } },
      });
    }
    if (duration && duration !== DurationFilter.ANY) {
      filter.push({
        range: { durationSeconds: this.resolveDuration(duration) },
      });
    }

    const response = (await this.openSearch.search(SEARCH_INDEXES.TRACKS, {
      from,
      size: limit,
      query: { bool: { must, filter } },
    })) as OpenSearchResponse<TrackSource>;

    const hits = response.hits.hits;
    const total = response.hits.total.value;

    return {
      data: hits.map((hit) => this.mapTrackHit(hit)),
      total,
      page,
      limit,
      hasMore: from + hits.length < total,
    };
  }

  // ── /search/collections ───────────────────────────────────────

  async searchCollections(
    dto: SearchCollectionsDto,
  ): Promise<PaginatedCollectionSearchDto> {
    const { q, page = 1, limit = 20, type } = dto;
    const from = (page - 1) * limit;

    const must: unknown[] = [
      {
        multi_match: {
          query: q,
          fields: [
            'title^3',
            'artistUsername^2',
            'artistDisplayName^2',
            'description',
          ],
          fuzziness: 'AUTO',
        },
      },
    ];

    const filter: unknown[] = [];
    if (type) filter.push({ term: { type: type.toUpperCase() } });

    const response = (await this.openSearch.search(SEARCH_INDEXES.COLLECTIONS, {
      from,
      size: limit,
      query: { bool: { must, filter } },
    })) as OpenSearchResponse<CollectionSource>;

    const hits = response.hits.hits;
    const total = response.hits.total.value;

    const data = await Promise.all(
      hits.map((hit) => this.mapCollectionHit(hit)),
    );

    return { data, total, page, limit, hasMore: from + hits.length < total };
  }

  // ── /search/people ────────────────────────────────────────────

  async searchPeople(
    dto: SearchPeopleDto,
    userId?: string,
  ): Promise<PaginatedUserSearchDto> {
    const {
      q,
      page = 1,
      limit = 20,
      location,
      minFollowers,
      verifiedOnly,
      sort,
    } = dto;
    const from = (page - 1) * limit;

    const must: unknown[] = [
      {
        multi_match: {
          query: q,
          fields: [
            'username^3',
            'username.autocomplete^2',
            'displayName^2',
            'displayName.autocomplete',
          ],
          fuzziness: 'AUTO',
        },
      },
    ];

    const filter: unknown[] = [];
    if (location) filter.push({ term: { 'location.keyword': location } });
    if (verifiedOnly) filter.push({ term: { isCertified: true } });
    filter.push({ term: { isSuspended: false } });
    if (minFollowers !== undefined) {
      filter.push({ range: { followersCount: { gte: minFollowers } } });
    }

    const sortClause =
      sort === PeopleSort.FOLLOWERS
        ? [{ followersCount: { order: 'desc' } }, '_score']
        : ['_score'];

    const response = (await this.openSearch.search(SEARCH_INDEXES.USERS, {
      from,
      size: limit,
      query: { bool: { must, filter } },
      sort: sortClause,
    })) as OpenSearchResponse<UserSource>;

    const hits = response.hits.hits;
    const total = response.hits.total.value;

    // resolve isFollowing for all result user IDs in one query
    const resultUserIds = hits.map((h) => h._id);
    const followingSet = await this.resolveFollowingSet(userId, resultUserIds);

    return {
      data: hits.map((hit) => this.mapUserHit(hit, followingSet)),
      total,
      page,
      limit,
      hasMore: from + hits.length < total,
    };
  }

  // ── Mappers ───────────────────────────────────────────────────

  private mapTrackHit(hit: OpenSearchHit<TrackSource>): TrackSearchResultDto {
    return {
      id: hit._id,
      type: 'track',
      title: hit._source.title,
      artist: hit._source.artistDisplayName ?? hit._source.artistUsername,
      genre: hit._source.genre,
      durationSeconds: hit._source.durationSeconds,
      coverUrl: hit._source.coverUrl,
      likesCount: hit._source.likesCount,
      playsCount: hit._source.playsCount,
      repostsCount: hit._source.repostsCount,
      allowDownloads: hit._source.allowDownloads,
      createdAt: hit._source.createdAt,
      score: hit._score,
    };
  }

  private async mapCollectionHit(
    hit: OpenSearchHit<CollectionSource>,
  ): Promise<CollectionSearchResultDto> {
    const type = hit._source.type.toLowerCase() as 'album' | 'playlist';

    // fetch first 4 tracks for preview from Prisma
    const previewTracks = await this.prisma.collectionTrack.findMany({
      where: { collectionId: hit._id },
      orderBy: { position: 'asc' },
      take: 4,
      select: {
        track: {
          select: {
            id: true,
            title: true,
            durationSeconds: true,
            coverUrl: true,
            user: { select: { username: true, displayName: true } },
          },
        },
      },
    });

    const trackPreview: CollectionTrackPreviewDto[] = previewTracks.map(
      (ct) => ({
        id: ct.track.id,
        title: ct.track.title,
        artist: ct.track.user.displayName ?? ct.track.user.username,
        coverUrl: ct.track.coverUrl,
        durationSeconds: ct.track.durationSeconds,
      }),
    );

    return {
      id: hit._id,
      type,
      title: hit._source.title,
      artist: hit._source.artistDisplayName ?? hit._source.artistUsername,
      description: hit._source.description,
      coverUrl: hit._source.coverUrl,
      trackCount: hit._source.trackCount,
      trackPreview,
      createdAt: hit._source.createdAt,
      score: hit._score,
    };
  }

  private mapUserHit(
    hit: OpenSearchHit<UserSource>,
    followingSet: Set<string>,
  ): UserSearchResultDto {
    return {
      id: hit._id,
      type: 'user',
      username: hit._source.username,
      displayName: hit._source.displayName,
      location: hit._source.location,
      isCertified: hit._source.isCertified,
      followersCount: hit._source.followersCount,
      avatarUrl: hit._source.avatarUrl,
      isFollowing: followingSet.size > 0 ? followingSet.has(hit._id) : null,
      score: hit._score,
    };
  }

  private async mapGlobalHit(
    hit: OpenSearchHit<TrackSource & CollectionSource & UserSource>,
    userId?: string,
  ): Promise<
    TrackSearchResultDto | CollectionSearchResultDto | UserSearchResultDto
  > {
    const source = hit._source;
    if ('durationSeconds' in source)
      return this.mapTrackHit(hit as OpenSearchHit<TrackSource>);
    if ('followersCount' in source) {
      const followingSet = await this.resolveFollowingSet(userId, [hit._id]);
      return this.mapUserHit(hit as OpenSearchHit<UserSource>, followingSet);
    }
    return this.mapCollectionHit(hit as OpenSearchHit<CollectionSource>);
  }

  async autocomplete(q: string): Promise<AutocompleteResultDto> {
    // search_as_you_type works best with multi_match type: bool_prefix
    const makeQuery = (fields: string[]) => ({
      multi_match: {
        query: q,
        fields,
        fuzziness: 'AUTO',
      },
    });

    const [tracksRaw, usersRaw, collectionsRaw] = await Promise.all([
      this.openSearch.search(SEARCH_INDEXES.TRACKS, {
        size: 5,
        query: makeQuery([
          'title',
          'title.autocomplete',
          'artistUsername',
          'artistUsername.autocomplete',
        ]),
      }),
      this.openSearch.search(SEARCH_INDEXES.USERS, {
        size: 5,
        query: makeQuery([
          'username',
          'username.autocomplete',
          'displayName',
          'displayName.autocomplete',
        ]),
      }),
      this.openSearch.search(SEARCH_INDEXES.COLLECTIONS, {
        size: 5,
        query: makeQuery([
          'title',
          'title.autocomplete',
          'artistUsername',
          'artistUsername.autocomplete',
        ]),
      }),
    ]);

    const tracksRes = tracksRaw as OpenSearchResponse<TrackSource>;
    const usersRes = usersRaw as OpenSearchResponse<UserSource>;
    const collectionsRes =
      collectionsRaw as OpenSearchResponse<CollectionSource>;

    return {
      tracks: tracksRes.hits.hits.map((h) => ({
        id: h._id,
        title: h._source.title,
        artist: h._source.artistDisplayName ?? h._source.artistUsername,
        coverUrl: h._source.coverUrl,
      })),
      users: usersRes.hits.hits.map((h) => ({
        id: h._id,
        username: h._source.username,
        displayName: h._source.displayName,
        avatarUrl: h._source.avatarUrl,
      })),
      collections: collectionsRes.hits.hits.map((h) => ({
        id: h._id,
        title: h._source.title,
        artist: h._source.artistDisplayName ?? h._source.artistUsername,
        coverUrl: h._source.coverUrl,
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  // returns a Set of userIds that the current user follows, scoped to the provided IDs
  private async resolveFollowingSet(
    userId: string | undefined,
    targetIds: string[],
  ): Promise<Set<string>> {
    if (!userId || targetIds.length === 0) return new Set();

    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, followingId: { in: targetIds } },
      select: { followingId: true },
    });

    return new Set(follows.map((f) => f.followingId));
  }

  private resolveTimeAdded(timeAdded: TimeAdded): string {
    const map: Record<TimeAdded, string> = {
      [TimeAdded.PAST_HOUR]: 'now-1h/h',
      [TimeAdded.PAST_DAY]: 'now-1d/d',
      [TimeAdded.PAST_WEEK]: 'now-7d/d',
      [TimeAdded.PAST_MONTH]: 'now-1M/d',
      [TimeAdded.PAST_YEAR]: 'now-1y/d',
      [TimeAdded.ALL_TIME]: '',
    };
    return map[timeAdded];
  }

  private resolveDuration(duration: DurationFilter): Record<string, number> {
    const map: Record<DurationFilter, Record<string, number>> = {
      [DurationFilter.LT_2]: { lt: 120 },
      [DurationFilter.TWO_TEN]: { gte: 120, lt: 600 },
      [DurationFilter.TEN_THIRTY]: { gte: 600, lt: 1800 },
      [DurationFilter.GT_30]: { gte: 1800 },
      [DurationFilter.ANY]: {},
    };
    return map[duration];
  }
}
