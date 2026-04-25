import { Test, TestingModule } from '@nestjs/testing';
import { AdminContentService } from './admin-content.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

// ── Strict Domain Types (NO Prisma leakage) ─────────────────
type TrackEntity = {
  id: string;
  isDeleted: boolean;
};

type CommentEntity = {
  id: string;
  isDeleted: boolean;
};

// ── Strict Mock Types (NO any anywhere) ─────────────────────
type MockFn<Args extends unknown[], Return> = jest.Mock<Promise<Return>, Args>;

type MockPrisma = {
  track: {
    findUnique: MockFn<[{ where: { id: string } }], TrackEntity | null>;
    update: MockFn<
      [
        {
          where: { id: string };
          data: Record<string, unknown>;
        },
      ],
      TrackEntity
    >;
  };
  comment: {
    findUnique: MockFn<[{ where: { id: string } }], CommentEntity | null>;
    update: MockFn<
      [
        {
          where: { id: string };
          data: Record<string, unknown>;
        },
      ],
      CommentEntity
    >;
  };
};

// ── Mock Instance ───────────────────────────────────────────
const mockPrisma: MockPrisma = {
  track: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  comment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('AdminContentService', () => {
  let service: AdminContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminContentService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AdminContentService>(AdminContentService);
  });

  afterEach(() => jest.clearAllMocks());

  const baseTrack: TrackEntity = {
    id: 'track-1',
    isDeleted: false,
  };

  const baseComment: CommentEntity = {
    id: 'comment-1',
    isDeleted: false,
  };

  // ── Tracks ────────────────────────────────────────────────
  describe('hideTrack', () => {
    it('should hide track successfully', async () => {
      mockPrisma.track.findUnique.mockResolvedValue(baseTrack);
      mockPrisma.track.update.mockResolvedValue(baseTrack);

      const result = await service.hideTrack('track-1', 'admin-1');

      expect(mockPrisma.track.findUnique).toHaveBeenCalledWith({
        where: { id: 'track-1' },
      });

      expect(mockPrisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: expect.objectContaining({
          isHidden: true,
          hiddenBy: 'admin-1',
        }),
      });

      expect(result).toEqual({ message: 'Track hidden' });
    });

    it('should throw if track not found', async () => {
      mockPrisma.track.findUnique.mockResolvedValue(null);

      await expect(service.hideTrack('track-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if track is deleted', async () => {
      mockPrisma.track.findUnique.mockResolvedValue({
        ...baseTrack,
        isDeleted: true,
      });

      await expect(service.hideTrack('track-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unhideTrack', () => {
    it('should unhide track', async () => {
      mockPrisma.track.findUnique.mockResolvedValue(baseTrack);
      mockPrisma.track.update.mockResolvedValue(baseTrack);

      const result = await service.unhideTrack('track-1');

      expect(mockPrisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: {
          isHidden: false,
          hiddenAt: null,
          hiddenBy: null,
        },
      });

      expect(result).toEqual({ message: 'Track unhidden' });
    });

    it('should throw if not found', async () => {
      mockPrisma.track.findUnique.mockResolvedValue(null);

      await expect(service.unhideTrack('track-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteTrack', () => {
    it('should soft delete track', async () => {
      mockPrisma.track.findUnique.mockResolvedValue(baseTrack);
      mockPrisma.track.update.mockResolvedValue(baseTrack);

      const result = await service.deleteTrack('track-1', 'admin-1');

      expect(mockPrisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: expect.objectContaining({
          isDeleted: true,
          deletedBy: 'admin-1',
        }),
      });

      expect(result).toEqual({ message: 'Track removed' });
    });

    it('should throw if deleted', async () => {
      mockPrisma.track.findUnique.mockResolvedValue({
        ...baseTrack,
        isDeleted: true,
      });

      await expect(service.deleteTrack('track-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Comments ──────────────────────────────────────────────
  describe('hideComment', () => {
    it('should hide comment', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(baseComment);
      mockPrisma.comment.update.mockResolvedValue(baseComment);

      const result = await service.hideComment('comment-1', 'admin-1');

      expect(mockPrisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: expect.objectContaining({
          isHidden: true,
          hiddenBy: 'admin-1',
        }),
      });

      expect(result).toEqual({ message: 'Comment hidden' });
    });

    it('should throw if not found', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.hideComment('comment-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unhideComment', () => {
    it('should unhide comment', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(baseComment);
      mockPrisma.comment.update.mockResolvedValue(baseComment);

      const result = await service.unhideComment('comment-1');

      expect(mockPrisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: {
          isHidden: false,
          hiddenAt: null,
          hiddenBy: null,
        },
      });

      expect(result).toEqual({ message: 'Comment unhidden' });
    });

    it('should throw if deleted', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue({
        ...baseComment,
        isDeleted: true,
      });

      await expect(service.unhideComment('comment-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteComment', () => {
    it('should delete comment', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(baseComment);
      mockPrisma.comment.update.mockResolvedValue(baseComment);

      const result = await service.deleteComment('comment-1', 'admin-1');

      expect(mockPrisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: expect.objectContaining({
          isDeleted: true,
          deletedBy: 'admin-1',
        }),
      });

      expect(result).toEqual({ message: 'Comment removed' });
    });

    it('should throw if not found', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteComment('comment-1', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
