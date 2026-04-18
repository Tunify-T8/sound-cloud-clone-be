import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TracksService } from './tracks.service';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search-index/search-index.service';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const OTHER_USER_ID = 'user-999';
const TRACK_ID = 'track-abc';

const baseTrack = {
  id: TRACK_ID,
  userId: USER_ID,
  title: 'Test Track',
  description: 'A test track',
  genreId: 'genre-1',
  subGenreId: null,
  isPublic: true,
  privateToken: null,
  contentWarning: false,
  releaseDate: null,
  transcodingStatus: 'finished' as const,
  audioUrl: 'https://cdn.example.com/audio.mp3',
  waveformUrl: 'https://cdn.example.com/waveform.json',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  durationSeconds: 200,
  fileFormat: 'mp3' as const,
  fileSizeBytes: 5000000,
  bitrateKbps: 320,
  sampleRateHz: 44100,
  requiresPremium: false,
  previewEnabled: false,
  previewStart: null,
  previewDuration: null,
  recordLabel: null,
  publisher: null,
  isrc: null,
  pLine: null,
  allowDownloads: false,
  allowOffline: false,
  includeInRSS: true,
  displayEmbedCode: true,
  enableAppPlayback: true,
  allowComments: true,
  showCommentsPublic: true,
  showInsightsPublic: false,
  isHidden: false,
  hiddenAt: null,
  hiddenBy: null,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  _count: {
    likes: 0,
    reposts: 0,
    comments: 0,
    playHistory: 0,
  },
};

const baseTrackWithRelations = {
  ...baseTrack,
  trackArtists: [],
  regionRestrictions: [],
  tags: [],
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'audio.mp3',
  encoding: '7bit',
  mimetype: 'audio/mpeg',
  size: 5000000,
  buffer: Buffer.from('fake-audio-data'),
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
};

