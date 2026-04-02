import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexService } from './search-index.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';
import { SEARCH_INDEXES } from 'src/search/constants/search.constants';

// ── Mock Prisma ─────────────────────────────────────────────
const mockPrisma = {
  track: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  collection: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

// ── Mock OpenSearch ─────────────────────────────────────────
const mockOpenSearch = {
  indexExists: jest.fn(),
  createIndex: jest.fn(),
  indexDocument: jest.fn(),
  deleteDocument: jest.fn(),
  bulkIndex: jest.fn(),
};

describe('SearchIndexService', () => {
  let service: SearchIndexService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OpensearchService, useValue: mockOpenSearch },
      ],
    }).compile();

    service = module.get<SearchIndexService>(SearchIndexService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── initIndexes ───────────────────────────────────────────
  describe('initIndexes', () => {
    it('should create indexes if they do not exist', async () => {
      mockOpenSearch.indexExists.mockResolvedValue(false);

      await service.initIndexes();

      expect(mockOpenSearch.createIndex).toHaveBeenCalledTimes(3);
    });

    it('should not create indexes if they exist', async () => {
      mockOpenSearch.indexExists.mockResolvedValue(true);

      await service.initIndexes();

      expect(mockOpenSearch.createIndex).not.toHaveBeenCalled();
    });
  });

  // ── indexTrack ────────────────────────────────────────────
  describe('indexTrack', () => {
    it('should index track when valid', async () => {
      mockPrisma.track.findUnique.mockResolvedValue({
        id: 'track-1',
        title: 'Track',
        description: null,
        coverUrl: null,
        durationSeconds: 120,
        allowDownloads: true,
        createdAt: new Date(),
        isDeleted: false,
        isHidden: false,
        isPublic: true,
        tags: [{ tag: 'hiphop' }],
        genre: { label: 'Hip Hop' },
        user: {
          id: 'user-1',
          username: 'user',
          displayName: null,
          isCertified: false,
        },
        _count: { likes: 5, playHistory: 10, reposts: 2 },
      });

      await service.indexTrack('track-1');

      expect(mockOpenSearch.indexDocument).toHaveBeenCalledWith(
        SEARCH_INDEXES.TRACKS,
        'track-1',
        expect.objectContaining({
          title: 'Track',
          likesCount: 5,
          repostsCount: 2,
        }),
      );
    });

    it('should NOT index deleted track', async () => {
      mockPrisma.track.findUnique.mockResolvedValue({
        isDeleted: true,
      });

      await service.indexTrack('track-1');

      expect(mockOpenSearch.indexDocument).not.toHaveBeenCalled();
    });
  });

  // ── removeTrack ───────────────────────────────────────────
  it('should delete track document', async () => {
    await service.removeTrack('track-1');

    expect(mockOpenSearch.deleteDocument).toHaveBeenCalledWith(
      SEARCH_INDEXES.TRACKS,
      'track-1',
    );
  });

  // ── reindexAllTracks ──────────────────────────────────────
  describe('reindexAllTracks', () => {
    it('should bulk index tracks', async () => {
      mockPrisma.track.findMany.mockResolvedValue([{ id: 't1' }]);

      mockPrisma.track.findUnique.mockResolvedValue({
        id: 't1',
        title: 'Track',
        description: null,
        coverUrl: null,
        durationSeconds: 120,
        allowDownloads: true,
        createdAt: new Date(),
        tags: [],
        genre: null,
        user: {
          id: 'u1',
          username: 'user',
          displayName: null,
          isCertified: false,
        },
        _count: { likes: 1, playHistory: 2 },
      });

      await service.reindexAllTracks();

      expect(mockOpenSearch.bulkIndex).toHaveBeenCalled();
    });
  });

  // ── indexUser ─────────────────────────────────────────────
  describe('indexUser', () => {
    it('should index user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'user',
        displayName: null,
        location: null,
        isCertified: false,
        role: 'LISTENER',
        createdAt: new Date(),
        _count: { followers: 10 },
      });

      await service.indexUser('u1');

      expect(mockOpenSearch.indexDocument).toHaveBeenCalledWith(
        SEARCH_INDEXES.USERS,
        'u1',
        expect.objectContaining({
          followersCount: 10,
        }),
      );
    });

    it('should not index if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.indexUser('u1');

      expect(mockOpenSearch.indexDocument).not.toHaveBeenCalled();
    });
  });

  // ── reindexAllUsers ───────────────────────────────────────
  it('should bulk index users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        username: 'user',
        displayName: null,
        bio: null,
        location: null,
        isCertified: false,
        role: 'LISTENER',
        createdAt: new Date(),
        _count: { followers: 5 },
      },
    ]);

    await service.reindexAllUsers();

    expect(mockOpenSearch.bulkIndex).toHaveBeenCalled();
  });

  // ── indexCollection ───────────────────────────────────────
  describe('indexCollection', () => {
    it('should index collection', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'Album',
        description: null,
        type: 'ALBUM',
        coverUrl: null,
        createdAt: new Date(),
        isDeleted: false,
        isPublic: true,
        user: { id: 'u1', username: 'user', displayName: null },
        _count: { tracks: 3 },
      });

      await service.indexCollection('c1');

      expect(mockOpenSearch.indexDocument).toHaveBeenCalledWith(
        SEARCH_INDEXES.COLLECTIONS,
        'c1',
        expect.objectContaining({
          trackCount: 3,
        }),
      );
    });

    it('should not index deleted collection', async () => {
      mockPrisma.collection.findUnique.mockResolvedValue({
        isDeleted: true,
      });

      await service.indexCollection('c1');

      expect(mockOpenSearch.indexDocument).not.toHaveBeenCalled();
    });
  });

  // ── reindexAllCollections ─────────────────────────────────
  it('should bulk index collections', async () => {
    mockPrisma.collection.findMany.mockResolvedValue([
      {
        id: 'c1',
        title: 'Album',
        description: null,
        type: 'ALBUM',
        coverUrl: null,
        createdAt: new Date(),
        user: { id: 'u1', username: 'user', displayName: null },
      },
    ]);

    await service.reindexAllCollections();

    expect(mockOpenSearch.bulkIndex).toHaveBeenCalled();
  });
});
