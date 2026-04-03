import { Test, TestingModule } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TrendingType, TrendingPeriod } from './dto/trending.dto';

// ── Mock Prisma ─────────────────────────────────────────────
const mockPrisma = {
  follow: {
    findMany: jest.fn(),
  },
  trackLike: {
    findMany: jest.fn(),
  },
  repost: {
    findMany: jest.fn(),
  },
  playHistory: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  track: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

describe('FeedService', () => {
  let service: FeedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getFeed ───────────────────────────────────────────────
  describe('getFeed', () => {
    it('should return empty feed when user follows no one', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should return feed items with computed fields (likes, reposts, avatar)', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'track-1',
          title: 'Track',
          artist: 'Artist',
          genre: 'Hip Hop',
          durationSeconds: 120,
          coverUrl: null,
          waveformUrl: null,
          comment_count: BigInt(2),
          like_count: BigInt(5),
          play_count: BigInt(10),
          repost_count: BigInt(3), // ✅ NEW
          activity_at: new Date(),
          action: 'post',
          actor_username: 'user2',
          actor_avatar: 'avatar.png', // ✅ NEW
        },
      ]);

      mockPrisma.trackLike.findMany.mockResolvedValue([{ trackId: 'track-1' }]);

      mockPrisma.repost.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 1, 10);

      expect(result.items).toHaveLength(1);

      const item = result.items[0];

      expect(item.isLiked).toBe(true);
      expect(item.numberOfLikes).toBe(5);

      // ✅ NEW assertions
      expect(item.numberOfReposts).toBe(3);
      expect(item.action.avatarUrl).toBe('avatar.png');
    });

    it('should handle null avatar correctly', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'track-1',
          title: 'Track',
          artist: 'Artist',
          genre: null,
          durationSeconds: 120,
          coverUrl: null,
          waveformUrl: null,
          comment_count: BigInt(0),
          like_count: BigInt(0),
          play_count: BigInt(0),
          repost_count: BigInt(0),
          activity_at: new Date(),
          action: 'post',
          actor_username: 'user2',
          actor_avatar: null,
        },
      ]);

      mockPrisma.trackLike.findMany.mockResolvedValue([]);
      mockPrisma.repost.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1');

      expect(result.items[0].action.avatarUrl).toBeNull();
    });

    it('should correctly map repost action and isReposted flag', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'track-1',
          title: 'Track',
          artist: 'Artist',
          genre: null,
          durationSeconds: 120,
          coverUrl: null,
          waveformUrl: null,
          comment_count: BigInt(0),
          like_count: BigInt(0),
          play_count: BigInt(0),
          repost_count: BigInt(1),
          activity_at: new Date(),
          action: 'repost',
          actor_username: 'user2',
          actor_avatar: 'avatar.png',
        },
      ]);

      mockPrisma.trackLike.findMany.mockResolvedValue([]);
      mockPrisma.repost.findMany.mockResolvedValue([{ trackId: 'track-1' }]);

      const result = await service.getFeed('user-1');

      const item = result.items[0];

      expect(item.action.action).toBe('repost');
      expect(item.isReposted).toBe(true);
    });

    it('should correctly calculate hasMore', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue(
        Array(10).fill({
          id: 'track-1',
          title: 'Track',
          artist: 'Artist',
          genre: null,
          durationSeconds: 120,
          coverUrl: null,
          waveformUrl: null,
          comment_count: BigInt(0),
          like_count: BigInt(0),
          play_count: BigInt(0),
          repost_count: BigInt(0),
          activity_at: new Date(),
          action: 'post',
          actor_username: 'user2',
          actor_avatar: null,
        }),
      );

      mockPrisma.trackLike.findMany.mockResolvedValue([]);
      mockPrisma.repost.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 1, 10);

      expect(result.hasMore).toBe(true);
    });
  });

  // ── getTrending ───────────────────────────────────────────
  describe('getTrending', () => {
    it('should return trending tracks', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'track-1',
          name: 'Track',
          artist: 'Artist',
          coverUrl: null,
          score: BigInt(100),
        },
      ]);

      const result = await service.getTrending({
        type: TrendingType.TRACK,
        period: TrendingPeriod.WEEK,
      });

      expect(result.items[0].score).toBe(100);
      expect(result.type).toBe(TrendingType.TRACK);
    });

    it('should return trending collections', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Album',
          artist: 'Artist',
          coverUrl: null,
          score: BigInt(50),
        },
      ]);

      const result = await service.getTrending({
        type: TrendingType.ALBUM,
        period: TrendingPeriod.MONTH,
      });

      expect(result.items[0].score).toBe(50);
    });
  });

  // ── getDiscover ───────────────────────────────────────────
  describe('getDiscover', () => {
    it('should fallback to recent uploads when no user', async () => {
      mockPrisma.track.findMany.mockResolvedValue([]);
      mockPrisma.track.count.mockResolvedValue(0);

      const result = await service.getDiscover({ page: 1, limit: 10 });

      expect(result.personalized).toBe(false);
    });

    it('should fallback when user has no history', async () => {
      mockPrisma.playHistory.findFirst.mockResolvedValue(null);
      mockPrisma.track.findMany.mockResolvedValue([]);
      mockPrisma.track.count.mockResolvedValue(0);

      const result = await service.getDiscover(
        { page: 1, limit: 10 },
        'user-1',
      );

      expect(result.personalized).toBe(false);
    });

    it('should return personalized results when user has history', async () => {
      mockPrisma.playHistory.findFirst.mockResolvedValue({ id: '1' });

      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ genreId: 'g1' }]);

      mockPrisma.playHistory.findMany.mockResolvedValue([]);

      mockPrisma.track.findMany.mockResolvedValue([
        {
          id: 'track-1',
          title: 'Track',
          coverUrl: null,
          waveformUrl: null,
          durationSeconds: 120,
          createdAt: new Date(),
          user: { username: 'u', displayName: null },
          genre: { label: 'Hip Hop' },
        },
      ]);

      mockPrisma.track.count.mockResolvedValue(1);

      const result = await service.getDiscover(
        { page: 1, limit: 10 },
        'user-1',
      );

      expect(result.personalized).toBe(true);
      expect(result.items).toHaveLength(1);
    });
  });

  // ── getSuggestedArtists ─────────────────────────────────────
  describe('getSuggestedArtists', () => {
    const mockArtist = {
      id: 'artist-1',
      username: 'artist1',
      displayName: 'Artist One',
      avatarUrl: null,
      isCertified: false,
      _count: {
        followers: 10,
        tracks: 5,
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty list when no artists available', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getSuggestedArtists(1, 10, 'user-1');

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should exclude followed artists and self', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([
        { followingId: 'artist-2' },
      ]);

      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'artist-2', plays: 50 }, // should be excluded
        { userId: 'artist-3', plays: 40 },
      ]);

      mockPrisma.user.findMany
        // first call → remaining artists
        .mockResolvedValueOnce([{ id: 'artist-4' }])
        // second call → final artist fetch
        .mockResolvedValueOnce([
          { ...mockArtist, id: 'artist-3' },
          { ...mockArtist, id: 'artist-4' },
        ]);

      const result = await service.getSuggestedArtists(1, 10, 'user-1');

      expect(result.items.find((a) => a.id === 'artist-2')).toBeUndefined();
      expect(result.items.find((a) => a.id === 'user-1')).toBeUndefined();
    });

    it('should prioritize listened artists over fallback artists', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([]);

      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'artist-1', plays: 100 }, // listened
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 'artist-2' }]) // fallback
        .mockResolvedValueOnce([
          { ...mockArtist, id: 'artist-1' },
          { ...mockArtist, id: 'artist-2' },
        ]);

      const result = await service.getSuggestedArtists(1, 10);

      expect(result.items[0].id).toBe('artist-1'); // listened first
      expect(result.items[1].id).toBe('artist-2');
    });

    it('should paginate results correctly', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'artist-1', plays: 100 },
        { userId: 'artist-2', plays: 90 },
        { userId: 'artist-3', plays: 80 },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([]) // no fallback
        .mockResolvedValueOnce([{ ...mockArtist, id: 'artist-2' }]);

      const result = await service.getSuggestedArtists(2, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('artist-2');
      expect(result.hasMore).toBe(true);
    });

    it('should return hasMore = false when last page reached', async () => {
      mockPrisma.follow.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'artist-1', plays: 100 },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...mockArtist, id: 'artist-1' }]);

      const result = await service.getSuggestedArtists(1, 10);

      expect(result.hasMore).toBe(false);
    });

    it('should handle undefined userId (no exclusions)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'artist-1', plays: 100 },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...mockArtist, id: 'artist-1' }]);

      const result = await service.getSuggestedArtists(1, 10);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('artist-1');
    });
  });
});