// ─── Mock factories ───────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  genre: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  subGenre: {
    findUnique: jest.fn(),
  },
  track: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  trackTag: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  trackArtist: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  trackRegionRestriction: {
    createMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  trackLike: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  repost: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  comment: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  playHistory: {
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeQueueMock = () => ({
  add: jest.fn().mockResolvedValue({}),
});

const makeSearchIndexMock = () => ({
  indexTrack: jest.fn().mockResolvedValue({}),
  updateTrack: jest.fn().mockResolvedValue({}),
  deleteTrack: jest.fn().mockResolvedValue({}),
  removeTrack: jest.fn().mockResolvedValue({}),
  search: jest.fn().mockResolvedValue([]),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TracksService', () => {
  let service: TracksService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let storage: { uploadImage: jest.Mock; uploadAudio: jest.Mock };
  let audio: { extractDuration: jest.Mock };
  let queue: ReturnType<typeof makeQueueMock>;
  let searchIndex: ReturnType<typeof makeSearchIndexMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    storage = { uploadImage: jest.fn(), uploadAudio: jest.fn() };
    audio = { extractDuration: jest.fn() };
    queue = makeQueueMock();
    searchIndex = makeSearchIndexMock();

    // Set default return values for commonly used mocks
    prisma.trackLike.findMany.mockResolvedValue([]);
    prisma.trackLike.count.mockResolvedValue(0);
    prisma.repost.findMany.mockResolvedValue([]);
    prisma.repost.count.mockResolvedValue(0);
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.comment.count.mockResolvedValue(0);
    prisma.playHistory.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.genre.upsert.mockResolvedValue({ id: 'genre-1', label: 'music_hiphop' });
    prisma.$transaction.mockResolvedValue([0, 0, 0, 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AudioService, useValue: audio },
        { provide: SearchIndexService, useValue: searchIndex },
        { provide: getQueueToken('tracks'), useValue: queue },
      ],
    }).compile();

    service = module.get<TracksService>(TracksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // create()
  // ══════════════════════════════════════════════════════════════════════════

  describe('create()', () => {
    const dto = {
      title: 'My Track',
      privacy: 'public' as const,
      genre: 'music_hiphop',
      tags: ['rap', 'beats'],
      artists: [],
      description: 'A cool track',
      contentWarning: false,
      availability: { type: 'worldwide' as const, regions: [] },
    };

    it('creates a public track and returns it with relations', async () => {
      prisma.genre.findUnique.mockResolvedValue({
        id: 'genre-1',
        label: 'music_hiphop',
      });
      prisma.track.create.mockResolvedValue({ ...baseTrack, id: TRACK_ID });
      prisma.trackTag.createMany.mockResolvedValue({ count: 2 });
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      const result = await service.create(USER_ID, dto);

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            title: 'My Track',
            isPublic: true,
            privateToken: null,
          }),
        }),
      );
      expect(prisma.trackTag.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: TRACK_ID, tag: 'rap' },
          { trackId: TRACK_ID, tag: 'beats' },
        ],
      });
      // Verify formatted response structure
      expect(result).toMatchObject({
        id: TRACK_ID,
        status: 'finished',
        privacy: 'public',
        artists: expect.any(Array),
        tags: expect.any(Array),
        contentWarning: false,
        audioUrl: expect.any(String),
        waveformUrl: expect.any(String),
      });
    });

    it('creates a private track with a privateToken', async () => {
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue({ ...baseTrack, isPublic: false });
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        isPublic: false,
      });

      const result = await service.create(USER_ID, { ...dto, privacy: 'private', genre: '' });

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublic: false,
            privateToken: expect.any(String),
          }),
        }),
      );
      // Verify response includes private flag
      expect(result).toMatchObject({
        privacy: 'private',
        status: 'finished',
      });
    });

    it('skips genre lookup when genre is not provided', async () => {
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, { ...dto, genre: '' });

      expect(prisma.genre.findUnique).not.toHaveBeenCalled();
    });

    it('creates featured artists when provided', async () => {
      const dtoWithArtists = { ...dto, artists: ['artist-1', 'artist-2'] };
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.trackArtist.create.mockResolvedValue({});
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, dtoWithArtists);

      expect(prisma.trackArtist.create).toHaveBeenCalledTimes(2);
      expect(prisma.trackArtist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'featured' }),
        }),
      );
    });

    it('creates region restrictions when availability type is specific_regions', async () => {
      const dtoWithRegions = {
        ...dto,
        availability: {
          type: 'specific_regions' as const,
          regions: ['US', 'CA'],
        },
      };
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);
      prisma.trackRegionRestriction.createMany.mockResolvedValue({ count: 2 });

      await service.create(USER_ID, dtoWithRegions);

      expect(prisma.trackRegionRestriction.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: TRACK_ID, countryCode: 'US' },
          { trackId: TRACK_ID, countryCode: 'CA' },
        ],
      });
    });

    it('does not create region restrictions for worldwide availability', async () => {
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, dto);

      expect(prisma.trackRegionRestriction.createMany).not.toHaveBeenCalled();
    });

    it('skips tag creation when tags array is empty', async () => {
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, { ...dto, tags: [] });

      expect(prisma.trackTag.createMany).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getMyTracks()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getMyTracks()', () => {
    it('returns formatted tracks for the user', async () => {
      const mockTracks = [
        {
          ...baseTrack,
          tags: [{ tag: 'hiphop' }],
          user: { username: 'testuser' },
          genre: { label: 'Hip-hop & Rap' },
          _count: { likes: 5, comments: 2, reposts: 1, playHistory: 10 },
        },
      ];

      // add findMany to your prisma mock
      prisma.track.findMany = jest.fn().mockResolvedValue(mockTracks);

      const result = await service.getMyTracks(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: TRACK_ID,
        title: 'Test Track',
        artist: 'testuser',
        genre: 'Hip-hop & Rap',
        tags: ['hiphop'],
        likes: 5,
        comments: 2,
        reposts: 1,
        plays: 10,
        isPrivate: false,
      });
    });

    it('returns empty array when user has no tracks', async () => {
      prisma.track.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getMyTracks(USER_ID);

      expect(result).toEqual([]);
    });

    it('handles track with no genre', async () => {
      const mockTracks = [
        {
          ...baseTrack,
          tags: [],
          user: { username: 'testuser' },
          genre: null,
          _count: { likes: 0, comments: 0, reposts: 0, playHistory: 0 },
        },
      ];
      prisma.track.findMany = jest.fn().mockResolvedValue(mockTracks);

      const result = await service.getMyTracks(USER_ID);

      expect(result[0].genre).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // uploadAudio()
  // ══════════════════════════════════════════════════════════════════════════

  describe('uploadAudio()', () => {
    it('updates the track and queues a processing job', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);

      const result = await service.uploadAudio(TRACK_ID, USER_ID, mockFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRACK_ID },
          data: expect.objectContaining({
            fileFormat: 'mp3',
            fileSizeBytes: mockFile.size,
            transcodingStatus: 'processing',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'process-track',
        expect.objectContaining({ trackId: TRACK_ID }),
      );
      expect(result).toEqual({
        message: 'Audio upload received, processing in background',
      });
    });

    it('sets fileFormat correctly for ogg files', async () => {
      const oggFile = { ...mockFile, originalname: 'audio.ogg' };
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);

      await service.uploadAudio(TRACK_ID, USER_ID, oggFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'ogg' }),
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadAudio(TRACK_ID, USER_ID, mockFile),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(
        service.uploadAudio(TRACK_ID, OTHER_USER_ID, mockFile),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets fileFormat to wav for wav files', async () => {
      const wavFile = { ...mockFile, originalname: 'audio.wav' };
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);

      await service.uploadAudio(TRACK_ID, USER_ID, wavFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'wav' }),
        }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getStatus()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getStatus()', () => {
    it('returns track status fields', async () => {
      const statusResult = {
        id: TRACK_ID,
        transcodingStatus: 'finished' as const,
        durationSeconds: 200,
        audioUrl: 'https://cdn.example.com/audio.mp3',
        waveformUrl: 'https://cdn.example.com/waveform.json',
      };
      prisma.track.findUnique.mockResolvedValue(statusResult);

      const result = await service.getStatus(TRACK_ID);

      expect(result).toEqual(statusResult);
      expect(prisma.track.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRACK_ID },
          select: expect.objectContaining({ transcodingStatus: true }),
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(TRACK_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrack()', () => {
    it('returns a formatted track object with genre and subgenre', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        subGenreId: 'sub-1',
        tags: [{ tag: 'rap' }],
      });
      prisma.genre.findUnique.mockResolvedValue({
        id: 'genre-1',
        label: 'music_hiphop',
        subgenres: [],
      });
      prisma.subGenre.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Trap',
        genreId: 'genre-1',
      });

      const result = await service.getTrack(TRACK_ID);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.genre).toEqual({
        category: 'music_hiphop',
        subGenre: 'Trap',
      });
      expect(result.tags).toEqual(['rap']);
      expect(result.privacy).toBe('public');
      expect(result.permissions).toBeDefined();
      expect(result.audioMetadata).toEqual({
        bitrateKbps: 320,
        sampleRateHz: 44100,
        format: 'mp3',
        fileSizeBytes: 5000000,
      });
    });

    it('returns null genre when track has no genreId', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        genreId: null,
      });

      const result = await service.getTrack(TRACK_ID);

      expect(result.genre).toBeNull();
      expect(prisma.genre.findUnique).not.toHaveBeenCalled();
    });

    it('returns private privacy for non-public tracks', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        isPublic: false,
        genreId: null,
      });

      const result = await service.getTrack(TRACK_ID);

      expect(result.privacy).toBe('private');
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrack(TRACK_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns subGenre as null when track has no subGenreId', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        subGenreId: null,
      });
      prisma.genre.findUnique.mockResolvedValue({
        id: 'genre-1',
        label: 'music_hiphop',
      });

      const result = await service.getTrack(TRACK_ID);

      expect(result.genre?.subGenre).toBeNull();
      expect(prisma.subGenre.findUnique).not.toHaveBeenCalled();
    });

    it('maps region restrictions into regions array', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        genreId: null,
        regionRestrictions: [{ countryCode: 'US' }, { countryCode: 'CA' }],
      });

      const result = await service.getTrack(TRACK_ID);

      expect(result.availability.regions).toEqual(['US', 'CA']);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('updateTrack()', () => {
    const trackWithRelations = {
      ...baseTrack,
      trackArtists: [],
      regionRestrictions: [],
    };

    const finalTrack = {
      ...baseTrackWithRelations,
      tags: [{ tag: 'newTag' }],
    };

    it('updates title and description and returns response', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations) // ownership check
        .mockResolvedValueOnce(finalTrack); // re-fetch after update
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      const result = await service.updateTrack(TRACK_ID, USER_ID, {
        title: 'New Title',
        description: 'New desc',
      });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'New Title',
            description: 'New desc',
          }),
        }),
      );
      expect(result.trackId).toBe(TRACK_ID);
      expect(result.tags).toEqual(['newTag']);
    });

    it('updates all permission fields', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, {
        permissions: {
          enableDirectDownloads: true,
          enableOfflineListening: true,
          includeInRSS: false,
          displayEmbedCode: false,
          enableAppPlayback: true,
          allowComments: false,
          showCommentsPublic: false,
          showInsightsPublic: true,
        },
      });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allowDownloads: true,
            allowOffline: true,
            includeInRSS: false,
            displayEmbedCode: false,
            enableAppPlayback: true,
            allowComments: false,
            showCommentsPublic: false,
            showInsightsPublic: true,
          }),
        }),
      );
    });

    it('updates region restrictions', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.trackRegionRestriction.deleteMany.mockResolvedValue({ count: 0 });
      prisma.trackRegionRestriction.create.mockResolvedValue({});

      await service.updateTrack(TRACK_ID, USER_ID, {
        availability: { type: 'specific_regions', regions: ['EG', 'US'] },
      });

      expect(prisma.trackRegionRestriction.deleteMany).toHaveBeenCalledWith({
        where: { trackId: TRACK_ID },
      });
      expect(prisma.trackRegionRestriction.create).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when track not found after update', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations) // ownership check passes
        .mockResolvedValueOnce(null); // re-fetch returns null
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTrack(TRACK_ID, USER_ID, { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('includes genre label in response', async () => {
      const finalTrackWithGenre = { ...finalTrack, genreId: 'genre-1' };
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrackWithGenre);
      prisma.track.update.mockResolvedValue(finalTrackWithGenre);
      prisma.genre.findUnique.mockResolvedValue({
        id: 'genre-1',
        label: 'Hip-hop & Rap',
      });

      const result = await service.updateTrack(TRACK_ID, USER_ID, {});

      expect(result.genre).toBe('Hip-hop & Rap');
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTrack(TRACK_ID, USER_ID, { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(trackWithRelations);

      await expect(
        service.updateTrack(TRACK_ID, OTHER_USER_ID, { title: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates privacy correctly', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, { privacy: 'private' });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPublic: false }),
        }),
      );
    });

    it('uploads artwork and sets coverUrl when artworkFile provided', async () => {
      const artworkFile = {
        ...mockFile,
        mimetype: 'image/jpeg',
        originalname: 'cover.jpg',
      };
      storage.uploadImage.mockResolvedValue(
        'https://cdn.example.com/cover-new.jpg',
      );

      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, {}, artworkFile);

      expect(storage.uploadImage).toHaveBeenCalledWith(artworkFile);
      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coverUrl: 'https://cdn.example.com/cover-new.jpg',
          }),
        }),
      );
    });

    it('replaces tags — deletes old then creates new', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.trackTag.deleteMany.mockResolvedValue({ count: 1 });
      prisma.trackTag.createMany.mockResolvedValue({ count: 2 });
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, {
        tags: ['Lo-Fi', 'Chill'],
      });

      expect(prisma.trackTag.deleteMany).toHaveBeenCalledWith({
        where: { trackId: TRACK_ID },
      });
      expect(prisma.trackTag.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: TRACK_ID, tag: 'lo-fi' },
          { trackId: TRACK_ID, tag: 'chill' },
        ],
      });
    });

    it('connects genre when valid genreId is provided', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.genre.findUnique.mockResolvedValue({
        id: 'genre-1',
        label: 'Rock',
      });
      prisma.track.update.mockResolvedValue(finalTrack);

      await service.updateTrack(TRACK_ID, USER_ID, { genre: 'genre-1' });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            genre: { connect: { id: 'genre-1' } },
          }),
        }),
      );
    });

    it('updates permissions fields', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, {
        permissions: {
          enableDirectDownloads: true,
          allowComments: false,
        },
      });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allowDownloads: true,
            allowComments: false,
          }),
        }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // deleteTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('deleteTrack()', () => {
    it('soft-deletes the track and returns success message', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue({
        ...baseTrack,
        isDeleted: true,
        deletedAt: expect.any(Date),
        deletedBy: USER_ID,
      });

      const result = await service.deleteTrack(TRACK_ID, USER_ID);

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: TRACK_ID },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
          deletedBy: USER_ID,
        },
      });
      expect(result).toEqual({ message: 'Track deleted successfully' });
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.deleteTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(
        service.deleteTrack(TRACK_ID, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets deletedAt to current timestamp', async () => {
      const beforeDelete = new Date();
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue({
        ...baseTrack,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: USER_ID,
      });

      await service.deleteTrack(TRACK_ID, USER_ID);

      const callArgs = prisma.track.update.mock.calls[0][0];
      expect(callArgs.data.deletedAt.getTime()).toBeGreaterThanOrEqual(
        beforeDelete.getTime(),
      );
    });

    it('sets deletedBy to the user performing the deletion', async () => {
      const trackOwnedByOther = { ...baseTrack, userId: OTHER_USER_ID };
      prisma.track.findUnique.mockResolvedValue(trackOwnedByOther);
      prisma.track.update.mockResolvedValue({
        ...trackOwnedByOther,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: OTHER_USER_ID,
      });

      await service.deleteTrack(TRACK_ID, OTHER_USER_ID);

      const callArgs = prisma.track.update.mock.calls[0][0];
      expect(callArgs.data.deletedBy).toBe(OTHER_USER_ID);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // replaceAudio()
  // ══════════════════════════════════════════════════════════════════════════

  describe('replaceAudio()', () => {
    const proSubscription = {
      id: 'sub-1',
      userId: USER_ID,
      planType: 'PRO',
      startedAt: new Date(),
      endedAt: null,
    };

    it('replaces audio, queues job, and returns updated track info', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue(
        'https://cdn.example.com/new-audio.mp3',
      );
      audio.extractDuration.mockResolvedValue(180);
      prisma.track.update.mockResolvedValue({
        ...baseTrack,
        audioUrl: 'https://cdn.example.com/new-audio.mp3',
        durationSeconds: 180,
        transcodingStatus: 'processing',
      });

      const result = await service.replaceAudio(TRACK_ID, USER_ID, mockFile);

      expect(storage.uploadAudio).toHaveBeenCalledWith(mockFile);
      expect(audio.extractDuration).toHaveBeenCalledWith(
        mockFile.buffer,
        'mp3',
      );
      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audioUrl: 'https://cdn.example.com/new-audio.mp3',
            durationSeconds: 180,
            transcodingStatus: 'processing',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'process-track',
        expect.objectContaining({ trackId: TRACK_ID }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          trackId: TRACK_ID,
          status: 'processing',
          audioUrl: 'https://cdn.example.com/new-audio.mp3',
        }),
      );
    });

    it('throws ForbiddenException when user has no PRO or GOPLUS subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.replaceAudio(TRACK_ID, USER_ID, mockFile),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(
        service.replaceAudio(TRACK_ID, USER_ID, mockFile),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(
        service.replaceAudio(TRACK_ID, OTHER_USER_ID, mockFile),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets fileFormat to wav for wav files', async () => {
      const wavFile = { ...mockFile, originalname: 'audio.wav' };
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue(
        'https://cdn.example.com/audio.wav',
      );
      audio.extractDuration.mockResolvedValue(200);
      prisma.track.update.mockResolvedValue({
        ...baseTrack,
        fileFormat: 'wav',
      });

      await service.replaceAudio(TRACK_ID, USER_ID, wavFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'wav' }),
        }),
      );
    });

    it('works for GOPLUS subscribers as well', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        ...proSubscription,
        planType: 'GOPLUS',
      });
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue(
        'https://cdn.example.com/audio.mp3',
      );
      audio.extractDuration.mockResolvedValue(200);
      prisma.track.update.mockResolvedValue(baseTrack);

      await expect(
        service.replaceAudio(TRACK_ID, USER_ID, mockFile),
      ).resolves.not.toThrow();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // likeTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('likeTrack()', () => {
    it('creates a like and returns track info with updated count', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { likes: 5 } });
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.trackLike.create.mockResolvedValue({
        id: 'like-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      const result = await service.likeTrack(TRACK_ID, USER_ID);

      expect(prisma.track.findUnique).toHaveBeenCalledWith({
        where: { id: TRACK_ID, isDeleted: false },
      });
      expect(prisma.trackLike.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: USER_ID } },
          track: { connect: { id: TRACK_ID } },
        },
      });
      expect(result.message).toBe('Track liked successfully');
      expect(result.data.likesCount).toBe(5);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('throws ForbiddenException when user already liked the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.findFirst.mockResolvedValue({
        id: 'like-existing',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'You already liked this track'
      );
    });

    it('throws NotFoundException if track not found after liking', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce(null);
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.trackLike.create.mockResolvedValue({
        id: 'like-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'Track not found after liking'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // unlikeTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('unlikeTrack()', () => {
    it('deletes a like and returns track info with updated count', async () => {
      const existingLike = { id: 'like-1', trackId: TRACK_ID, userId: USER_ID };
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { likes: 4 } });
      prisma.trackLike.findFirst.mockResolvedValue(existingLike);
      prisma.trackLike.delete.mockResolvedValue(existingLike);

      const result = await service.unlikeTrack(TRACK_ID, USER_ID);

      expect(prisma.trackLike.delete).toHaveBeenCalledWith({
        where: { id: 'like-1' },
      });
      expect(result.message).toBe('Track unliked successfully');
      expect(result.data.likesCount).toBe(4);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.unlikeTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('throws ForbiddenException when user has not liked the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.findFirst.mockResolvedValue(null);

      await expect(service.unlikeTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'You have not liked this track'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrackLikes()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrackLikes()', () => {
    it('returns paginated likes with user information', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.count.mockResolvedValue(25);
      prisma.trackLike.findMany.mockResolvedValue([
        {
          id: 'like-1',
          trackId: TRACK_ID,
          userId: 'user-1',
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'liker1',
            avatarUrl: 'https://example.com/avatar1.jpg',
          },
        },
      ]);

      const result = await service.getTrackLikes(TRACK_ID, 1, 20);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.title).toBe('Test Track');
      expect(result.likes).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrackLikes(TRACK_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('validates and constrains pagination parameters', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.count.mockResolvedValue(0);
      prisma.trackLike.findMany.mockResolvedValue([]);

      // Request with limit > 100 (should cap at 100)
      await service.getTrackLikes(TRACK_ID, 1, 200);

      expect(prisma.trackLike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('indicates hasPreviousPage when not on first page', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.count.mockResolvedValue(100);
      prisma.trackLike.findMany.mockResolvedValue([]);

      const result = await service.getTrackLikes(TRACK_ID, 3, 20);

      expect(result.hasPreviousPage).toBe(true);
      expect(result.hasNextPage).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // repostTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('repostTrack()', () => {
    it('creates a repost and returns track info with updated count', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { reposts: 3 } });
      prisma.repost.findFirst.mockResolvedValue(null);
      prisma.repost.create.mockResolvedValue({
        id: 'repost-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      const result = await service.repostTrack(TRACK_ID, USER_ID);

      expect(prisma.repost.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: USER_ID } },
          track: { connect: { id: TRACK_ID } },
        },
      });
      expect(result.message).toBe('Track reposted successfully');
      expect(result.data.repostsCount).toBe(3);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.repostTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('throws ForbiddenException when user already reposted the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.findFirst.mockResolvedValue({
        id: 'repost-existing',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      await expect(service.repostTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'You already reposted this track'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // unrepostTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('unrepostTrack()', () => {
    it('deletes a repost and returns track info with updated count', async () => {
      const existingRepost = {
        id: 'repost-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      };
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { reposts: 2 } });
      prisma.repost.findFirst.mockResolvedValue(existingRepost);
      prisma.repost.delete.mockResolvedValue(existingRepost);

      const result = await service.unrepostTrack(TRACK_ID, USER_ID);

      expect(prisma.repost.delete).toHaveBeenCalledWith({
        where: { id: 'repost-1' },
      });
      expect(result.message).toBe('Track unreposted successfully');
      expect(result.data.repostsCount).toBe(2);
    });

    it('throws ForbiddenException when user has not reposted the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.findFirst.mockResolvedValue(null);

      await expect(service.unrepostTrack(TRACK_ID, USER_ID)).rejects.toThrow(
        'You have not reposted this track'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrackReposts()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrackReposts()', () => {
    it('returns paginated reposts with user information', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.count.mockResolvedValue(10);
      prisma.repost.findMany.mockResolvedValue([
        {
          id: 'repost-1',
          trackId: TRACK_ID,
          userId: 'user-1',
          createdAt: new Date(),
          user: {
            id: 'user-1',
            username: 'reposter1',
            avatarUrl: 'https://example.com/avatar1.jpg',
          },
        },
      ]);

      const result = await service.getTrackReposts(TRACK_ID, 1, 20);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.reposts).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.total).toBe(10);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrackReposts(TRACK_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('correctly calculates pagination', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.count.mockResolvedValue(100);
      prisma.repost.findMany.mockResolvedValue(
        Array(20).fill(null).map((_, i) => ({
          id: `repost-${i}`,
          trackId: TRACK_ID,
          userId: `user-${i}`,
          createdAt: new Date(),
          user: {
            id: `user-${i}`,
            username: `user${i}`,
            avatarUrl: `https://example.com/avatar${i}.jpg`,
          },
        }))
      );

      const result = await service.getTrackReposts(TRACK_ID, 2, 20);

      expect(prisma.repost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (2-1) * 20
          take: 20,
        })
      );
      expect(result.page).toBe(2);
      expect(result.hasPreviousPage).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // addComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('addComment()', () => {
    it('creates a comment and returns comment info with total count', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.create.mockResolvedValue({
        id: 'comment-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        content: 'Great track!',
        timestamp: 30,
        parentCommentId: null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        username: 'commenter',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      prisma.comment.count.mockResolvedValue(5);

      const result = await service.addComment(
        TRACK_ID,
        USER_ID,
        'Great track!',
        30
      );

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          trackId: TRACK_ID,
          content: 'Great track!',
          timestamp: 30,
        },
      });
      expect(result.comment.text).toBe('Great track!');
      expect(result.comment.username).toBe('commenter');
      expect(result.commentsCount).toBe(5);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(
        service.addComment(TRACK_ID, USER_ID, 'text', 0)
      ).rejects.toThrow('Track not found');
    });

    it('returns Unknown username when user not found', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.create.mockResolvedValue({
        id: 'comment-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        content: 'text',
        timestamp: 0,
        parentCommentId: null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.comment.count.mockResolvedValue(1);

      const result = await service.addComment(
        TRACK_ID,
        USER_ID,
        'text',
        0
      );

      expect(result.comment.username).toBe('Unknown');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrackComments()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrackComments()', () => {
    it('returns paginated comments with metadata', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.count.mockResolvedValue(15);
      
      // Return all 15 comments so hasNextPage calculation works correctly
      const mockComments = Array(15).fill(null).map((_, i) => ({
        id: `comment-${i}`,
        trackId: TRACK_ID,
        userId: `user-${i % 3}`,
        content: `Comment ${i}`,
        timestamp: 30 + i,
        parentCommentId: null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { 
          id: `user-${i % 3}`, 
          username: `commenter${i % 3}`, 
          avatarUrl: null 
        },
        _count: { replies: i % 3, likes: i % 5 },
      }));
      
      prisma.comment.findMany.mockResolvedValue(mockComments);

      const result = await service.getTrackComments(TRACK_ID, 1, 20);

      expect(result.comments.length).toBe(15);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(15);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrackComments(TRACK_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('validates and constrains limit to max 100', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.count.mockResolvedValue(0);
      prisma.comment.findMany.mockResolvedValue([]);

      await service.getTrackComments(TRACK_ID, 1, 500);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getEngagementMetrics()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getEngagementMetrics()', () => {
    it('returns engagement metrics with user-specific flags', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.$transaction.mockResolvedValue([10, 5, 20, 100]);
      prisma.trackLike.findFirst
        .mockResolvedValueOnce({ id: 'like-1' })
        .mockResolvedValueOnce(null);
      prisma.repost.findFirst.mockResolvedValue(null);

      const result = await service.getEngagementMetrics(TRACK_ID, USER_ID);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.likesCount).toBe(10);
      expect(result.repostsCount).toBe(5);
      expect(result.commentsCount).toBe(20);
      expect(result.playsCount).toBe(100);
      expect(result.isLiked).toBe(true);
      expect(result.isReposted).toBe(false);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(
        service.getEngagementMetrics(TRACK_ID, USER_ID)
      ).rejects.toThrow('Track not found');
    });

    it('uses transaction for atomic count queries', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.$transaction.mockResolvedValue([0, 0, 0, 0]);
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.repost.findFirst.mockResolvedValue(null);

      await service.getEngagementMetrics(TRACK_ID, USER_ID);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.any(Promise),
        expect.any(Promise),
        expect.any(Promise),
        expect.any(Promise),
      ]);
    });

    it('correctly evaluates isLiked and isReposted flags', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.$transaction.mockResolvedValue([5, 3, 10, 50]);
      prisma.trackLike.findFirst.mockResolvedValue({
        id: 'like-1',
        trackId: TRACK_ID,
        userId: USER_ID,
      });
      prisma.repost.findFirst.mockResolvedValue({
        id: 'repost-1',
        trackId: TRACK_ID,
        userId: USER_ID,
      });

      const result = await service.getEngagementMetrics(TRACK_ID, USER_ID);

      expect(result.isLiked).toBe(true);
      expect(result.isReposted).toBe(true);
    });
  });
});
