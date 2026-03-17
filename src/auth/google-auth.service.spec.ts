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

// ─── Mock bcrypt — keep tests fast ───────────────────────────────
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── Mock google-auth-library — we never talk to real Google in tests ───
jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      getToken: jest.fn(),
      verifyIdToken: jest.fn(),
    })),
  };
});

// ─── Typed prisma mock shape ──────────────────────────────────────
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
    pass_hash: 'hashed_value',
    role: 'LISTENER',
    is_verified: true,
    is_active: true,
    is_deleted: false,
    is_banned: false,
    avatar_url: 'https://lh3.googleusercontent.com/photo.jpg',
    login_method: 'GOOGLE',
  };

  // ─── Base mock Google user info — what getGoogleUser() returns ───
  // We'll mock getGoogleUser privately via the OAuth2Client mock
  const mockGooglePayload = {
    sub: 'google-id-123',
    email: 'john@gmail.com',
    name: 'John Doe',
    picture: 'https://lh3.googleusercontent.com/photo.jpg',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,

        // ─── Prisma mock ──────────────────────────────────────────
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn() as jest.Mock,
              create: jest.fn() as jest.Mock,
              update: jest.fn() as jest.Mock,
            },
            oAuthAccount: {
              findUnique: jest.fn() as jest.Mock,
              create: jest.fn() as jest.Mock,
            },
            refreshToken: {
              create: jest.fn() as jest.Mock,
            },
            // $transaction mock — executes the callback immediately with prisma as tx
            $transaction: jest.fn() as jest.Mock,
          } satisfies PrismaMock,
        },

        // ─── JWT mock ─────────────────────────────────────────────
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

        // ─── Config mock ──────────────────────────────────────────
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_secret'),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleAuthService>(GoogleAuthService);
    prisma = module.get(PrismaService) as any;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;

    // ─── Mock getGoogleUser privately ─────────────────────────────
    // We don't want real Google API calls in any test
    // Override the private method directly on the service instance
    jest.spyOn(service as any, 'getGoogleUser').mockResolvedValue(mockGooglePayload);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════
  // GOOGLE AUTH
  // ══════════════════════════════════════════════════════════════════
  describe('googleAuth', () => {
    const googleAuthDto = { code: 'google-auth-code-123' };

    // ── Returning Google user ─────────────────────────────────────
    describe('returning Google user', () => {
      it('should log in existing Google user and return tokens', async () => {
        // OAuth account found → existing user
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: mockUser,
        } as any);
        prisma.user.update.mockResolvedValue({} as any);
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = await service.googleAuth(googleAuthDto)as any;

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user.email).toBe('john@gmail.com');
        expect(result.user.isVerified).toBe(true);
        // last_login_at must be updated on every login
        expect(prisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ last_login_at: expect.any(Date) }),
          }),
        );
      });

      it('should throw UnauthorizedException if returning user is deleted', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, is_deleted: true },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been deactivated'),
        );
      });

      it('should throw UnauthorizedException if returning user is inactive', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, is_active: false },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been deactivated'),
        );
      });

      it('should throw UnauthorizedException if returning user is banned', async () => {
        prisma.oAuthAccount.findUnique.mockResolvedValue({
          user: { ...mockUser, is_banned: true },
        } as any);

        await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
          new UnauthorizedException('This account has been banned'),
        );
      });
    });

    // ── Email conflict — linking required ─────────────────────────
    describe('email conflict', () => {
      it('should return requiresLinking if email exists as LOCAL account', async () => {
        // No OAuth account found
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        // But email exists as LOCAL user
        prisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          login_method: 'LOCAL',
        } as any);

        const result = await service.googleAuth(googleAuthDto);

        expect(result).toEqual({
          requiresLinking: true,
          linkingToken: 'mock_jwt_token',
        });
        // linking token must be signed with short expiry
        expect(jwtService.sign).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'linking' }),
          expect.objectContaining({ expiresIn: '10m' }),
        );
      });
    });

    // ── New user ──────────────────────────────────────────────────
    describe('new Google user', () => {
      beforeEach(() => {
        // No OAuth account, no existing user → brand new
        prisma.oAuthAccount.findUnique.mockResolvedValue(null);
        prisma.user.findUnique.mockResolvedValue(null);
      });

      it('should create new user and return tokens', async () => {
        // $transaction executes the callback with a mock tx object
        prisma.$transaction.mockImplementation(async (cb: any) => {
          const tx = {
            user: {
              create: jest.fn().mockResolvedValue(mockUser),
            },
            oAuthAccount: {
              create: jest.fn().mockResolvedValue({}),
            },
          };
          return cb(tx);
        });
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = await service.googleAuth(googleAuthDto)as any;

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user.isVerified).toBe(true);
      });

      it('should auto-generate username from Google display name', async () => {
        // First findUnique (username check) → not taken
        prisma.user.findUnique.mockResolvedValue(null);

        prisma.$transaction.mockImplementation(async (cb: any) => {
          const tx = {
            user: {
              create: jest.fn().mockImplementation((args) => ({
                ...mockUser,
                username: args.data.username, // capture what username was generated
              })),
            },
            oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        });
        prisma.refreshToken.create.mockResolvedValue({} as any);

        await service.googleAuth(googleAuthDto);

        // transaction must have been called — user was created
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should set isVerified true for new Google user', async () => {
        prisma.$transaction.mockImplementation(async (cb: any) => {
          const tx = {
            user: {
              create: jest.fn().mockImplementation((args) => ({
                ...mockUser,
                is_verified: args.data.is_verified,
              })),
            },
            oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        });
        prisma.refreshToken.create.mockResolvedValue({} as any);

        const result = await service.googleAuth(googleAuthDto)as any;

        expect(result.user.isVerified).toBe(true);
      });

      it('should throw InternalServerErrorException if user creation fails', async () => {
        prisma.$transaction.mockRejectedValue(new Error('DB error'));

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

      const result = await service.googleLink(googleLinkDto)  as any;

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'GOOGLE',
            provider_user_id: 'google-id-123',
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
      // Token is valid JWT but wrong type — reject it
      jwtService.verify.mockReturnValue({
        googleId: 'google-id-123',
        email: 'john@gmail.com',
        type: 'access', // wrong type
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
        is_deleted: true,
      } as any);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('This account has been deactivated'),
      );
    });

    it('should throw UnauthorizedException if user is banned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        is_banned: true,
      } as any);

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new UnauthorizedException('This account has been banned'),
      );
    });

    it('should throw BadRequestException if Google account already linked to another account', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      // P2002 = Prisma unique constraint violation
      prisma.oAuthAccount.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.googleLink(googleLinkDto)).rejects.toThrow(
        new BadRequestException('This Google account is already linked to another account'),
      );
    });
  });
});