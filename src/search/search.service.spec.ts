import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';

// ── Mocks ──────────────────────────────────────────────────
const mockOpenSearch = {
  search: jest.fn(),
};

const mockPrisma = {
  collectionTrack: {
    findMany: jest.fn(),
  },
  follow: {
    findMany: jest.fn(),
  },
};

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: OpensearchService, useValue: mockOpenSearch },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── globalSearch ──────────────────────────────────────────
  describe('globalSearch', () => {
    it('should return mapped results', async () => {
      mockOpenSearch.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 't1',
              _score: 1,
              _source: {
                title: 'Track',
                artistUsername: 'artist',
                durationSeconds: 120,
                likesCount: 5,
                playsCount: 10,
                repostsCount: 1,
                allowDownloads: true,
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      });

      const result = await service.globalSearch({ q: 'test' });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── searchTracks ──────────────────────────────────────────
  describe('searchTracks', () => {
    it('should return track results', async () => {
      mockOpenSearch.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 't1',
              _score: 1,
              _source: {
                title: 'Track',
                artistUsername: 'artist',
                artistDisplayName: null,
                genre: null,
                durationSeconds: 120,
                coverUrl: null,
                likesCount: 5,
                playsCount: 10,
                repostsCount: 1,
                allowDownloads: true,
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      });

      const result = await service.searchTracks({ q: 'test' });

      expect(result.data[0].id).toBe('t1');
      expect(result.hasMore).toBe(false);
    });
  });

  // ── searchCollections ─────────────────────────────────────
  describe('searchCollections', () => {
    it('should return collections with preview tracks', async () => {
      mockOpenSearch.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'c1',
              _score: 1,
              _source: {
                title: 'Album',
                artistUsername: 'artist',
                artistDisplayName: null,
                type: 'ALBUM',
                description: null,
                coverUrl: null,
                trackCount: 2,
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      });

      mockPrisma.collectionTrack.findMany.mockResolvedValue([
        {
          track: {
            id: 't1',
            title: 'Track',
            durationSeconds: 120,
            user: { username: 'u', displayName: null },
          },
        },
      ]);

      const result = await service.searchCollections({ q: 'test' });

      expect(result.data[0].trackPreview).toHaveLength(1);
    });
  });

  // ── searchPeople ──────────────────────────────────────────
  describe('searchPeople', () => {
    it('should return users with isFollowing', async () => {
      mockOpenSearch.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'u2',
              _score: 1,
              _source: {
                username: 'user',
                displayName: null,
                location: null,
                isCertified: false,
                followersCount: 10,
              },
            },
          ],
        },
      });

      mockPrisma.follow.findMany.mockResolvedValue([{ followingId: 'u2' }]);

      const result = await service.searchPeople({ q: 'user' }, 'u1');

      expect(result.data[0].isFollowing).toBe(true);
    });

    it('should return null isFollowing when no userId', async () => {
      mockOpenSearch.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'u2',
              _score: 1,
              _source: {
                username: 'user',
                displayName: null,
                location: null,
                isCertified: false,
                followersCount: 10,
              },
            },
          ],
        },
      });

      const result = await service.searchPeople({ q: 'user' });

      expect(result.data[0].isFollowing).toBeNull();
    });
  });
});
