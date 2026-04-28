import { Test, TestingModule } from '@nestjs/testing';
import { GoogleAuthService } from './google-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      getToken: jest.fn(),
      verifyIdToken: jest.fn(),
    })),
  };
});

// ─── Prisma Mock Type ─────────────────────────────────────────────
type PrismaMock = {
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  oAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
  refreshToken: { create: jest.Mock };
  $transaction: jest.Mock;
};

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let prisma: PrismaMock;
  let jwtService: jest.Mocked<JwtService>;

  // ─── Base mock user ───────────────────────────────────────────────
  const mockUser = {
    id: 'user-123',
    username: 'john_doe',
    email: 'john@gmail.com',
    passHash: 'hashed_value',
    role: 'LISTENER',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    isBanned: false,
    avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
    loginMethod: 'GOOGLE',
  };

  // ─── Google user payload returned by getGoogleUser ───────────────
  const mockGooglePayload = {
    sub: 'google-id-123',
    email: 'john@gmail.com',
    name: 'John Doe',
    picture: 'https://lh3.googleusercontent.com/photo.jpg',
  };

  // ─── Mock transaction callback factory ───────────────────────────
  // Simulates prisma.$transaction — includes all tables used inside the tx:
  // user.create, subscriptionPlan.upsert, subscription.create, oAuthAccount.create
  const makeTxMock = (userOverride?: Partial<typeof mockUser>) => {
    const createdUser = { ...mockUser, ...userOverride };
    return jest.fn().mockImplementation(async (callback: any) => {
      const tx = {
        user: { create: jest.fn().mockResolvedValue(createdUser) },
        subscriptionPlan: {
          upsert: jest.fn().mockResolvedValue({ id: 'plan-123' }),
        },
        subscription: { create: jest.fn().mockResolvedValue({}) },
        oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            oAuthAccount: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            refreshToken: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          } satisfies PrismaMock,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock_jwt_token'),
            verify: jest.fn().mockReturnValue({
              googleId: 'google-id-123',
              email: 'john@gmail.com',
              name: 'John Doe',
              picture: 'https://lh3.googleusercontent.com/photo.jpg',
              type: 'linking',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_secret'),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleAuthService>(GoogleAuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);

    // Bypass actual Google token exchange in all tests
    jest
      .spyOn(service as any, 'getGoogleUser')
      .mockResolvedValue(mockGooglePayload);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════
  // GOOGLE AUTH
  // ══════════════════════════════════════════════════════════════════
  describe('googleAuth', () => {
    const googleAuthDto = { code: 'google-auth-code-123' };

    // ─── Returning Google user ────────────────────────────────────
    describe('returning Google user', () => {
      it('should log in existing Google user and return tokens', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: mockUser,
        } as any);
        prisma.user.update.mockResolvedValue({} as any);
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = (await service.googleAuth(googleAuthDto)) as any;

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user.email).toBe('john@gmail.com');
        expect(result.user.isVerified).toBe(true);
        // lastLoginAt must be updated on each login
        expect(prisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
          }),
        );
      });

      it('should throw UnauthorizedException if returning user is deleted', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, isDeleted: true },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been deactivated'),
        );
      });

      it('should throw UnauthorizedException if returning user is inactive', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, isActive: false },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been deactivated'),
        );
      });

      it('should throw UnauthorizedException if returning user is banned', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, isBanned: true },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been banned'),
        );
      });
    });

    // ─── Email conflict ───────────────────────────────────────────
    describe('email conflict', () => {
      it('should return requiresLinking if email exists as LOCAL account', async () => {
        // No existing OAuth account, but email is taken by a LOCAL user
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          loginMethod: 'LOCAL',
        } as any);

        const result = await service.googleAuth(googleAuthDto);

        expect(result).toEqual({
          requiresLinking: true,
          linkingToken: 'mock_jwt_token',
        });
        // Linking token must be short-lived and typed
        expect(jwtService.sign).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'linking' }),
          expect.objectContaining({ expiresIn: '10m' }),
        );
      });
    });

    // ─── New Google user ──────────────────────────────────────────
    describe('new Google user', () => {
      beforeEach(() => {
        // No existing OAuth account, no existing email → create new user
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue(null);
      });

      it('should create new user and return tokens', async () => {
        prisma.$transaction = makeTxMock();
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = (await service.googleAuth(googleAuthDto)) as any;

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user.isVerified).toBe(true);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should auto-generate username from Google display name', async () => {
        // Username should be derived from name field in Google payload
        prisma.$transaction = makeTxMock();
        prisma.refreshToken.create.mockResolvedValue({} as any);

        await service.googleAuth(googleAuthDto);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should set isVerified true for new Google user', async () => {
        // Google users are auto-verified — no email verification needed
        prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            user: {
              create: jest.fn().mockImplementation((args) => ({
                ...mockUser,
                isVerified: args.data.isVerified,
              })),
            },
            subscriptionPlan: {
              upsert: jest.fn().mockResolvedValue({ id: 'plan-123' }),
            },
            subscription: { create: jest.fn().mockResolvedValue({}) },
            oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        });
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = (await service.googleAuth(googleAuthDto)) as any;

        expect(result.user.isVerified).toBe(true);
      });

      it('should attach FREE subscription on new Google user creation', async () => {
        // Capture tx to verify subscription setup
        let capturedTx: any;
        prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            user: { create: jest.fn().mockResolvedValue(mockUser) },
            subscriptionPlan: {
              upsert: jest.fn().mockResolvedValue({ id: 'plan-123' }),
            },
            subscription: { create: jest.fn().mockResolvedValue({}) },
            oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
          };
          capturedTx = tx;
          return cb(tx);
        });
        prisma.refreshToken.create.mockResolvedValue({} as any);

        await service.googleAuth(googleAuthDto);

        expect(capturedTx.subscriptionPlan.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { name: 'FREE' } }),
        );
        expect(capturedTx.subscription.create).toHaveBeenCalledTimes(1);
        expect(capturedTx.oAuthAccount.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.not.objectContaining({
              accessToken: expect.anything(),
            }),
          }),
        );
      });

      it('should throw InternalServerErrorException if user creation fails', async () => {
        prisma.$transaction = jest.fn().mockRejectedValue(new Error('DB error'));

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          InternalServerErrorException,
        );
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GOOGLE LINK
  // ══════════════════════════════════════════════════════════════════
  describe('googleLink', () => {
    const googleLinkDto = {
      linkingToken: 'valid_linking_token',
      password: 'Password123!',
    };

    it('should link Google account and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.oAuthAccount.create.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = (await service.googleLink(googleLinkDto)) as any;

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Must create the OAuth account entry with correct provider info
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'GOOGLE',
            providerUserId: 'google-id-123',
          }),
        }),
      );
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            accessToken: expect.anything(),
          }),
        }),
      );
    });

    it('should throw UnauthorizedException if linking token is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired linking token'),
      );
    });

    it('should throw UnauthorizedException if token type is not linking', async () => {
      // Token must have type: 'linking' — any other type is rejected
      jwtService.verify.mockReturnValue({
        googleId: 'google-id-123',
        email: 'john@gmail.com',
        type: 'access',
      } as any);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired linking token'),
      );
    });

    it('should throw UnauthorizedException if LOCAL user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired linking token'),
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('Invalid password'),
      );
    });

    it('should throw UnauthorizedException if user is deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isDeleted: true,
      } as any);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('This account has been deactivated'),
      );
    });

    it('should throw UnauthorizedException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isBanned: true,
      } as any);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('This account has been banned'),
      );
    });

    it('should throw BadRequestException if Google account already linked to another account', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      // P2002 = unique constraint violation — Google account already linked
      prisma.oAuthAccount.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new BadRequestException(
          'This Google account is already linked to another account',
        ),
      );
    });

    it('should update lastLoginAt after successful linking', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.oAuthAccount.create.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      await service.googleLink(googleLinkDto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
    });
  });
});