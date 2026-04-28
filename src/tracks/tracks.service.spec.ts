import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TracksService } from './tracks.service';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  user: {
    username: 'testuser',
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
  },
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
    aggregate: jest.fn(),
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
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
  subscriptionPlan: {
    findUnique: jest.fn(),
  },
  follow: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  collectionTrack: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeQueueMock = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
});

const makeNotificationsMock = () => ({
  createNotification: jest.fn().mockResolvedValue(null),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TracksService', () => {
  let service: TracksService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let storage: {
    uploadImage: jest.Mock;
    uploadAudio: jest.Mock;
    getSignedUrl: jest.Mock;
    getSignedDownloadUrl: jest.Mock;
  };
  let audio: { extractDuration: jest.Mock };
  let queue: ReturnType<typeof makeQueueMock>;
  let notifications: ReturnType<typeof makeNotificationsMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    storage = {
      uploadImage: jest.fn(),
      uploadAudio: jest.fn(),
      getSignedUrl: jest.fn(),
      getSignedDownloadUrl: jest.fn(),
    };
    audio = { extractDuration: jest.fn() };
    queue = makeQueueMock();
    notifications = makeNotificationsMock();

    // ── Sane defaults for commonly hit mocks ──────────────────────────────────
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
    prisma.follow.count.mockResolvedValue(0);
    prisma.follow.findFirst.mockResolvedValue(null);
    prisma.collectionTrack.findFirst.mockResolvedValue(null);
    // Default: unlimited plan — skips quota enforcement in uploadAudio
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      plan: { monthlyUploadMinutes: -1, name: 'PRO', allowDirectDownload: true },
    });
    prisma.track.aggregate.mockResolvedValue({ _sum: { durationSeconds: 0 } });
    audio.extractDuration.mockResolvedValue(200);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AudioService, useValue: audio },
        { provide: NotificationsService, useValue: notifications },
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
      artists: [] as string[],
      description: 'A cool track',
      contentWarning: false,
      availability: { type: 'worldwide' as const, regions: [] as string[] },
    };

    it('creates a public track and returns it with relations', async () => {
      prisma.genre.findUnique.mockResolvedValue({ id: 'genre-1', label: 'music_hiphop' });
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
      expect(result).toMatchObject({ privacy: 'private', status: 'finished' });
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
        availability: { type: 'specific_regions' as const, regions: ['US', 'CA'] },
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

    it('uploads artwork and sets coverUrl when artworkFile is provided', async () => {
      const artworkFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'cover.jpg' };
      storage.uploadImage.mockResolvedValue('https://cdn.example.com/cover-new.jpg');
      prisma.track.create.mockResolvedValue({ ...baseTrack, coverUrl: 'https://cdn.example.com/cover-new.jpg' });
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, dto, artworkFile);

      expect(storage.uploadImage).toHaveBeenCalledWith(artworkFile);
      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ coverUrl: 'https://cdn.example.com/cover-new.jpg' }),
        }),
      );
    });

    it('sets scheduledReleaseDate when provided in dto', async () => {
      const futureDate = '2027-06-01T00:00:00.000Z';
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, { ...dto, scheduledReleaseDate: futureDate });

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ releaseDate: new Date(futureDate) }),
        }),
      );
    });

    it('throws NotFoundException when track is not found after creation', async () => {
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('normalises tags to lowercase and trimmed', async () => {
      prisma.track.create.mockResolvedValue(baseTrack);
      prisma.track.findUnique.mockResolvedValue(baseTrackWithRelations);

      await service.create(USER_ID, { ...dto, tags: ['  HipHop ', 'Lo-Fi'] });

      expect(prisma.trackTag.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: TRACK_ID, tag: 'hiphop' },
          { trackId: TRACK_ID, tag: 'lo-fi' },
        ],
      });
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
      prisma.track.findMany.mockResolvedValue(mockTracks);

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
      prisma.track.findMany.mockResolvedValue([]);

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
      prisma.track.findMany.mockResolvedValue(mockTracks);

      const result = await service.getMyTracks(USER_ID);

      expect(result[0].genre).toBeNull();
    });

    it('marks private tracks with isPrivate=true', async () => {
      const mockTracks = [
        {
          ...baseTrack,
          isPublic: false,
          tags: [],
          user: { username: 'testuser' },
          genre: null,
          _count: { likes: 0, comments: 0, reposts: 0, playHistory: 0 },
        },
      ];
      prisma.track.findMany.mockResolvedValue(mockTracks);

      const result = await service.getMyTracks(USER_ID);

      expect(result[0].isPrivate).toBe(true);
      expect(result[0].visibility).toBe('private');
    });

    it('queries only non-deleted tracks ordered by createdAt desc', async () => {
      prisma.track.findMany.mockResolvedValue([]);

      await service.getMyTracks(USER_ID);

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, isDeleted: false },
          orderBy: { createdAt: 'desc' },
        }),
      );
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

      expect(audio.extractDuration).toHaveBeenCalledWith(mockFile.buffer, 'mp3');
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
      expect(result).toEqual({ message: 'Audio upload received, processing in background' });
    });

    it('sets fileFormat correctly for ogg files', async () => {
      const oggFile = { ...mockFile, originalname: 'audio.ogg' };
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);
      audio.extractDuration.mockResolvedValue(120);

      await service.uploadAudio(TRACK_ID, USER_ID, oggFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'ogg' }),
        }),
      );
    });

    it('sets fileFormat to wav for wav files', async () => {
      const wavFile = { ...mockFile, originalname: 'audio.wav' };
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);
      audio.extractDuration.mockResolvedValue(180);

      await service.uploadAudio(TRACK_ID, USER_ID, wavFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'wav' }),
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.uploadAudio(TRACK_ID, USER_ID, mockFile)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(service.uploadAudio(TRACK_ID, OTHER_USER_ID, mockFile)).rejects.toThrow(ForbiddenException);
    });

    it('falls back to free plan when no active subscription exists', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        name: 'free',
        monthlyUploadMinutes: 60,
      });
      prisma.track.aggregate.mockResolvedValue({ _sum: { durationSeconds: 0 } });
      prisma.track.update.mockResolvedValue(baseTrack);

      const result = await service.uploadAudio(TRACK_ID, USER_ID, mockFile);

      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { name: 'free' },
      });
      expect(result.message).toBe('Audio upload received, processing in background');
    });

    it('enforces monthly upload quota and throws ForbiddenException when exceeded', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        name: 'free',
        monthlyUploadMinutes: 60, // 3600 seconds
      });
      audio.extractDuration.mockResolvedValue(200);
      // Already used 3500 seconds, 200 more would exceed 3600
      prisma.track.aggregate.mockResolvedValue({ _sum: { durationSeconds: 3500 } });

      await expect(service.uploadAudio(TRACK_ID, USER_ID, mockFile)).rejects.toThrow(ForbiddenException);
    });

    it('skips quota check when plan has unlimited minutes (-1)', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      // Default mock already sets monthlyUploadMinutes: -1
      prisma.track.update.mockResolvedValue(baseTrack);

      await service.uploadAudio(TRACK_ID, USER_ID, mockFile);

      expect(prisma.track.aggregate).not.toHaveBeenCalled();
    });

    it('passes durationSeconds to the queue job', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.track.update.mockResolvedValue(baseTrack);
      audio.extractDuration.mockResolvedValue(180);

      await service.uploadAudio(TRACK_ID, USER_ID, mockFile);

      expect(queue.add).toHaveBeenCalledWith(
        'process-track',
        expect.objectContaining({ durationSeconds: 180 }),
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

      await expect(service.getStatus(TRACK_ID)).rejects.toThrow(NotFoundException);
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
      prisma.genre.findUnique.mockResolvedValue({ id: 'genre-1', label: 'music_hiphop' });
      prisma.subGenre.findUnique.mockResolvedValue({ id: 'sub-1', name: 'Trap', genreId: 'genre-1' });

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.genre).toEqual({ category: 'music_hiphop', subGenre: 'Trap' });
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

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.genre).toBeNull();
      expect(prisma.genre.findUnique).not.toHaveBeenCalled();
    });

    it('returns private privacy for non-public tracks', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        isPublic: false,
        genreId: null,
      });

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.privacy).toBe('private');
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrack(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when track is deleted', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        isDeleted: true,
      });

      await expect(service.getTrack(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns subGenre as null when track has no subGenreId', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        subGenreId: null,
      });
      prisma.genre.findUnique.mockResolvedValue({ id: 'genre-1', label: 'music_hiphop' });

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.genre?.subGenre).toBeNull();
      expect(prisma.subGenre.findUnique).not.toHaveBeenCalled();
    });

    it('maps region restrictions into regions array', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...baseTrackWithRelations,
        genreId: null,
        regionRestrictions: [{ countryCode: 'US' }, { countryCode: 'CA' }],
      });

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.availability.regions).toEqual(['US', 'CA']);
    });

    it('includes follower count and isFollowing from prisma.follow', async () => {
      prisma.track.findUnique.mockResolvedValue({ ...baseTrackWithRelations, genreId: null });
      prisma.follow.count.mockResolvedValue(42);
      prisma.follow.findFirst.mockResolvedValue({ id: 'follow-1' });

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.user.followersCount).toBe(42);
      expect(result.user.isFollowing).toBe(true);
    });

    it('returns isFollowing=false when user does not follow the track owner', async () => {
      prisma.track.findUnique.mockResolvedValue({ ...baseTrackWithRelations, genreId: null });
      prisma.follow.findFirst.mockResolvedValue(null);

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.user.isFollowing).toBe(false);
    });

    it('includes likes, reposts, and comments in response', async () => {
      prisma.track.findUnique.mockResolvedValue({ ...baseTrackWithRelations, genreId: null });
      prisma.trackLike.findMany.mockResolvedValue([
        { userId: 'user-a', createdAt: new Date() },
      ]);
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'user-a', username: 'liker' }])   // likedUsers
        .mockResolvedValueOnce([]);                                       // repostedUsers
      prisma.comment.findMany.mockResolvedValue([
        { id: 'c-1', userId: USER_ID, content: 'nice', createdAt: new Date(), timestamp: 10 },
      ]);

      const result = await service.getTrack(TRACK_ID, USER_ID);

      expect(result.likes.users[0].username).toBe('liker');
      expect(result.comments.data[0].text).toBe('nice');
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
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      const result = await service.updateTrack(TRACK_ID, USER_ID, {
        title: 'New Title',
        description: 'New desc',
      });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'New Title', description: 'New desc' }),
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
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(null);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await expect(service.updateTrack(TRACK_ID, USER_ID, { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('includes genre label in response', async () => {
      const finalTrackWithGenre = { ...finalTrack, genreId: 'genre-1' };
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrackWithGenre);
      prisma.track.update.mockResolvedValue(finalTrackWithGenre);
      prisma.genre.findUnique.mockResolvedValue({ id: 'genre-1', label: 'Hip-hop & Rap' });

      const result = await service.updateTrack(TRACK_ID, USER_ID, {});

      expect(result.genre).toBe('Hip-hop & Rap');
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.updateTrack(TRACK_ID, USER_ID, { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(trackWithRelations);

      await expect(service.updateTrack(TRACK_ID, OTHER_USER_ID, { title: 'x' })).rejects.toThrow(ForbiddenException);
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
      const artworkFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'cover.jpg' };
      storage.uploadImage.mockResolvedValue('https://cdn.example.com/cover-new.jpg');
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);

      await service.updateTrack(TRACK_ID, USER_ID, {}, artworkFile);

      expect(storage.uploadImage).toHaveBeenCalledWith(artworkFile);
      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ coverUrl: 'https://cdn.example.com/cover-new.jpg' }),
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

      await service.updateTrack(TRACK_ID, USER_ID, { tags: ['Lo-Fi', 'Chill'] });

      expect(prisma.trackTag.deleteMany).toHaveBeenCalledWith({ where: { trackId: TRACK_ID } });
      expect(prisma.trackTag.createMany).toHaveBeenCalledWith({
        data: [
          { trackId: TRACK_ID, tag: 'lo-fi' },
          { trackId: TRACK_ID, tag: 'chill' },
        ],
      });
    });

    it('connects genre when valid genre label is provided', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.genre.upsert.mockResolvedValue({ id: 'genre-1', label: 'Rock' });
      prisma.genre.findUnique.mockResolvedValue({ id: 'genre-1', label: 'Rock' });
      prisma.track.update.mockResolvedValue(finalTrack);

      await service.updateTrack(TRACK_ID, USER_ID, { genre: 'Rock' });

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            genre: { connect: { id: 'genre-1' } },
          }),
        }),
      );
    });

    it('updates artists — deletes old then creates new', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(trackWithRelations)
        .mockResolvedValueOnce(finalTrack);
      prisma.track.update.mockResolvedValue(finalTrack);
      prisma.genre.findUnique.mockResolvedValue(null);
      prisma.trackArtist.deleteMany.mockResolvedValue({ count: 0 });
      prisma.trackArtist.create.mockResolvedValue({});

      await service.updateTrack(TRACK_ID, USER_ID, { artists: ['ArtistA', 'ArtistB'] });

      expect(prisma.trackArtist.deleteMany).toHaveBeenCalledWith({ where: { trackId: TRACK_ID } });
      expect(prisma.trackArtist.create).toHaveBeenCalledTimes(2);
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

      await expect(service.deleteTrack(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(service.deleteTrack(TRACK_ID, OTHER_USER_ID)).rejects.toThrow(ForbiddenException);
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
      expect(callArgs.data.deletedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
    });

    it('sets deletedBy to the user performing the deletion', async () => {
      const trackOwnedByOther = { ...baseTrack, userId: OTHER_USER_ID };
      prisma.track.findUnique.mockResolvedValue(trackOwnedByOther);
      prisma.track.update.mockResolvedValue({ ...trackOwnedByOther, isDeleted: true });

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
      plan: { name: 'artist-pro' },
    };

    it('replaces audio, queues job, and returns updated track info', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue('https://cdn.example.com/new-audio.mp3');
      audio.extractDuration.mockResolvedValue(180);
      prisma.track.update.mockResolvedValue({
        ...baseTrack,
        audioUrl: 'https://cdn.example.com/new-audio.mp3',
        durationSeconds: 180,
        transcodingStatus: 'processing',
      });

      const result = await service.replaceAudio(TRACK_ID, USER_ID, mockFile);

      expect(storage.uploadAudio).toHaveBeenCalledWith(mockFile);
      expect(audio.extractDuration).toHaveBeenCalledWith(mockFile.buffer, 'mp3');
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

    it('throws ForbiddenException when user has no artist or artist-pro subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(service.replaceAudio(TRACK_ID, USER_ID, mockFile)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.replaceAudio(TRACK_ID, USER_ID, mockFile)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the track', async () => {
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);

      await expect(service.replaceAudio(TRACK_ID, OTHER_USER_ID, mockFile)).rejects.toThrow(ForbiddenException);
    });

    it('sets fileFormat to wav for wav files', async () => {
      const wavFile = { ...mockFile, originalname: 'audio.wav' };
      prisma.subscription.findFirst.mockResolvedValue(proSubscription);
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue('https://cdn.example.com/audio.wav');
      audio.extractDuration.mockResolvedValue(200);
      prisma.track.update.mockResolvedValue({ ...baseTrack, fileFormat: 'wav' });

      await service.replaceAudio(TRACK_ID, USER_ID, wavFile);

      expect(prisma.track.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileFormat: 'wav' }),
        }),
      );
    });

    it('accepts artist plan subscriptions', async () => {
      prisma.subscription.findFirst.mockResolvedValue({ ...proSubscription, plan: { name: 'artist' } });
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.uploadAudio.mockResolvedValue('https://cdn.example.com/audio.mp3');
      audio.extractDuration.mockResolvedValue(200);
      prisma.track.update.mockResolvedValue(baseTrack);

      await expect(service.replaceAudio(TRACK_ID, USER_ID, mockFile)).resolves.not.toThrow();
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

      expect(prisma.trackLike.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: USER_ID } },
          track: { connect: { id: TRACK_ID } },
        },
      });
      expect(result.message).toBe('Track liked successfully');
      expect(result.data.likesCount).toBe(5);
    });

    it('sends a notification to the track owner after liking', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { likes: 1 } });
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.trackLike.create.mockResolvedValue({ id: 'like-1' });

      await service.likeTrack(TRACK_ID, USER_ID);

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: baseTrack.userId,
          actorId: USER_ID,
          referenceId: TRACK_ID,
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found');
    });

    it('throws ForbiddenException when user already liked the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.findFirst.mockResolvedValue({
        id: 'like-existing',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow('You already liked this track');
    });

    it('throws NotFoundException if track not found after liking', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce(null);
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.trackLike.create.mockResolvedValue({ id: 'like-1' });

      await expect(service.likeTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found after liking');
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

      expect(prisma.trackLike.delete).toHaveBeenCalledWith({ where: { id: 'like-1' } });
      expect(result.message).toBe('Track unliked successfully');
      expect(result.data.likesCount).toBe(4);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.unlikeTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found');
    });

    it('throws ForbiddenException when user has not liked the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.findFirst.mockResolvedValue(null);

      await expect(service.unlikeTrack(TRACK_ID, USER_ID)).rejects.toThrow('You have not liked this track');
    });

    it('throws NotFoundException if track not found after unliking', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce(null);
      prisma.trackLike.findFirst.mockResolvedValue({ id: 'like-1' });
      prisma.trackLike.delete.mockResolvedValue({});

      await expect(service.unlikeTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found after unliking');
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
          user: { id: 'user-1', username: 'liker1', avatarUrl: 'https://example.com/avatar1.jpg' },
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

      await expect(service.getTrackLikes(TRACK_ID)).rejects.toThrow('Track not found');
    });

    it('validates and constrains pagination parameters — caps limit at 100', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.count.mockResolvedValue(0);
      prisma.trackLike.findMany.mockResolvedValue([]);

      await service.getTrackLikes(TRACK_ID, 1, 200);

      expect(prisma.trackLike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
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

    it('returns likes ordered by most recent first', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.trackLike.count.mockResolvedValue(0);
      prisma.trackLike.findMany.mockResolvedValue([]);

      await service.getTrackLikes(TRACK_ID, 1, 20);

      expect(prisma.trackLike.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
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

    it('sends a notification to the track owner after reposting', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { reposts: 1 } });
      prisma.repost.findFirst.mockResolvedValue(null);
      prisma.repost.create.mockResolvedValue({ id: 'repost-1' });

      await service.repostTrack(TRACK_ID, USER_ID);

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: baseTrack.userId,
          actorId: USER_ID,
          referenceId: TRACK_ID,
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.repostTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found');
    });

    it('throws ForbiddenException when user already reposted the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.findFirst.mockResolvedValue({
        id: 'repost-existing',
        trackId: TRACK_ID,
        userId: USER_ID,
        createdAt: new Date(),
      });

      await expect(service.repostTrack(TRACK_ID, USER_ID)).rejects.toThrow('You already reposted this track');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // unrepostTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('unrepostTrack()', () => {
    it('deletes a repost and returns track info with updated count', async () => {
      const existingRepost = { id: 'repost-1', trackId: TRACK_ID, userId: USER_ID, createdAt: new Date() };
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce({ ...baseTrack, _count: { reposts: 2 } });
      prisma.repost.findFirst.mockResolvedValue(existingRepost);
      prisma.repost.delete.mockResolvedValue(existingRepost);

      const result = await service.unrepostTrack(TRACK_ID, USER_ID);

      expect(prisma.repost.delete).toHaveBeenCalledWith({ where: { id: 'repost-1' } });
      expect(result.message).toBe('Track unreposted successfully');
      expect(result.data.repostsCount).toBe(2);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.unrepostTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found');
    });

    it('throws ForbiddenException when user has not reposted the track', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.findFirst.mockResolvedValue(null);

      await expect(service.unrepostTrack(TRACK_ID, USER_ID)).rejects.toThrow('You have not reposted this track');
    });

    it('throws NotFoundException if track not found after unreposting', async () => {
      prisma.track.findUnique
        .mockResolvedValueOnce(baseTrack)
        .mockResolvedValueOnce(null);
      prisma.repost.findFirst.mockResolvedValue({ id: 'repost-1' });
      prisma.repost.delete.mockResolvedValue({});

      await expect(service.unrepostTrack(TRACK_ID, USER_ID)).rejects.toThrow('Track not found after unreposting');
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
          user: { id: 'user-1', username: 'reposter1', avatarUrl: 'https://example.com/avatar1.jpg' },
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

      await expect(service.getTrackReposts(TRACK_ID)).rejects.toThrow('Track not found');
    });

    it('correctly calculates pagination skip on page 2', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.count.mockResolvedValue(100);
      prisma.repost.findMany.mockResolvedValue(
        Array(20).fill(null).map((_, i) => ({
          id: `repost-${i}`,
          trackId: TRACK_ID,
          userId: `user-${i}`,
          createdAt: new Date(),
          user: { id: `user-${i}`, username: `user${i}`, avatarUrl: null },
        })),
      );

      const result = await service.getTrackReposts(TRACK_ID, 2, 20);

      expect(prisma.repost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.page).toBe(2);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('caps limit at 100', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.repost.count.mockResolvedValue(0);
      prisma.repost.findMany.mockResolvedValue([]);

      await service.getTrackReposts(TRACK_ID, 1, 500);

      expect(prisma.repost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
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

      const result = await service.addComment(TRACK_ID, USER_ID, 'Great track!', 30);

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

    it('sends a notification to the track owner after commenting', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.create.mockResolvedValue({
        id: 'comment-1',
        content: 'hi',
        timestamp: 0,
        createdAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, username: 'u', avatarUrl: null });
      prisma.comment.count.mockResolvedValue(1);

      await service.addComment(TRACK_ID, USER_ID, 'hi', 0);

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: baseTrack.userId,
          actorId: USER_ID,
          referenceId: 'comment-1',
        }),
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.addComment(TRACK_ID, USER_ID, 'text', 0)).rejects.toThrow('Track not found');
    });

    it('returns "Unknown" username when user not found', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.create.mockResolvedValue({
        id: 'comment-1',
        trackId: TRACK_ID,
        userId: USER_ID,
        content: 'text',
        timestamp: 0,
        createdAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.comment.count.mockResolvedValue(1);

      const result = await service.addComment(TRACK_ID, USER_ID, 'text', 0);

      expect(result.comment.username).toBe('Unknown');
    });

    it('returns null avatarUrl when user has no avatar', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.create.mockResolvedValue({ id: 'c-1', content: 'x', timestamp: 5, createdAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, username: 'u', avatarUrl: null });
      prisma.comment.count.mockResolvedValue(1);

      const result = await service.addComment(TRACK_ID, USER_ID, 'x', 5);

      expect(result.comment.avatarUrl).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrackComments()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrackComments()', () => {
    it('returns paginated comments with metadata', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.count.mockResolvedValue(15);
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
        user: { id: `user-${i % 3}`, username: `commenter${i % 3}`, avatarUrl: null },
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

      await expect(service.getTrackComments(TRACK_ID)).rejects.toThrow('Track not found');
    });

    it('validates and constrains limit to max 100', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.count.mockResolvedValue(0);
      prisma.comment.findMany.mockResolvedValue([]);

      await service.getTrackComments(TRACK_ID, 1, 500);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('only fetches top-level comments (parentCommentId: null)', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.comment.count.mockResolvedValue(0);
      prisma.comment.findMany.mockResolvedValue([]);

      await service.getTrackComments(TRACK_ID, 1, 20);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentCommentId: null }),
        }),
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
      prisma.trackLike.findFirst.mockResolvedValue({ id: 'like-1' });
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

      await expect(service.getEngagementMetrics(TRACK_ID, USER_ID)).rejects.toThrow('Track not found');
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

    it('correctly evaluates isLiked and isReposted as true', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.$transaction.mockResolvedValue([5, 3, 10, 50]);
      prisma.trackLike.findFirst.mockResolvedValue({ id: 'like-1', trackId: TRACK_ID, userId: USER_ID });
      prisma.repost.findFirst.mockResolvedValue({ id: 'repost-1', trackId: TRACK_ID, userId: USER_ID });

      const result = await service.getEngagementMetrics(TRACK_ID, USER_ID);

      expect(result.isLiked).toBe(true);
      expect(result.isReposted).toBe(true);
    });

    it('returns zero counts when track has no engagement', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.$transaction.mockResolvedValue([0, 0, 0, 0]);
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.repost.findFirst.mockResolvedValue(null);

      const result = await service.getEngagementMetrics(TRACK_ID, USER_ID);

      expect(result.likesCount).toBe(0);
      expect(result.repostsCount).toBe(0);
      expect(result.commentsCount).toBe(0);
      expect(result.playsCount).toBe(0);
      expect(result.isLiked).toBe(false);
      expect(result.isReposted).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getStreamUrl()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getStreamUrl()', () => {
    const playableTrack = {
      ...baseTrack,
      regionRestrictions: [],
      transcodingStatus: 'finished' as const,
      isDeleted: false,
      isHidden: false,
      isPublic: true,
      requiresPremium: false,
      previewEnabled: false,
      previewStart: null,
      previewDuration: null,
      releaseDate: null,
      privateToken: null,
    };

    it('returns signed stream URL for a playable track', async () => {
      prisma.track.findUnique.mockResolvedValue(playableTrack);
      prisma.playHistory.findFirst.mockResolvedValue(null);
      prisma.playHistory.create.mockResolvedValue({});
      storage.getSignedUrl.mockResolvedValue('https://cdn.example.com/signed-url');

      const result = await service.getStreamUrl(TRACK_ID, USER_ID);

      expect(storage.getSignedUrl).toHaveBeenCalledWith(playableTrack.audioUrl, 600);
      expect(result).toMatchObject({
        trackId: TRACK_ID,
        stream: {
          url: 'https://cdn.example.com/signed-url',
          expiresInSeconds: 600,
        },
        preview: null,
      });
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getStreamUrl(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a deleted track', async () => {
      prisma.track.findUnique.mockResolvedValue({ ...playableTrack, isDeleted: true });

      await expect(service.getStreamUrl(TRACK_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('records a play history entry when no recent play exists', async () => {
      prisma.track.findUnique.mockResolvedValue(playableTrack);
      prisma.playHistory.findFirst.mockResolvedValue(null);
      prisma.playHistory.create.mockResolvedValue({});
      storage.getSignedUrl.mockResolvedValue('https://cdn.example.com/signed-url');

      await service.getStreamUrl(TRACK_ID, USER_ID);

      expect(prisma.playHistory.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, trackId: TRACK_ID, completed: false },
      });
    });

    it('skips play history creation when a recent play exists (dedup window)', async () => {
      prisma.track.findUnique.mockResolvedValue(playableTrack);
      prisma.playHistory.findFirst.mockResolvedValue({ id: 'play-1' });
      storage.getSignedUrl.mockResolvedValue('https://cdn.example.com/signed-url');

      await service.getStreamUrl(TRACK_ID, USER_ID);

      expect(prisma.playHistory.create).not.toHaveBeenCalled();
    });

    it('returns preview info for preview-only tracks', async () => {
      prisma.track.findUnique.mockResolvedValue({
        ...playableTrack,
        previewEnabled: true,
        previewStart: 10,
        previewDuration: 30,
      });
      prisma.playHistory.findFirst.mockResolvedValue(null);
      prisma.playHistory.create.mockResolvedValue({});
      storage.getSignedUrl.mockResolvedValue('https://cdn.example.com/signed-url');

      const result = await service.getStreamUrl(TRACK_ID, USER_ID);

      expect(result.preview).toEqual({ previewStartSeconds: 10, previewDurationSeconds: 30 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // markTrackPlayed()
  // ══════════════════════════════════════════════════════════════════════════

  describe('markTrackPlayed()', () => {
    it('marks the most recent play as completed', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.playHistory.findFirst.mockResolvedValue({ id: 'play-1', userId: USER_ID, trackId: TRACK_ID });
      prisma.playHistory.update.mockResolvedValue({});

      const result = await service.markTrackPlayed(TRACK_ID, USER_ID);

      expect(prisma.playHistory.update).toHaveBeenCalledWith({
        where: { id: 'play-1' },
        data: { completed: true },
      });
      expect(result).toEqual({ message: 'Play recorded' });
    });

    it('silently returns when no play record exists', async () => {
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      prisma.playHistory.findFirst.mockResolvedValue(null);

      const result = await service.markTrackPlayed(TRACK_ID, USER_ID);

      expect(prisma.playHistory.update).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Play recorded' });
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.markTrackPlayed(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getListeningHistory()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getListeningHistory()', () => {
    it('returns paginated listening history with engagement data', async () => {
      const historyEntry = {
        playedAt: new Date(),
        track: {
          id: TRACK_ID,
          title: 'Test Track',
          coverUrl: null,
          releaseDate: null,
          durationSeconds: 200,
          genre: { label: 'Hip-Hop' },
          user: { displayName: 'Artist', username: 'artist' },
          _count: { likes: 5, comments: 2, reposts: 1, playHistory: 50 },
        },
      };
      prisma.playHistory.findMany
        .mockResolvedValueOnce([historyEntry])
        .mockResolvedValueOnce([{ trackId: TRACK_ID }]);

      const result = await service.getListeningHistory(USER_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].trackId).toBe(TRACK_ID);
      expect(result.data[0].artist).toBe('Artist');
      expect(result.data[0].engagement.likeCount).toBe(5);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });

    it('falls back to username when displayName is null', async () => {
      const historyEntry = {
        playedAt: new Date(),
        track: {
          id: TRACK_ID,
          title: 'Test Track',
          coverUrl: null,
          releaseDate: null,
          durationSeconds: 200,
          genre: null,
          user: { displayName: null, username: 'fallback_user' },
          _count: { likes: 0, comments: 0, reposts: 0, playHistory: 0 },
        },
      };
      prisma.playHistory.findMany
        .mockResolvedValueOnce([historyEntry])
        .mockResolvedValueOnce([{ trackId: TRACK_ID }]);

      const result = await service.getListeningHistory(USER_ID, 1, 20);

      expect(result.data[0].artist).toBe('fallback_user');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // clearListeningHistory()
  // ══════════════════════════════════════════════════════════════════════════

  describe('clearListeningHistory()', () => {
    it('hides all play history entries and returns success message', async () => {
      prisma.playHistory.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.clearListeningHistory(USER_ID);

      expect(prisma.playHistory.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, isHidden: false },
        data: { isHidden: true },
      });
      expect(result).toEqual({ message: 'Listening history cleared' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getDownloadUrl()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getDownloadUrl()', () => {
    it('returns a signed download URL for eligible users', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        plan: { allowDirectDownload: true },
      });
      prisma.track.findUnique.mockResolvedValue(baseTrack);
      storage.getSignedDownloadUrl.mockResolvedValue('https://cdn.example.com/download-url');

      const result = await service.getDownloadUrl(TRACK_ID, USER_ID);

      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(baseTrack.audioUrl, 600, baseTrack.title);
      expect(result).toEqual({
        trackId: TRACK_ID,
        downloadUrl: 'https://cdn.example.com/download-url',
        expiresInSeconds: 600,
      });
    });

    it('throws ForbiddenException when plan does not allow downloads', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        plan: { allowDirectDownload: false },
      });

      await expect(service.getDownloadUrl(TRACK_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no active subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(service.getDownloadUrl(TRACK_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        plan: { allowDirectDownload: true },
      });
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadUrl(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTrackPlaybackBundle()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrackPlaybackBundle()', () => {
    const bundleTrack = {
      ...baseTrack,
      regionRestrictions: [],
      genre: { id: 'genre-1', label: 'Hip-Hop' },
      user: { id: USER_ID, username: 'artist', displayName: 'Artist Name', avatarUrl: null },
      _count: { likes: 10, comments: 5, reposts: 3 },
    };

    it('returns full playback bundle for a playable track', async () => {
      prisma.track.findUnique.mockResolvedValue(bundleTrack);
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.repost.findFirst.mockResolvedValue(null);
      prisma.collectionTrack.findFirst.mockResolvedValue(null);

      const result = await service.getTrackPlaybackBundle(TRACK_ID, USER_ID);

      expect(result.trackId).toBe(TRACK_ID);
      expect(result.playability.status).toBe('playable');
      expect(result.engagement.likeCount).toBe(10);
      expect(result.engagement.isLiked).toBe(false);
    });

    it('returns blocked status for a deleted track', async () => {
      prisma.track.findUnique.mockResolvedValue({ ...bundleTrack, isDeleted: true });
      prisma.trackLike.findFirst.mockResolvedValue(null);
      prisma.repost.findFirst.mockResolvedValue(null);
      prisma.collectionTrack.findFirst.mockResolvedValue(null);

      const result = await service.getTrackPlaybackBundle(TRACK_ID, USER_ID);

      expect(result.playability.status).toBe('blocked');
      expect(result.playability.blockedReason).toBe('deleted');
    });

    it('throws NotFoundException when track does not exist', async () => {
      prisma.track.findUnique.mockResolvedValue(null);

      await expect(service.getTrackPlaybackBundle(TRACK_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('reflects isLiked and isSaved correctly', async () => {
      prisma.track.findUnique.mockResolvedValue(bundleTrack);
      prisma.trackLike.findFirst.mockResolvedValue({ id: 'like-1' });
      prisma.repost.findFirst.mockResolvedValue(null);
      prisma.collectionTrack.findFirst.mockResolvedValue({ id: 'save-1' });

      const result = await service.getTrackPlaybackBundle(TRACK_ID, USER_ID);

      expect(result.engagement.isLiked).toBe(true);
      expect(result.engagement.isSaved).toBe(true);
      expect(result.engagement.isReposted).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // buildPlaybackContext()
  // ══════════════════════════════════════════════════════════════════════════

  describe('buildPlaybackContext()', () => {
    it('builds a playlist context with ordered tracks', async () => {
      prisma.collectionTrack.findMany.mockResolvedValue([
        {
          trackId: 'track-1',
          position: 1,
          track: { title: 'Song A', durationSeconds: 180, user: { displayName: 'Artist', username: 'artist' } },
        },
        {
          trackId: 'track-2',
          position: 2,
          track: { title: 'Song B', durationSeconds: 200, user: { displayName: null, username: 'artist2' } },
        },
      ]);

      const result = await service.buildPlaybackContext('playlist', 'collection-1');

      expect(result.queue).toHaveLength(2);
      expect(result.queue[0].trackId).toBe('track-1');
      expect(result.queue[1].artist).toBe('artist2');
      expect(result.totalCount).toBe(2);
    });

    it('builds a profile context with public non-deleted tracks', async () => {
      prisma.track.findMany.mockResolvedValue([
        {
          id: 'track-1',
          title: 'Song A',
          durationSeconds: 180,
          user: { displayName: 'Artist', username: 'artist' },
        },
      ]);

      const result = await service.buildPlaybackContext('profile', USER_ID);

      expect(result.queue).toHaveLength(1);
      expect(result.queue[0].title).toBe('Song A');
    });

    it('builds a history context with deduplicated tracks', async () => {
      prisma.playHistory.findMany.mockResolvedValue([
        { trackId: 'track-1', track: { title: 'Song A', durationSeconds: 180, user: { displayName: 'Artist', username: 'artist' } } },
        { trackId: 'track-1', track: { title: 'Song A', durationSeconds: 180, user: { displayName: 'Artist', username: 'artist' } } },
        { trackId: 'track-2', track: { title: 'Song B', durationSeconds: 200, user: { displayName: null, username: 'artist2' } } },
      ]);

      const result = await service.buildPlaybackContext('history', USER_ID);

      // track-1 appears twice in history but should be deduplicated
      expect(result.queue).toHaveLength(2);
    });

    it('returns empty queue when context has no tracks', async () => {
      prisma.collectionTrack.findMany.mockResolvedValue([]);

      const result = await service.buildPlaybackContext('playlist', 'collection-empty');

      expect(result.queue).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('starts at the correct index when startTrackId is provided', async () => {
      prisma.collectionTrack.findMany.mockResolvedValue([
        { trackId: 'track-1', position: 1, track: { title: 'A', durationSeconds: 100, user: { displayName: null, username: 'u' } } },
        { trackId: 'track-2', position: 2, track: { title: 'B', durationSeconds: 200, user: { displayName: null, username: 'u' } } },
        { trackId: 'track-3', position: 3, track: { title: 'C', durationSeconds: 300, user: { displayName: null, username: 'u' } } },
      ]);

      const result = await service.buildPlaybackContext('playlist', 'collection-1', 'track-2');

      expect(result.currentIndex).toBe(1);
    });

    it('throws BadRequestException for invalid context type', async () => {
      await expect(
        service.buildPlaybackContext('invalid_type', 'some-id'),
      ).rejects.toThrow('Invalid context type');
    });

    it('applies shuffle when shuffle=true', async () => {
      prisma.collectionTrack.findMany.mockResolvedValue(
        Array(5).fill(null).map((_, i) => ({
          trackId: `track-${i}`,
          position: i,
          track: { title: `Song ${i}`, durationSeconds: 100, user: { displayName: null, username: 'u' } },
        })),
      );

      const result = await service.buildPlaybackContext('playlist', 'col-1', undefined, true);

      expect(result.shuffle).toBe(true);
      expect(result.queue).toHaveLength(5);
    });
  });
});