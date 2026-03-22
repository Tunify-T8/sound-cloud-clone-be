import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  compare: jest.fn().mockResolvedValue(true),
}));

type PrismaMock = {
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  emailVerificationToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  passwordResetToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: jest.Mocked<JwtService>;
  let mailerService: jest.Mocked<MailerService>;

  // ─── Base mock user ───────────────────────────────────────────────
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    passHash: 'hashed_value',
    role: 'LISTENER',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    isBanned: false,
    isSuspended: false,
    suspendedUntil: null,
    suspendedById: null,
    suspensionReason: null,
    loginMethod: 'LOCAL',
    avatarUrl: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            emailVerificationToken: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            passwordResetToken: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            refreshToken: {
              create: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          } satisfies PrismaMock,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock_jwt_token'),
            verify: jest.fn().mockReturnValue({
              sub: 'user-123',
              email: 'test@example.com',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'NODE_ENV') return 'development';
              return 'mock_secret';
            }),
          },
        },
        {
          provide: MailerService,
          useValue: {
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
    mailerService = module.get(MailerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════
  // REGISTER
  // ══════════════════════════════════════════════════════════════════
  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123!',
      gender: 'MALE' as any,
      date_of_birth: new Date('2000-01-01'),
    };

    it('should skip CAPTCHA verification in development', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, isVerified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        gender: 'MALE' as any,
        date_of_birth: new Date('2000-01-01'),
      });

      expect(result.message).toBe(
        'Registration successful. Please verify your email.',
      );
    });

    it('should register a new user successfully', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, isVerified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register(registerDto);

      expect(result.message).toBe(
        'Registration successful. Please verify your email.',
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.isVerified).toBe(false);
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser as any);

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Email already in use'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser as any);

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Username already taken'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should not return tokens after registration', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, isVerified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register(registerDto);

      expect((result as any).accessToken).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
    });

    it('should send verification email with correct args', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, isVerified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      await service.register(registerDto);

      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.username,
        expect.any(String),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // VERIFY EMAIL
  // ══════════════════════════════════════════════════════════════════
  describe('verifyEmail', () => {
    const verifyDto = {
      email: 'test@example.com',
      token: 'ABC123',
    };

    const mockVerificationToken = {
      id: 'token-123',
      userId: 'user-123',
      token: 'ABC123',
      used: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    it('should verify email and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isVerified: false,
      } as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        mockVerificationToken as any,
      );
      prisma.emailVerificationToken.update.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.verifyEmail(verifyDto);

      expect(result.message).toBe('Email verified successfully');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.isVerified).toBe(true);
    });

    it('should throw if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        mockVerificationToken as any,
      );

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });

    it('should throw if token not found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });

    it('should throw if token already used', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...mockVerificationToken,
        used: true,
      } as any);

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });

    it('should throw if token expired', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...mockVerificationToken,
        expiresAt: new Date(Date.now() - 1000),
      } as any);

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });

    it('should throw if token belongs to different user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...mockVerificationToken,
        userId: 'different-user-456',
      } as any);

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // CHECK EMAIL
  // ══════════════════════════════════════════════════════════════════
  describe('checkEmail', () => {
    it('should return exists true if email is taken', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.checkEmail({ email: 'test@example.com' });

      expect(result.exists).toBe(true);
      expect(result.message).toBe('Welcome back! Please sign in.');
    });

    it('should return exists false if email is available', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkEmail({ email: 'new@example.com' });

      expect(result.exists).toBe(false);
      expect(result.message).toBe(
        'Email available. Please continue with registration.',
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // RESEND VERIFICATION
  // ══════════════════════════════════════════════════════════════════
  describe('resendVerification', () => {
    it('should resend verification email successfully', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isVerified: false,
      } as any);
      prisma.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      } as any);
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.resendVerification({
        email: 'test@example.com',
      });

      expect(result.message).toBe(
        'Verification email resent. Please check your inbox.',
      );
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resendVerification({ email: 'ghost@example.com' }),
      ).rejects.toThrow(
        new NotFoundException('No account found with this email'),
      );
    });

    it('should throw BadRequestException if email already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isVerified: true,
      } as any);

      await expect(
        service.resendVerification({ email: 'test@example.com' }),
      ).rejects.toThrow(new BadRequestException('Email is already verified'));
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════
  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw UnauthorizedException if account is deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isDeleted: true,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw UnauthorizedException if account is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw BadRequestException if user is OAuth only', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        loginMethod: 'GOOGLE',
        passHash: null,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should return unverified response without tokens if email not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isVerified: false,
      } as any);

      const result = await service.login(loginDto);

      expect(result.user.isVerified).toBe(false);
      expect((result as any).accessToken).toBeUndefined();
    });

    it('should throw ForbiddenException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isBanned: true,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new ForbiddenException('Your account has been permanently banned.'),
      );
    });

    it('should throw ForbiddenException if user is actively suspended', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isSuspended: true,
        suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
    });

    it('should clear suspension and login if suspension has expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isSuspended: true,
        suspendedUntil: new Date(Date.now() - 1000),
      } as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isSuspended: false }),
        }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // REFRESH TOKEN
  // ══════════════════════════════════════════════════════════════════
  describe('refreshToken', () => {
    const refreshDto = { refreshToken: 'mock_refresh_token' };

    const mockStoredToken = {
      id: 'rt-123',
      userId: 'user-123',
      token: 'hashed_value',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    };

    it('should rotate refresh token and return new tokens', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
      } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.refreshToken(refreshDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('should throw if JWT is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if no active tokens found in DB', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
      } as any);
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if no token matches via bcrypt compare', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
      } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if token is expired in DB', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
      } as any);
      prisma.refreshToken.findMany.mockResolvedValue([
        {
          ...mockStoredToken,
          expiresAt: new Date(Date.now() - 1000),
        },
      ] as any);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // SIGNOUT
  // ══════════════════════════════════════════════════════════════════
  describe('signout', () => {
    const logoutDto = { refreshToken: 'mock_refresh_token' };

    const mockStoredToken = {
      id: 'rt-123',
      userId: 'user-123',
      token: 'hashed_value',
      isActive: true,
    };

    it('should sign out successfully and revoke token', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);

      const result = await service.signout(logoutDto);

      expect(result.message).toBe('Signed out successfully.');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('should return success even if JWT is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      const result = await service.signout(logoutDto);

      expect(result.message).toBe('Signed out successfully.');
    });

    it('should return success if no active tokens found', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([]);

      const result = await service.signout(logoutDto);

      expect(result.message).toBe('Signed out successfully.');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ══════════════════════════════════════════════════════════════════
  describe('forgotPassword', () => {
    const forgotDto = { email: 'test@example.com' };
    const genericMessage =
      'If an account exists with this email, you will receive a password reset link shortly.';

    it('should send reset email and return generic message', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      } as any);
      prisma.passwordResetToken.create.mockResolvedValue({} as any);

      const result = await service.forgotPassword(forgotDto);

      expect(result.message).toBe(genericMessage);
      expect(mailerService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('should return same generic message even if email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'ghost@example.com',
      });

      expect(result.message).toBe(genericMessage);
      expect(mailerService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // RESET PASSWORD
  // ══════════════════════════════════════════════════════════════════
  describe('resetPassword', () => {
    const resetDto = {
      email: 'test@example.com',
      token: 'RESET1',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
      signoutAll: true,
    };

    const mockResetToken = {
      id: 'rt-abc',
      userId: 'user-123',
      token: 'RESET1',
      used: false,
      expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    };

    it('should reset password successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        mockResetToken as any,
      );
      prisma.user.update.mockResolvedValue({} as any);
      prisma.passwordResetToken.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.resetPassword(resetDto);

      expect(result.message).toBe('Password reset successfully.');
      expect(result.signedOutAll).toBe(true);
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      await expect(
        service.resetPassword({
          ...resetDto,
          confirmPassword: 'WrongPassword!',
        }),
      ).rejects.toThrow(new BadRequestException('Passwords do not match'));
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired reset token'),
      );
    });

    it('should throw UnauthorizedException if token is expired', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...mockResetToken,
        expiresAt: new Date(Date.now() - 1000),
      } as any);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired reset token'),
      );
    });

    it('should throw UnauthorizedException if token already used', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...mockResetToken,
        used: true,
      } as any);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired reset token'),
      );
    });

    it('should not sign out all devices if signoutAll is false', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        mockResetToken as any,
      );
      prisma.user.update.mockResolvedValue({} as any);
      prisma.passwordResetToken.update.mockResolvedValue({} as any);

      const result = await service.resetPassword({
        ...resetDto,
        signoutAll: false,
      });

      expect(result.signedOutAll).toBe(false);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DELETE ACCOUNT
  // ══════════════════════════════════════════════════════════════════
  describe('deleteAccount', () => {
    
    it('should soft delete account successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.deleteAccount('user-123');

      expect(result.message).toBe(
        'Your account has been deleted successfully.',
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: true, isActive: false }),
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteAccount('user-123'),
      ).rejects.toThrow(new UnauthorizedException('User not found'));
    });

    it('should throw ForbiddenException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isBanned: true,
      } as any);

      await expect(
        service.deleteAccount('user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    // it('should throw UnauthorizedException if password is wrong', async () => {
    //   prisma.user.findUnique.mockResolvedValue(mockUser as any);
    //   (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    //   await expect(
    //     service.deleteAccount('user-123'),
    //   ).rejects.toThrow(new UnauthorizedException('Invalid password'));
    // });

    // it('should throw BadRequestException if password not provided for LOCAL user', async () => {
    //   prisma.user.findUnique.mockResolvedValue(mockUser as any);

    //   await expect(
    //     service.deleteAccount('user-123', { password: undefined }),
    //   ).rejects.toThrow(
    //     new BadRequestException('Password is required to delete your account'),
    //   );
    // });

    // it('should skip password check for pure OAuth user', async () => {
    //   prisma.user.findUnique.mockResolvedValue({
    //     ...mockUser,
    //     passHash: null,
    //     loginMethod: 'GOOGLE',
    //   } as any);
    //   prisma.user.update.mockResolvedValue({} as any);
    //   prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

    //   const result = await service.deleteAccount('user-123', {
    //     password: undefined,
    //   });

    //   expect(result.message).toBe(
    //     'Your account has been deleted successfully.',
    //   );
    // });

    it('should revoke all active refresh tokens on delete', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any);

      await service.deleteAccount('user-123');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });
});
