import { Test, TestingModule } from '@nestjs/testing';
import { AdminReportsService } from './admin-reports.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminAction, ReportStatus } from '@prisma/client';
import { ResolveReportDto } from '../dto/resolve-report.dto';

// ── Strict Types ────────────────────────────────────────────
type ReportEntity = {
  id: string;
  targetType: 'TRACK' | 'COMMENT' | 'USER';
  targetId: string;
};

type MockFn<Args extends unknown[], Return> = jest.Mock<Promise<Return>, Args>;

type MockTx = {
  report: { update: MockFn<[unknown], unknown> };
  track: { update: MockFn<[unknown], unknown> };
  comment: { update: MockFn<[unknown], unknown> };
  user: { update: MockFn<[unknown], unknown> };
};

type MockPrisma = {
  report: {
    findMany: MockFn<[unknown], unknown[]>;
    count: MockFn<[unknown], number>;
    findUnique: MockFn<[unknown], ReportEntity | null>;
    groupBy: MockFn<[unknown], unknown[]>;
  };
  $transaction: jest.Mock<Promise<void>, [(tx: MockTx) => Promise<void>]>;
};

const mockPrisma: MockPrisma = {
  report: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('AdminReportsService', () => {
  let service: AdminReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminReportsService>(AdminReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  const baseReport: ReportEntity = {
    id: 'r1',
    targetType: 'TRACK',
    targetId: 't1',
  };

  // ── getReports ────────────────────────────────────────────
  describe('getReports', () => {
    it('should return paginated results', async () => {
      mockPrisma.report.findMany.mockResolvedValue([{ id: 'r1' }]);
      mockPrisma.report.count.mockResolvedValue(1);

      const result = await service.getReports({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should calculate hasMore correctly', async () => {
      mockPrisma.report.findMany.mockResolvedValue([{ id: 'r1' }]);
      mockPrisma.report.count.mockResolvedValue(10);

      const result = await service.getReports({ page: 1, limit: 1 });

      expect(result.pagination.hasMore).toBe(true);
    });
  });

  // ── getReportById ─────────────────────────────────────────
  describe('getReportById', () => {
    it('should return report when found', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(baseReport);

      const result = await service.getReportById('r1');

      expect(result).toEqual(baseReport);
    });

    it('should throw if not found', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(null);

      await expect(service.getReportById('r1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── resolveReport ─────────────────────────────────────────
  describe('resolveReport', () => {
    it('should throw if status is PENDING', async () => {
      await expect(
        service.resolveReport('r1', 'admin-1', {
          status: ReportStatus.PENDING,
        } as ResolveReportDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if report not found', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveReport('r1', 'admin-1', {
          status: ReportStatus.RESOLVED,
        } as ResolveReportDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update report without action', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(baseReport);

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb({
          report: { update: jest.fn() },
          track: { update: jest.fn() },
          comment: { update: jest.fn() },
          user: { update: jest.fn() },
        });
      });

      const result = await service.resolveReport('r1', 'admin-1', {
        status: ReportStatus.RESOLVED,
        actionTaken: AdminAction.NONE,
      } as ResolveReportDto);

      expect(result).toEqual({ message: 'Report updated' });
    });

    it('should apply track hide action', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(baseReport);

      const tx: MockTx = {
        report: { update: jest.fn() },
        track: { update: jest.fn() },
        comment: { update: jest.fn() },
        user: { update: jest.fn() },
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(tx);
      });

      await service.resolveReport('r1', 'admin-1', {
        status: ReportStatus.RESOLVED,
        actionTaken: AdminAction.HIDE,
      } as ResolveReportDto);

      expect(tx.track.update).toHaveBeenCalled();
    });

    it('should apply comment remove action', async () => {
      mockPrisma.report.findUnique.mockResolvedValue({
        ...baseReport,
        targetType: 'COMMENT',
      });

      const tx: MockTx = {
        report: { update: jest.fn() },
        track: { update: jest.fn() },
        comment: { update: jest.fn() },
        user: { update: jest.fn() },
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(tx);
      });

      await service.resolveReport('r1', 'admin-1', {
        status: ReportStatus.RESOLVED,
        actionTaken: AdminAction.REMOVE,
      } as ResolveReportDto);

      expect(tx.comment.update).toHaveBeenCalled();
    });

    it('should apply user suspend action', async () => {
      mockPrisma.report.findUnique.mockResolvedValue({
        ...baseReport,
        targetType: 'USER',
      });

      const tx: MockTx = {
        report: { update: jest.fn() },
        track: { update: jest.fn() },
        comment: { update: jest.fn() },
        user: { update: jest.fn() },
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(tx);
      });

      await service.resolveReport('r1', 'admin-1', {
        status: ReportStatus.RESOLVED,
        actionTaken: AdminAction.SUSPEND_USER,
      } as ResolveReportDto);

      expect(tx.user.update).toHaveBeenCalled();
    });
  });
});
