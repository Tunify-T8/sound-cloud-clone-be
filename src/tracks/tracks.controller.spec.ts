import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackMultipartDto } from './dto/update-track-multipart.dto';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const TRACK_ID = 'track-abc';

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

const mockTrack = {
  trackId: TRACK_ID,
  status: 'finished',
  title: 'Test Track',
  description: null,
  genre: null,
  tags: [],
  artists: [],
  durationSeconds: 200,
  privacy: 'public',
  scheduledReleaseDate: null,
  availability: { type: 'worldwide', regions: [] },
  licensing: { type: 'creative_commons', allowAttribution: true, nonCommercial: true, noDerivatives: false, shareAlike: true },
  recordLabel: null,
  publisher: null,
  isrc: null,
  pLine: null,
  contentWarning: false,
  permissions: {
    enableDirectDownloads: false,
    enableOfflineListening: false,
    includeInRSS: true,
    displayEmbedCode: true,
    enableAppPlayback: true,
    allowComments: true,
    showCommentsPublic: true,
    showInsightsPublic: false,
  },
  audioUrl: 'https://cdn.example.com/audio.mp3',
  waveformUrl: 'https://cdn.example.com/waveform.json',
  artworkUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  audioMetadata: { bitrateKbps: 320, sampleRateHz: 44100, format: 'mp3', fileSizeBytes: 5000000 },
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

const makeServiceMock = () => ({
  create: jest.fn(),
  uploadAudio: jest.fn(),
  getStatus: jest.fn(),
  getTrack: jest.fn(),
  updateTrack: jest.fn(),
  deleteTrack: jest.fn(),
  replaceAudio: jest.fn(),
});

// Helper to build a typed AuthRequest
const makeReq = (userId = USER_ID) =>
  ({ user: { userId } }) as any;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TracksController', () => {
  let controller: TracksController;
  let service: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    service = makeServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TracksController],
      providers: [{ provide: TracksService, useValue: service }],
    }).compile();

    controller = module.get<TracksController>(TracksController);
  });

  afterEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // POST /tracks  →  create()
  // ══════════════════════════════════════════════════════════════════════════

  describe('create()', () => {
    it('calls service.create with userId and dto, returns result', async () => {
      const dto: CreateTrackDto = { title: 'My Track', privacy: 'public',
         genre: 'Electronic', availability: { type: 'worldwide', regions: [] } };
      service.create.mockResolvedValue({ id: TRACK_ID });

      const result = await controller.create(makeReq(), dto);

      expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
      expect(result).toEqual({ id: TRACK_ID });
    });

    it('falls back to empty string when userId is undefined', async () => {
      const dto: CreateTrackDto = { title: 'Track', privacy: 'public', genre: 'testgenre', availability: { type: 'worldwide', regions: [] } };
      service.create.mockResolvedValue({});

      await controller.create({ user: undefined } as any, dto);

      expect(service.create).toHaveBeenCalledWith('', dto);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /tracks/:id/audio  →  uploadAudio()
  // ══════════════════════════════════════════════════════════════════════════

  describe('uploadAudio()', () => {
    it('calls service.uploadAudio with correct args', async () => {
      service.uploadAudio.mockResolvedValue({
        message: 'Audio upload received, processing in background',
      });

      const result = await controller.uploadAudio(makeReq(), TRACK_ID, mockFile);

      expect(service.uploadAudio).toHaveBeenCalledWith(TRACK_ID, USER_ID, mockFile);
      expect(result).toEqual({ message: 'Audio upload received, processing in background' });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /tracks/:id/status  →  getStatus()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getStatus()', () => {
    it('returns the status from the service', async () => {
      const statusResult = {
        id: TRACK_ID,
        transcodingStatus: 'finished',
        durationSeconds: 200,
        audioUrl: 'https://cdn.example.com/audio.mp3',
        waveformUrl: 'https://cdn.example.com/waveform.json',
      };
      service.getStatus.mockResolvedValue(statusResult);

      const result = await controller.getStatus(TRACK_ID);

      expect(service.getStatus).toHaveBeenCalledWith(TRACK_ID);
      expect(result).toEqual(statusResult);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /tracks/:id  →  getTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTrack()', () => {
    it('returns track wrapped in 200 response when found', async () => {
      service.getTrack.mockResolvedValue(mockTrack);

      const result = await controller.getTrack(TRACK_ID);

      expect(service.getTrack).toHaveBeenCalledWith(TRACK_ID);
      expect(result).toEqual({ track: mockTrack, statusCode: 200 });
    });

    it('returns 404 response when service returns null', async () => {
      service.getTrack.mockResolvedValue(null);

      const result = await controller.getTrack(TRACK_ID);

      expect(result).toEqual({ message: 'Track not found', statusCode: 404 });
    });

    it('propagates exceptions thrown by the service', async () => {
      service.getTrack.mockRejectedValue(new NotFoundException('Track not found'));

      await expect(controller.getTrack(TRACK_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /tracks/:id  →  updateTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('updateTrack()', () => {
    it('calls service.updateTrack with correct args and returns result', async () => {
      const dto: UpdateTrackMultipartDto = { title: 'Updated Title' };
      const updateResult = { ...mockTrack, title: 'Updated Title' };
      service.updateTrack.mockResolvedValue(updateResult);

      const result = await controller.updateTrack(makeReq(), TRACK_ID, dto, undefined);

      expect(service.updateTrack).toHaveBeenCalledWith(TRACK_ID, USER_ID, dto, undefined);
      expect(result).toEqual(updateResult);
    });

    it('passes artworkFile to service when provided', async () => {
      const artworkFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'cover.jpg' };
      service.updateTrack.mockResolvedValue(mockTrack);

      await controller.updateTrack(makeReq(), TRACK_ID, {}, artworkFile);

      expect(service.updateTrack).toHaveBeenCalledWith(TRACK_ID, USER_ID, {}, artworkFile);
    });

    it('falls back to empty string when userId is undefined', async () => {
      service.updateTrack.mockResolvedValue(mockTrack);

      await controller.updateTrack({ user: undefined } as any, TRACK_ID, {}, undefined);

      expect(service.updateTrack).toHaveBeenCalledWith(TRACK_ID, '', {}, undefined);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /tracks/:id  →  deleteTrack()
  // ══════════════════════════════════════════════════════════════════════════

  describe('deleteTrack()', () => {
    it('calls service.deleteTrack and returns trackId with message', async () => {
      service.deleteTrack.mockResolvedValue({ message: 'Track deleted successfully' });

      const result = await controller.deleteTrack(makeReq(), TRACK_ID);

      expect(service.deleteTrack).toHaveBeenCalledWith(TRACK_ID, USER_ID);
      expect(result).toEqual({ trackId: TRACK_ID, message: 'Track deleted successfully' });
    });

    it('falls back to empty string when userId is undefined', async () => {
      service.deleteTrack.mockResolvedValue({ message: 'Track deleted successfully' });

      await controller.deleteTrack({ user: undefined } as any, TRACK_ID);

      expect(service.deleteTrack).toHaveBeenCalledWith(TRACK_ID, '');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /tracks/:id/audio/replace  →  replaceAudio()
  // ══════════════════════════════════════════════════════════════════════════

  describe('replaceAudio()', () => {
    it('calls service.replaceAudio with correct args and returns result', async () => {
      const replaceResult = {
        trackId: TRACK_ID,
        status: 'processing',
        audioUrl: 'https://cdn.example.com/new-audio.mp3',
        waveformUrl: '',
      };
      service.replaceAudio.mockResolvedValue(replaceResult);

      const result = await controller.replaceAudio(makeReq(), TRACK_ID, mockFile);

      expect(service.replaceAudio).toHaveBeenCalledWith(TRACK_ID, USER_ID, mockFile);
      expect(result).toEqual(replaceResult);
    });

    it('falls back to empty string when userId is undefined', async () => {
      service.replaceAudio.mockResolvedValue({});

      await controller.replaceAudio({ user: undefined } as any, TRACK_ID, mockFile);

      expect(service.replaceAudio).toHaveBeenCalledWith(TRACK_ID, '', mockFile);
    });
  });
});