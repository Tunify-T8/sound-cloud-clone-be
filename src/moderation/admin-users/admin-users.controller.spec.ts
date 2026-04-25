import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import * as usersDecorator from 'src/users/users.decorator';
import { SuspendUserDto } from '../dto/suspended-user.dto';

// ── Typed Service Mock ──────────────────────────────────────
type ServiceMock = {
  getUserModerationOverview: jest.Mock<Promise<unknown>, [string]>;
  suspendUser: jest.Mock<
    Promise<{ message: string }>,
    [string, string, SuspendUserDto]
  >;
  unsuspendUser: jest.Mock<Promise<{ message: string }>, [string]>;
};

const mockAdminUsersService: ServiceMock = {
  getUserModerationOverview: jest.fn(),
  suspendUser: jest.fn(),
  unsuspendUser: jest.fn(),
};

describe('AdminUsersController', () => {
  let controller: AdminUsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: AdminUsersService, useValue: mockAdminUsersService },
      ],
    }).compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
  });

  afterEach(() => jest.clearAllMocks());

  const adminUser: usersDecorator.JwtPayload = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'admin',
  };

  // ── getUserModerationOverview ─────────────────────────────
  describe('getUserModerationOverview', () => {
    it('should call service with userId', async () => {
      mockAdminUsersService.getUserModerationOverview.mockResolvedValue({});

      await controller.getUserModerationOverview('user-1');

      expect(
        mockAdminUsersService.getUserModerationOverview,
      ).toHaveBeenCalledWith('user-1');
    });

    it('should return service result', async () => {
      const mockResult = { reports: [], tracks: [] };

      mockAdminUsersService.getUserModerationOverview.mockResolvedValue(
        mockResult,
      );

      const result = await controller.getUserModerationOverview('user-1');

      expect(result).toEqual(mockResult);
    });
  });

  // ── suspendUser ───────────────────────────────────────────
  describe('suspendUser', () => {
    it('should call service with correct params', async () => {
      const dto: SuspendUserDto = {
        reason: 'violation',
        durationHours: 7,
      };

      mockAdminUsersService.suspendUser.mockResolvedValue({
        message: 'User suspended',
      });

      await controller.suspendUser('user-1', dto, adminUser);

      expect(mockAdminUsersService.suspendUser).toHaveBeenCalledWith(
        'user-1',
        'admin-1',
        dto,
      );
    });

    it('should return service result', async () => {
      const dto: SuspendUserDto = {
        reason: 'violation',
        durationHours: 7,
      };

      const mockResult = { message: 'User suspended' };

      mockAdminUsersService.suspendUser.mockResolvedValue(mockResult);

      const result = await controller.suspendUser('user-1', dto, adminUser);

      expect(result).toEqual(mockResult);
    });
  });

  // ── unsuspendUser ─────────────────────────────────────────
  describe('unsuspendUser', () => {
    it('should call service with userId', async () => {
      mockAdminUsersService.unsuspendUser.mockResolvedValue({
        message: 'User unsuspended',
      });

      await controller.unsuspendUser('user-1');

      expect(mockAdminUsersService.unsuspendUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should return service result', async () => {
      const mockResult = { message: 'User unsuspended' };

      mockAdminUsersService.unsuspendUser.mockResolvedValue(mockResult);

      const result = await controller.unsuspendUser('user-1');

      expect(result).toEqual(mockResult);
    });
  });
});
