import { Test, TestingModule } from '@nestjs/testing';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';

// ── Mock Service ────────────────────────────────────────────
const mockAdminContentService = {
  hideTrack: jest.fn(),
  unhideTrack: jest.fn(),
  deleteTrack: jest.fn(),
  hideComment: jest.fn(),
  unhideComment: jest.fn(),
  deleteComment: jest.fn(),
};

describe('AdminContentController', () => {
  let controller: AdminContentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminContentController],
      providers: [
        {
          provide: AdminContentService,
          useValue: mockAdminContentService,
        },
      ],
    }).compile();

    controller = module.get<AdminContentController>(AdminContentController);
  });

  afterEach(() => jest.clearAllMocks());

  const user = { userId: 'admin-1', email: 'admin@example.com', role: 'admin' };

  // ── Tracks ────────────────────────────────────────────────
  describe('hideTrack', () => {
    it('should call service with correct params', async () => {
      mockAdminContentService.hideTrack.mockResolvedValue({});

      await controller.hideTrack('track-1', user);

      expect(mockAdminContentService.hideTrack).toHaveBeenCalledWith(
        'track-1',
        'admin-1',
      );
    });
  });

  describe('unhideTrack', () => {
    it('should call service with trackId', async () => {
      mockAdminContentService.unhideTrack.mockResolvedValue({});

      await controller.unhideTrack('track-1');

      expect(mockAdminContentService.unhideTrack).toHaveBeenCalledWith(
        'track-1',
      );
    });
  });

  describe('deleteTrack', () => {
    it('should call service with correct params', async () => {
      mockAdminContentService.deleteTrack.mockResolvedValue({});

      await controller.deleteTrack('track-1', user);

      expect(mockAdminContentService.deleteTrack).toHaveBeenCalledWith(
        'track-1',
        'admin-1',
      );
    });
  });

  // ── Comments ──────────────────────────────────────────────
  describe('hideComment', () => {
    it('should call service with correct params', async () => {
      mockAdminContentService.hideComment.mockResolvedValue({});

      await controller.hideComment('comment-1', user);

      expect(mockAdminContentService.hideComment).toHaveBeenCalledWith(
        'comment-1',
        'admin-1',
      );
    });
  });

  describe('unhideComment', () => {
    it('should call service with commentId', async () => {
      mockAdminContentService.unhideComment.mockResolvedValue({});

      await controller.unhideComment('comment-1');

      expect(mockAdminContentService.unhideComment).toHaveBeenCalledWith(
        'comment-1',
      );
    });
  });

  describe('deleteComment', () => {
    it('should call service with correct params', async () => {
      mockAdminContentService.deleteComment.mockResolvedValue({});

      await controller.deleteComment('comment-1', user);

      expect(mockAdminContentService.deleteComment).toHaveBeenCalledWith(
        'comment-1',
        'admin-1',
      );
    });
  });
});
