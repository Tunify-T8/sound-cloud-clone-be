import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SearchIndexService } from 'src/search-index/search-index.service';

// ── Typed Prisma Mock ───────────────────────────────────────
type MockFn<A extends unknown[], R> = jest.Mock<Promise<R>, A>;

type PrismaMock = {
  user: {
    findUnique: MockFn<[unknown], any>;
    update: MockFn<[unknown], any>;
  };
  report: {
    count: MockFn<[unknown], number>;
  };
};

const mockPrisma: PrismaMock = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  report: {
    count: jest.fn(),
  },
};

type SearchIndexMock = {
  indexUser: jest.Mock<Promise<void>, [string]>;
};

const mockSearchIndexService: SearchIndexMock = {
  indexUser: jest.fn(),
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── suspendUser ───────────────────────────────────────────
  describe('suspendUser', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.suspendUser('u1', 'admin-1', {
          reason: 'test',
          durationHours: 1,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if user is deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: true,
        isSuspended: false,
      });

      await expect(
        service.suspendUser('u1', 'admin-1', {
          reason: 'test',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if already suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: false,
        isSuspended: true,
      });

      await expect(
        service.suspendUser('u1', 'admin-1', {
          reason: 'test',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should suspend user with durationHours', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: false,
        isSuspended: false,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const dto = { reason: 'violation', durationHours: 2 };

      const result = await service.suspendUser('u1', 'admin-1', dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          isSuspended: true,
          suspendedById: 'admin-1',
          suspensionReason: 'violation',
        }),
      });

      expect(result).toEqual({ message: 'User suspended' });
    });

    it('should suspend user with null duration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: false,
        isSuspended: false,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const dto = { reason: 'violation' };

      await service.suspendUser('u1', 'admin-1', dto as any);

      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  // ── unsuspendUser ─────────────────────────────────────────
  describe('unsuspendUser', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.unsuspendUser('u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if user is not suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: false,
        isSuspended: false,
      });

      await expect(service.unsuspendUser('u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should unsuspend user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        isDeleted: false,
        isSuspended: true,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.unsuspendUser('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          isSuspended: false,
          suspendedById: null,
          suspendedUntil: null,
          suspensionReason: null,
        },
      });

      expect(result).toEqual({ message: 'User unsuspended' });
    });
  });

  // ── getUserModerationOverview ─────────────────────────────
  describe('getUserModerationOverview', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserModerationOverview('u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return overview with report count', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'user',
        _count: {
          submittedReports: 2,
          tracks: 3,
          comments: 4,
        },
      });

      mockPrisma.report.count.mockResolvedValue(5);

      const result = await service.getUserModerationOverview('u1');

      expect(mockPrisma.report.count).toHaveBeenCalledWith({
        where: { targetId: 'u1' },
      });

      expect(result.reportsAgainstCount).toBe(5);
    });

    it('should return full merged user object', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'user',
        isSuspended: false,
        _count: {
          submittedReports: 0,
          tracks: 0,
          comments: 0,
        },
      });

      mockPrisma.report.count.mockResolvedValue(0);

      const result = await service.getUserModerationOverview('u1');

      expect(result.id).toBe('u1');
      expect(result.reportsAgainstCount).toBe(0);
    });
  });

  // ── banUser ───────────────────────────────────────────────
  describe('banUser', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.banUser('u1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if user is deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: true,
        isBanned: false,
      });

      await expect(service.banUser('u1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if already banned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        isBanned: true,
      });

      await expect(service.banUser('u1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if admin tries to ban themselves', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        isDeleted: false,
        isBanned: false,
      });

      await expect(service.banUser('admin-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should ban user and clear suspension fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        isBanned: false,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.banUser('u1', 'admin-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          isBanned: true,
          bannedById: 'admin-1',
          isSuspended: false,
          suspendedById: null,
          suspendedUntil: null,
          suspensionReason: null,
        },
      });

      expect(mockSearchIndexService.indexUser).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ message: 'User banned' });
    });
  });

  // ── unbanUser ─────────────────────────────────────────────
  describe('unbanUser', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.unbanUser('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if user is deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: true,
        isBanned: true,
      });

      await expect(service.unbanUser('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if user is not banned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        isBanned: false,
      });

      await expect(service.unbanUser('u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should unban user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        isBanned: true,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.unbanUser('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          isBanned: false,
          bannedById: null,
        },
      });

      expect(mockSearchIndexService.indexUser).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ message: 'User unbanned' });
    });
  });
});
