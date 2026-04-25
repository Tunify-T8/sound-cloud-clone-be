import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportedEntityType } from '@prisma/client';
import { Prisma } from '@prisma/client';
// ── Strict Prisma Mock (no any leakage) ─────────────────────
type MockFn<A extends unknown[], R> = jest.Mock<Promise<R>, A>;

type PrismaMock = {
  reportReason: {
    findMany: MockFn<[unknown], unknown>;
    findUnique: MockFn<[unknown], unknown>;
  };
  report: {
    create: MockFn<[unknown], unknown>;
  };
  comment: {
    findUnique: MockFn<[unknown], unknown>;
  };
  track: {
    findUnique: MockFn<[unknown], unknown>;
  };
  collection: {
    findUnique: MockFn<[unknown], unknown>;
  };
  user: {
    findUnique: MockFn<[unknown], unknown>;
  };
};

const mockPrisma: PrismaMock = {
  reportReason: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  report: {
    create: jest.fn(),
  },
  comment: {
    findUnique: jest.fn(),
  },
  track: {
    findUnique: jest.fn(),
  },
  collection: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const prismaError = new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed',
  {
    code: 'P2002',
    clientVersion: 'test',
  },
);

mockPrisma.report.create.mockRejectedValue(prismaError);

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getReportReasons ───────────────────────────────────────
  describe('getReportReasons', () => {
    it('should return report reasons', async () => {
      const reasons = [{ id: 'r1', label: 'Spam' }];

      mockPrisma.reportReason.findMany.mockResolvedValue(reasons);

      const result = await service.getReportReasons();

      expect(mockPrisma.reportReason.findMany).toHaveBeenCalled();
      expect(result).toEqual(reasons);
    });
  });

  // ── submitReport ───────────────────────────────────────────
  describe('submitReport', () => {
    const baseDto = {
      reportedEntityType: ReportedEntityType.TRACK,
      reportedEntityId: 't1',
      reasonId: 'r1',
      detailsText: 'bad',
      violationAreas: [],
    };

    it('should throw if reason does not exist', async () => {
      mockPrisma.reportReason.findUnique.mockResolvedValue(null);

      mockPrisma.track.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u2',
      });

      await expect(service.submitReport('u1', baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if user reports themselves (USER type)', async () => {
      const dto = {
        ...baseDto,
        reportedEntityType: ReportedEntityType.USER,
        reportedEntityId: 'u1',
      };

      mockPrisma.reportReason.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(service.submitReport('u1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if entity does not exist', async () => {
      mockPrisma.reportReason.findUnique.mockResolvedValue({ id: 'r1' });

      mockPrisma.track.findUnique.mockResolvedValue(null);

      await expect(service.submitReport('u1', baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create report successfully', async () => {
      mockPrisma.reportReason.findUnique.mockResolvedValue({ id: 'r1' });

      mockPrisma.track.findUnique.mockResolvedValue({ userId: 'u2' });

      mockPrisma.report.create.mockResolvedValue({});

      const result = await service.submitReport('u1', baseDto);

      expect(mockPrisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reporterId: 'u1',
          targetType: ReportedEntityType.TRACK,
          targetId: 't1',
        }),
      });

      expect(result).toEqual({ message: 'Report submitted' });
    });

    it('should throw on duplicate report (P2002)', async () => {
      mockPrisma.reportReason.findUnique.mockResolvedValue({
        id: 'r1',
        label: 'Spam',
      });

      mockPrisma.track.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u2',
      });

      mockPrisma.report.create.mockRejectedValue(prismaError);

      await expect(service.submitReport('u1', baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── submitSpamReport ───────────────────────────────────────
  describe('submitSpamReport', () => {
    it('should throw if comment not found', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.submitSpamReport('u1', 'c1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if reporting own comment', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue({
        id: 'c1',
        userId: 'u1',
      });

      await expect(service.submitSpamReport('u1', 'c1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create spam report', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue({
        id: 'c1',
        userId: 'u2',
      });

      mockPrisma.report.create.mockResolvedValue({});

      const result = await service.submitSpamReport('u1', 'c1');

      expect(mockPrisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reporterId: 'u1',
          targetType: ReportedEntityType.COMMENT,
          targetId: 'c1',
        }),
      });

      expect(result).toEqual({ message: 'Report submitted' });
    });

    it('should throw on duplicate spam report', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue({
        id: 'c1',
        userId: 'u2',
      });

      mockPrisma.report.create.mockRejectedValue(prismaError);

      await expect(service.submitSpamReport('u1', 'c1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
