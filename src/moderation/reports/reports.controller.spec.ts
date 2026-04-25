import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import * as usersDecorator from 'src/users/users.decorator';
import { SubmitReportDto } from '../dto/submit-report.dto';
import { SpamReportDto } from '../dto/spam-report.dto';
import { ReportedEntityType, ViolationArea } from '@prisma/client';

// ── Typed Service Mock ───────────────────────────────────────
type ServiceMock = {
  getReportReasons: jest.Mock<Promise<unknown>, []>;
  submitReport: jest.Mock<Promise<unknown>, [string, SubmitReportDto]>;
  submitSpamReport: jest.Mock<Promise<unknown>, [string, string]>;
};

const mockReportsService: ServiceMock = {
  getReportReasons: jest.fn(),
  submitReport: jest.fn(),
  submitSpamReport: jest.fn(),
};

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  afterEach(() => jest.clearAllMocks());

  const user: usersDecorator.JwtPayload = {
    userId: 'user-1',
    email: 'user@test.com',
    role: 'user',
  };

  // ── getReportReasons ───────────────────────────────────────
  describe('getReportReasons', () => {
    it('should call service and return reasons', async () => {
      const mockResult = [{ id: 'r1', label: 'Spam' }];

      mockReportsService.getReportReasons.mockResolvedValue(mockResult);

      const result = await controller.getReportReasons();

      expect(mockReportsService.getReportReasons).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  // ── submitReport ───────────────────────────────────────────
  describe('submitReport', () => {
    it('should call service with userId and dto', async () => {
      const dto: SubmitReportDto = {
        reportedEntityType: ReportedEntityType.TRACK,
        reportedEntityId: 't1',
        reasonId: 'r1',
        detailsText: 'bad content',
        violationAreas: [ViolationArea.ARTWORK],
      } as SubmitReportDto;

      mockReportsService.submitReport.mockResolvedValue({ success: true });

      await controller.submitReport(dto, user);

      expect(mockReportsService.submitReport).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });

    it('should return service result', async () => {
      const dto: SubmitReportDto = {
        reportedEntityType: ReportedEntityType.TRACK,
        reportedEntityId: 't1',
        reasonId: 'r1',
        detailsText: 'bad content',
        violationAreas: [ViolationArea.AUDIO],
      } as SubmitReportDto;

      const mockResult = { success: true };

      mockReportsService.submitReport.mockResolvedValue(mockResult);

      const result = await controller.submitReport(dto, user);

      expect(result).toEqual(mockResult);
    });
  });

  // ── submitSpamReport ───────────────────────────────────────
  describe('submitSpamReport', () => {
    it('should call service with correct params', async () => {
      const dto: SpamReportDto = {
        reportedEntityId: 'entity-1',
      } as SpamReportDto;

      mockReportsService.submitSpamReport.mockResolvedValue({
        success: true,
      });

      await controller.submitSpamReport(dto, user);

      expect(mockReportsService.submitSpamReport).toHaveBeenCalledWith(
        'user-1',
        'entity-1',
      );
    });

    it('should return service result', async () => {
      const dto: SpamReportDto = {
        reportedEntityId: 'entity-1',
      } as SpamReportDto;

      const mockResult = { success: true };

      mockReportsService.submitSpamReport.mockResolvedValue(mockResult);

      const result = await controller.submitSpamReport(dto, user);

      expect(result).toEqual(mockResult);
    });
  });
});
