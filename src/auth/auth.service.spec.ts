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

// ─── Mock bcrypt entirely — keeps tests fast, we trust bcrypt works ───
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── Typed prisma mock shape — avoids jest.Mocked<PrismaService> deep type issues ───
type PrismaMock = {
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  emailVerificationToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  refreshToken: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: jest.Mocked<JwtService>;
  let mailerService: jest.Mocked<MailerService>;

  // ─── Base mock user — spread and override per test as needed ───────
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    pass_hash: 'hashed_value',
    role: 'LISTENER',
    is_verified: true,
    is_active: true,
    is_deleted: false,
    is_banned: false,
    is_suspended: false,
    suspended_until: null,
    suspended_by_id: null,
    suspensionReason: null,
    login_method: 'LOCAL',
    avatar_url: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,

        // ─── Prisma mock — every method is a jest.fn() ───────────────
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn() as jest.Mock,
              create: jest.fn() as jest.Mock,
              update: jest.fn() as jest.Mock,
            },
            emailVerificationToken: {
              create: jest.fn() as jest.Mock,
              findUnique: jest.fn() as jest.Mock,
              update: jest.fn() as jest.Mock,
              updateMany: jest.fn() as jest.Mock,
            },
            passwordResetToken: {
              create: jest.fn() as jest.Mock,
              findUnique: jest.fn() as jest.Mock,
              update: jest.fn() as jest.Mock,
              updateMany: jest.fn() as jest.Mock,
            },
            refreshToken: {
              create: jest.fn() as jest.Mock,
              findMany: jest.fn() as jest.Mock,
              update: jest.fn() as jest.Mock,
              updateMany: jest.fn() as jest.Mock,
            },
          } satisfies PrismaMock,
        },

        // ─── JWT mock — sign returns fake token, verify returns fake payload ───
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

        // ─── Config mock — returns fake secret for any config key ────
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_secret'),
          },
        },

        // ─── Mailer mock — no real emails sent during tests ──────────
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
    prisma = module.get(PrismaService) as any;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    mailerService = module.get(MailerService) as jest.Mocked<MailerService>;
  });

  // ─── Clear all mocks after each test — prevents state leaking ────
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

    it('should register a new user successfully', async () => {
      // email check → not found, username check → not found
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, is_verified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register(registerDto);

      expect(result.message).toBe('Registration successful. Please verify your email.');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.isVerified).toBe(false);
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      // first findUnique (email check) returns existing user
      prisma.user.findUnique.mockResolvedValueOnce(mockUser as any);

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Email already in use'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      // email check passes, username check finds existing user
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser as any);

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Username already taken'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should not return tokens after registration', async () => {
      // tokens only come after email verification, never at registration
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, is_verified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register(registerDto);

      expect((result as any).accessToken).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
    });

    it('should send verification email with correct args', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ ...mockUser, is_verified: false });
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      await service.register(registerDto);

      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.username,
        expect.any(String), // the generated token — we don't care about exact value
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
      user_id: 'user-123',
      token: 'ABC123',
      used: false,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // valid, 24h from now
    };

    it('should verify email and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, is_verified: false } as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue(mockVerificationToken as any);
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
      prisma.emailVerificationToken.findUnique.mockResolvedValue(mockVerificationToken as any);

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
        expires_at: new Date(Date.now() - 1000), // expired 1 second ago
      } as any);

      await expect(service.verifyEmail(verifyDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification token'),
      );
    });

    it('should throw if token belongs to different user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...mockVerificationToken,
        user_id: 'different-user-456', // token doesn't belong to this user
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
      expect(result.message).toBe('Email available. Please continue with registration.');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // RESEND VERIFICATION
  // ══════════════════════════════════════════════════════════════════
  describe('resendVerification', () => {
    it('should resend verification email successfully', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, is_verified: false } as any);
      prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.resendVerification({ email: 'test@example.com' });

      expect(result.message).toBe('Verification email resent. Please check your inbox.');
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resendVerification({ email: 'ghost@example.com' }),
      ).rejects.toThrow(new NotFoundException('No account found with this email'));
    });

    it('should throw BadRequestException if email already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, is_verified: true } as any);

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
        is_deleted: true,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw UnauthorizedException if account is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_active: false,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw BadRequestException if user is OAuth only', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        login_method: 'GOOGLE',
        pass_hash: null,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      // Override bcrypt.compare to return false for this test only
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should return unverified response without tokens if email not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_verified: false,
      } as any);

      const result = await service.login(loginDto);

      expect(result.user.isVerified).toBe(false);
      expect((result as any).accessToken).toBeUndefined();
    });

    it('should throw ForbiddenException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_banned: true,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new ForbiddenException('Your account has been permanently banned.'),
      );
    });

    it('should throw ForbiddenException if user is actively suspended', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_suspended: true,
        suspended_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // still suspended
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
    });

    it('should clear suspension and login if suspension has expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_suspended: true,
        suspended_until: new Date(Date.now() - 1000), // expired 1 second ago
      } as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.login(loginDto);

      // suspension cleared, login succeeds, tokens returned
      expect(result.accessToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_suspended: false }),
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
      user_id: 'user-123',
      token: 'hashed_value',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // valid, 7 days
      is_active: true,
    };

    it('should rotate refresh token and return new tokens', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123', email: 'test@example.com' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.refreshToken(refreshDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // old token must be revoked
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_active: false }),
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
      jwtService.verify.mockReturnValue({ sub: 'user-123', email: 'test@example.com' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if no token matches via bcrypt compare', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123', email: 'test@example.com' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      // bcrypt.compare returns false — token doesn't match any stored hash
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if token is expired in DB', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123', email: 'test@example.com' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([{
        ...mockStoredToken,
        expires_at: new Date(Date.now() - 1000), // expired
      }] as any);

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
      user_id: 'user-123',
      token: 'hashed_value',
      is_active: true,
    };

    it('should sign out successfully and revoke token', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123' } as any);
      prisma.refreshToken.findMany.mockResolvedValue([mockStoredToken] as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);

      const result = await service.signout(logoutDto);

      expect(result.message).toBe('Signed out successfully.');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_active: false }),
        }),
      );
    });

    it('should return success even if JWT is invalid', async () => {
      // invalid token = already signed out, still return success
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
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.passwordResetToken.create.mockResolvedValue({} as any);

      const result = await service.forgotPassword(forgotDto);

      expect(result.message).toBe(genericMessage);
      expect(mailerService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('should return same generic message even if email does not exist', async () => {
      // security — never reveal if email exists
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'ghost@example.com' });

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
      user_id: 'user-123',
      token: 'RESET1',
      used: false,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000), // valid, 3h from now
    };

    it('should reset password successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.passwordResetToken.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.resetPassword(resetDto);

      expect(result.message).toBe('Password reset successfully.');
      expect(result.signedOutAll).toBe(true);
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      await expect(
        service.resetPassword({ ...resetDto, confirmPassword: 'WrongPassword!' }),
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
        expires_at: new Date(Date.now() - 1000), // expired
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
      prisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.passwordResetToken.update.mockResolvedValue({} as any);

      const result = await service.resetPassword({ ...resetDto, signoutAll: false });

      expect(result.signedOutAll).toBe(false);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DELETE ACCOUNT
  // ══════════════════════════════════════════════════════════════════
  describe('deleteAccount', () => {
    const deleteDto = { password: 'Password123!' };

    it('should soft delete account successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.deleteAccount('user-123', deleteDto);

      expect(result.message).toBe('Your account has been deleted successfully.');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_deleted: true, is_active: false }),
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('user-123', deleteDto)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });

    it('should throw ForbiddenException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_banned: true,
      } as any);

      await expect(service.deleteAccount('user-123', deleteDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.deleteAccount('user-123', deleteDto)).rejects.toThrow(
        new UnauthorizedException('Invalid password'),
      );
    });

    it('should throw BadRequestException if password not provided for LOCAL user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      await expect(
        service.deleteAccount('user-123', { password: undefined }),
      ).rejects.toThrow(new BadRequestException('Password is required to delete your account'));
    });

    it('should skip password check for pure OAuth user', async () => {
      // OAuth user has no pass_hash — no password check needed
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        pass_hash: null,
        login_method: 'GOOGLE',
      } as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.deleteAccount('user-123', { password: undefined });

      expect(result.message).toBe('Your account has been deleted successfully.');
    });

    it('should revoke all active refresh tokens on delete', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any);

      await service.deleteAccount('user-123', deleteDto);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_active: false }),
        }),
      );
    });
  });
});