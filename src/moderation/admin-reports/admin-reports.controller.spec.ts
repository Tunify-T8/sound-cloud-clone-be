import { Test, TestingModule } from '@nestjs/testing';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import * as usersDecorator from 'src/users/users.decorator';

// ── Typed Service Mock ──────────────────────────────────────
type ServiceMock = {
  getReports: jest.Mock<
    Promise<{
      data: unknown[];
      pagination: {
        page: number;
        limit: number;
        totalCount: number;
        hasMore: boolean;
      };
    }>,
    [unknown]
  >;
  getReportById: jest.Mock<Promise<unknown>, [string]>;
  resolveReport: jest.Mock<
    Promise<{ message: string }>,
    [string, string, unknown]
  >;
};

const mockService: ServiceMock = {
  getReports: jest.fn(),
  getReportById: jest.fn(),
  resolveReport: jest.fn(),
};

describe('AdminReportsController', () => {
  let controller: AdminReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReportsController],
      providers: [{ provide: AdminReportsService, useValue: mockService }],
    }).compile();

    controller = module.get<AdminReportsController>(AdminReportsController);
  });

  afterEach(() => jest.clearAllMocks());

  const user: usersDecorator.JwtPayload = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'admin',
  };

  // ── getReports ────────────────────────────────────────────
  describe('getReports', () => {
    it('should call service with query dto', async () => {
      const query = { page: 1, limit: 10 };

      mockService.getReports.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, totalCount: 0, hasMore: false },
      });

      await controller.getReports(query);

      expect(mockService.getReports).toHaveBeenCalledWith(query);
    });

    it('should return service result', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 10, totalCount: 0, hasMore: false },
      };

      mockService.getReports.mockResolvedValue(mockResult);

      const result = await controller.getReports({});

      expect(result).toEqual(mockResult);
    });
  });

  // ── getReportById ─────────────────────────────────────────
  describe('getReportById', () => {
    it('should call service with reportId', async () => {
      mockService.getReportById.mockResolvedValue({});

      await controller.getReportById('r1');

      expect(mockService.getReportById).toHaveBeenCalledWith('r1');
    });
  });

  // ── resolveReport ─────────────────────────────────────────
  describe('resolveReport', () => {
    it('should call service with correct params', async () => {
      const dto = { status: 'RESOLVED' as const };

      mockService.resolveReport.mockResolvedValue({ message: 'ok' });

      await controller.resolveReport('r1', dto, user);

      expect(mockService.resolveReport).toHaveBeenCalledWith(
        'r1',
        'admin-1',
        dto,
      );
    });

    it('should return service result', async () => {
      const dto = { status: 'RESOLVED' as const };
      const mockResult = { message: 'Report updated' };

      mockService.resolveReport.mockResolvedValue(mockResult);

      const result = await controller.resolveReport('r1', dto, user);

      expect(result).toEqual(mockResult);
    });
  });
});
