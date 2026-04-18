import { Test, TestingModule } from '@nestjs/testing';
import { CollectionsService } from './collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SearchIndexService } from '../search-index/search-index.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CollectionType } from '@prisma/client';

describe('CollectionsService', () => {
  let service: CollectionsService;

  const mockPrisma = {
    collection: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    collectionTrack: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    collectionLike: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    track: {
      findFirst: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStorage = {
    uploadImage: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockSearchIndex = {
    indexCollection: jest.fn(),
    removeCollection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: SearchIndexService, useValue: mockSearchIndex },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
    jest.clearAllMocks();
  });

  // ─── CREATE COLLECTION ─────────────────────────────────────────
  describe('create', () => {
    const userId = 'u1';
    const dto = { title: 'My Playlist', description: '', type: CollectionType.PLAYLIST, privacy: 'public' as const };

    it('should throw BadRequest if free user exceeds collection limit', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.collection.count.mockResolvedValue(10);
      await expect(service.create(userId, dto, undefined)).rejects.toThrow(BadRequestException);
    });

    it('should throw Forbidden if non-artist tries to create album', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({ plan: { name: 'PRO' } });
      const albumDto = { ...dto, type: CollectionType.ALBUM };
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'LISTENER' });
      await expect(service.create(userId, albumDto, undefined)).rejects.toThrow(ForbiddenException);
    });

    it('should create a public playlist successfully', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({ plan: { name: 'PRO' } });
      const created = { id: 'c1', title: 'My Playlist', description: '', coverUrl: null, isPublic: true, type: CollectionType.PLAYLIST, secretToken: null, createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.collection.create.mockResolvedValue(created);
      mockSearchIndex.indexCollection.mockResolvedValue(null);

      const result = await service.create(userId, dto, undefined);
      expect(result).toEqual({
        id: created.id,
        title: created.title,
        description: created.description,
        type: created.type,
        privacy: 'public',
        secretToken: null,
        coverUrl: created.coverUrl,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
      expect(mockPrisma.collection.create).toHaveBeenCalledTimes(1);
    });

    it('should create a private playlist with a secretToken', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({ plan: { name: 'PRO' } });
      const privateDto = { ...dto, privacy: 'private' as const };
      const created = { id: 'c1', title: 'My Playlist', isPublic: false, secretToken: 'abc123', createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.collection.create.mockResolvedValue(created);

      const result = await service.create(userId, privateDto, undefined);
      expect(result.secretToken).toBeDefined();
    });
  });

  // ─── GET MY COLLECTIONS ────────────────────────────────────────
  describe('getMyCollections', () => {
    it('should return paginated collections', async () => {
      const collections = [
        { id: 'c1', title: 'P1', description: null, coverUrl: null, isPublic: true, type: CollectionType.PLAYLIST, secretToken: null, createdAt: new Date(), updatedAt: new Date(), _count: { tracks: 2, likes: 1 } },
      ];
      mockPrisma.collection.findMany.mockResolvedValue(collections);
      mockPrisma.collection.count.mockResolvedValue(1);

      const result = await service.getMyCollections('u1', 1, 10);
      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  // ─── GET COLLECTION BY ID ──────────────────────────────────────
  describe('getCollectionById', () => {
    it('should return public collection to anyone', async () => {
      const collection = { id: 'c1', isPublic: true, userId: 'u1', isDeleted: false, title: 'Test', description: null, type: CollectionType.PLAYLIST, coverUrl: null, createdAt: new Date(), updatedAt: new Date(), _count: { tracks: 1, likes: 0 }, user: { id: 'u1', username: 'test', displayName: 'Test User', avatarUrl: null } };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);

      const result = await service.getCollectionById('c1', 'u2');
      expect(result).toBeDefined();
    });

    it('should return private collection to owner', async () => {
      const collection = { id: 'c1', isPublic: false, userId: 'u1', isDeleted: false, title: 'Test', description: null, type: CollectionType.PLAYLIST, coverUrl: null, createdAt: new Date(), updatedAt: new Date(), _count: { tracks: 1, likes: 0 }, user: { id: 'u1', username: 'test', displayName: 'Test User', avatarUrl: null } };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);

      const result = await service.getCollectionById('c1', 'u1');
      expect(result).toBeDefined();
    });

    it('should throw 404 for private collection accessed by stranger', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.getCollectionById('c1', 'u2')).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.getCollectionById('nonexistent', undefined)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET COLLECTION BY TOKEN ───────────────────────────────────
  describe('getCollectionByToken', () => {
    it('should return collection for valid token', async () => {
      const collection = { id: 'c1', secretToken: 'tok123', isPublic: false, title: 'Test', description: null, type: CollectionType.PLAYLIST, coverUrl: null, createdAt: new Date(), updatedAt: new Date(), _count: { tracks: 1, likes: 0 }, user: { id: 'u1', username: 'test', displayName: 'Test User', avatarUrl: null } };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);

      const result = await service.getCollectionByToken('tok123');
      expect(result).toBeDefined();
    });

    it('should throw 404 for invalid token', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.getCollectionByToken('badtoken')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── UPDATE COLLECTION ─────────────────────────────────────────
  describe('updateCollection', () => {
    it('should update collection for owner', async () => {
      const collection = { id: 'c1', userId: 'u1', isDeleted: false, isPublic: true, secretToken: null, title: 'Old', description: null, type: CollectionType.PLAYLIST, coverUrl: null, createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collection.update.mockResolvedValue({ ...collection, title: 'Updated', updatedAt: new Date() });

      const result = await service.updateCollection('c1', 'u1', { title: 'Updated' }, undefined);
      expect(result.title).toBe('Updated');
    });

    it('should throw 404 if not owner', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.updateCollection('c1', 'u2', { title: 'X' }, undefined)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── DELETE COLLECTION ─────────────────────────────────────────
  describe('deleteCollection', () => {
    it('should delete collection for owner', async () => {
      const collection = { id: 'c1', userId: 'u1', isDeleted: false };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionLike.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.collectionTrack.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
      mockPrisma.collection.delete.mockResolvedValue(collection);

      const result = await service.deleteCollection('c1', 'u1');
      expect(result).toEqual({ message: 'Collection deleted successfully' });
    });

    it('should throw 404 if not owner', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.deleteCollection('c1', 'u2')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET COLLECTION TRACKS ─────────────────────────────────────
  describe('getCollectionTracks', () => {
    it('should return tracks for public collection', async () => {
      const collection = { id: 'c1', isPublic: true, userId: 'u1', isDeleted: false };
      mockPrisma.collection.findFirst.mockResolvedValue(collection);
      mockPrisma.collectionTrack.findMany.mockResolvedValue([
        { id: 'ct1', position: 1, addedAt: new Date(), track: { id: 't1', title: 'Track 1', coverUrl: null, durationSeconds: 180, isPublic: true, user: { id: 'u1', username: 'alfredo', avatarUrl: null } } },
      ]);
      mockPrisma.collectionTrack.count.mockResolvedValue(1);

      const result = await service.getCollectionTracks('c1', undefined, 1, 10);
      expect(result.data.length).toBe(1);
    });

    it('should throw 404 for private collection accessed by stranger', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.getCollectionTracks('c1', 'u2', 1, 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── ADD TRACK ─────────────────────────────────────────────────
  describe('addTrack', () => {
    const collectionId = 'c1';
    const userId = 'u1';
    const dto = { trackId: 't1' };

    it('should add track successfully', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: collectionId, userId, type: CollectionType.PLAYLIST, isDeleted: false });
      mockPrisma.track.findFirst.mockResolvedValue({ id: 't1', userId, isDeleted: false });
      mockPrisma.collectionTrack.findFirst.mockResolvedValue(null);
      mockPrisma.collectionTrack.aggregate.mockResolvedValue({ _max: { position: 2 } });
      mockPrisma.collectionTrack.create.mockResolvedValue({ id: 'ct1', collectionId, trackId: 't1', position: 3, addedAt: new Date() });

      const result = await service.addTrack(collectionId, userId, dto);
      expect(result.position).toBe(3);
    });

    it('should throw 404 if collection not found or not owner', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.addTrack(collectionId, userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 if track not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: collectionId, userId, type: CollectionType.PLAYLIST, isDeleted: false });
      mockPrisma.track.findFirst.mockResolvedValue(null);
      await expect(service.addTrack(collectionId, userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 if track already in collection', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: collectionId, userId, type: CollectionType.PLAYLIST, isDeleted: false });
      mockPrisma.track.findFirst.mockResolvedValue({ id: 't1', userId, isDeleted: false });
      mockPrisma.collectionTrack.findFirst.mockResolvedValue({ id: 'ct1' });
      await expect(service.addTrack(collectionId, userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 if album track does not belong to owner', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: collectionId, userId, type: CollectionType.ALBUM, isDeleted: false });
      mockPrisma.track.findFirst.mockResolvedValue({ id: 't1', userId: 'other-user', isDeleted: false });
      await expect(service.addTrack(collectionId, userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should set position to 1 if collection is empty', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: collectionId, userId, type: CollectionType.PLAYLIST, isDeleted: false });
      mockPrisma.track.findFirst.mockResolvedValue({ id: 't1', userId, isDeleted: false });
      mockPrisma.collectionTrack.findFirst.mockResolvedValue(null);
      mockPrisma.collectionTrack.aggregate.mockResolvedValue({ _max: { position: null } });
      mockPrisma.collectionTrack.create.mockResolvedValue({ id: 'ct1', collectionId, trackId: 't1', position: 1, addedAt: new Date() });

      const result = await service.addTrack(collectionId, userId, dto);
      expect(result.position).toBe(1);
    });
  });

  // ─── REMOVE TRACK ──────────────────────────────────────────────
  describe('removeTrack', () => {
    it('should remove track and re-normalize positions', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', isDeleted: false });
      mockPrisma.collectionTrack.findFirst.mockResolvedValue({ id: 'ct1', collectionId: 'c1', trackId: 't1' });
      mockPrisma.collectionTrack.delete.mockResolvedValue({ id: 'ct1' });
      mockPrisma.collectionTrack.findMany.mockResolvedValue([
        { id: 'ct2', position: 2 },
        { id: 'ct3', position: 3 },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.removeTrack('c1', 'u1', { trackId: 't1' });
      expect(result).toEqual({ message: 'Track removed successfully' });
    });

    it('should throw 404 if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.removeTrack('c1', 'u1', { trackId: 't1' })).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 if track not in collection', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', isDeleted: false });
      mockPrisma.collectionTrack.findFirst.mockResolvedValue(null);
      await expect(service.removeTrack('c1', 'u1', { trackId: 't1' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── REORDER TRACKS ────────────────────────────────────────────
  describe('reorderTracks', () => {
    it('should reorder tracks successfully', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', isDeleted: false });
      mockPrisma.collectionTrack.findMany.mockResolvedValue([
        { id: 'ct1', trackId: 't1' },
        { id: 'ct2', trackId: 't2' },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.reorderTracks('c1', 'u1', { trackIds: ['t2', 't1'] });
      expect(result).toEqual({ message: 'Tracks reordered successfully' });
    });

    it('should throw 404 if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.reorderTracks('c1', 'u1', { trackIds: ['t1'] })).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 if trackIds mismatch', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', isDeleted: false });
      mockPrisma.collectionTrack.findMany.mockResolvedValue([
        { id: 'ct1', trackId: 't1' },
        { id: 'ct2', trackId: 't2' },
      ]);
      await expect(service.reorderTracks('c1', 'u1', { trackIds: ['t1'] })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── LIKE COLLECTION ───────────────────────────────────────────
  describe('likeCollection', () => {
    it('should like collection successfully', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', isDeleted: false });
      mockPrisma.collectionLike.findFirst.mockResolvedValue(null);
      mockPrisma.collectionLike.create.mockResolvedValue({ id: 'l1' });

      const result = await service.likeCollection('c1', 'u1');
      expect(result).toEqual({ message: 'Collection liked' });
    });

    it('should throw 400 if already liked', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', isDeleted: false });
      mockPrisma.collectionLike.findFirst.mockResolvedValue({ id: 'l1' });
      await expect(service.likeCollection('c1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw 404 if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.likeCollection('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── UNLIKE COLLECTION ─────────────────────────────────────────
  describe('unlikeCollection', () => {
    it('should unlike collection successfully', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', isDeleted: false });
      mockPrisma.collectionLike.findFirst.mockResolvedValue({ id: 'l1' });
      mockPrisma.collectionLike.delete.mockResolvedValue({ id: 'l1' });

      const result = await service.unlikeCollection('c1', 'u1');
      expect(result).toEqual({ message: 'Collection unliked' });
    });

    it('should throw 404 if not liked', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', isDeleted: false });
      mockPrisma.collectionLike.findFirst.mockResolvedValue(null);
      await expect(service.unlikeCollection('c1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 if collection not found', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.unlikeCollection('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET EMBED ─────────────────────────────────────────────────
  describe('getEmbed', () => {
    it('should return embed code for public collection', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue({ id: 'c1', isPublic: true, isDeleted: false });

      const result = await service.getEmbed('c1');
      expect(result.embedCode).toContain('c1');
      expect(result.embedCode).toContain('<iframe');
    });

    it('should throw 404 for private collection', async () => {
      mockPrisma.collection.findFirst.mockResolvedValue(null);
      await expect(service.getEmbed('c1')).rejects.toThrow(NotFoundException);
    });
  });
});