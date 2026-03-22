import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TracksService } from './tracks.service';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';

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
  user: {
    findUnique: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
});

const makeQueueMock = () => ({
  add: jest.fn().mockResolvedValue({}),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TracksService', () => {
  let service: TracksService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let storage: { uploadImage: jest.Mock; uploadAudio: jest.Mock };
  let audio: { extractDuration: jest.Mock };
  let queue: ReturnType<typeof makeQueueMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    storage = { uploadImage: jest.fn(), uploadAudio: jest.fn() };
    audio = { extractDuration: jest.fn() };
    queue = makeQueueMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AudioService, useValue: audio },
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
      expect(result).toEqual(baseTrackWithRelations);
    });

    it('creates a private track with a privateToken', async () => {
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.track.create.mockResolvedValue({ ...baseTrack, isPublic: false });
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        isPublic: false,
      });

      await service.create(USER_ID, { ...dto, privacy: 'private', genre: '' });

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublic: false,
            privateToken: expect.any(String),
          }),
        }),
      );
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
    it('deletes the track and returns success message', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.delete.mockResolvedValue(baseTrack);

      const result = await service.deleteTrack(TRACK_ID, USER_ID);

      expect(prisma.track.delete).toHaveBeenCalledWith({
        where: { id: TRACK_ID },
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
});
