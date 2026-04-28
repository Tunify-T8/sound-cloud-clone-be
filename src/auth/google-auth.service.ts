import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleLinkDto } from './dto/google-link.dto';
import { StringValue } from 'ms';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly oauthClient: OAuth2Client;
  private static readonly GOOGLE_ISSUERS = new Set([
    'accounts.google.com',
    'https://accounts.google.com',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.oauthClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  private generateAccessToken(
    userId: string,
    email: string,
    role: string,
  ): string {
    return this.jwtService.sign(
      { sub: userId, email, role },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as StringValue,
      },
    );
  }

  private generateRefreshToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as StringValue,
      },
    );
  }

  private async saveRefreshToken(
    userId: string,
    refreshTokenRaw: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshTokenRaw, 12);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: hash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async buildAuthResponse(user: any) {
    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshTokenRaw = this.generateRefreshToken(user.id, user.email);
    await this.saveRefreshToken(user.id, refreshTokenRaw);

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: true,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  private async generateUsername(displayName: string): Promise<string> {
    const base = displayName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);

    const existing = await this.prisma.user.findUnique({
      where: { username: base },
    });

    if (!existing) return base;

    let attempts = 0;
    while (attempts < 5) {
      const suffix = Math.random().toString(16).slice(2, 6);
      const candidate = `${base}_${suffix}`;
      const conflict = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!conflict) return candidate;
      attempts++;
    }

    return `${base}_${Date.now().toString(16).slice(-6)}`;
  }

  private isGoogleCertFetchError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const maybeCode = (error as { code?: string }).code;
    return (
      maybeCode === 'ETIMEDOUT' ||
      error.message.includes('Failed to retrieve verification certificates') ||
      error.message.includes('www.googleapis.com/oauth2/v1/certs')
    );
  }

  private async verifyGoogleIdTokenWithFallback(idToken: string): Promise<{
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  }> {
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Failed to get user info from Google');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (!this.isGoogleCertFetchError(error)) {
        throw error;
      }

      this.logger.warn(
        'Google cert retrieval timed out. Falling back to tokeninfo verification.',
      );

      const url = new URL('https://oauth2.googleapis.com/tokeninfo');
      url.searchParams.set('id_token', idToken);

      let response: Response;
      try {
        response = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });
      } catch (fetchError) {
        this.logger.error(
          'Google tokeninfo fallback request failed',
          fetchError,
        );
        throw new UnauthorizedException(
          'Invalid or expired Google authorization code',
        );
      }

      if (!response.ok) {
        this.logger.error(
          `Google tokeninfo fallback returned HTTP ${response.status}`,
        );
        throw new UnauthorizedException(
          'Invalid or expired Google authorization code',
        );
      }

      const payload = (await response.json()) as {
        aud?: string;
        email?: string;
        email_verified?: boolean | string;
        exp?: string | number;
        iss?: string;
        name?: string;
        picture?: string;
        sub?: string;
      };

      const expectedAudience =
        this.configService.get<string>('GOOGLE_CLIENT_ID');
      const expiresAtMs = Number(payload.exp) * 1000;
      const emailVerified =
        payload.email_verified === undefined ||
        payload.email_verified === true ||
        payload.email_verified === 'true';

      if (
        payload.aud !== expectedAudience ||
        !payload.iss ||
        !GoogleAuthService.GOOGLE_ISSUERS.has(payload.iss) ||
        !Number.isFinite(expiresAtMs) ||
        expiresAtMs <= Date.now() ||
        !payload.sub ||
        !payload.email ||
        !emailVerified
      ) {
        throw new UnauthorizedException(
          'Invalid or expired Google authorization code',
        );
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    }
  }

  private async getGoogleUser(code: string): Promise<{
    googleId: string;
    email: string;
    name: string;
    picture: string | null;
  }> {
    try {
      const { tokens } = await this.oauthClient.getToken(code);
      if (!tokens.id_token) {
        throw new UnauthorizedException('Google did not return an ID token');
      }

      const payload = await this.verifyGoogleIdTokenWithFallback(tokens.id_token);

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email,
        picture: payload.picture ?? null,
      };
    } catch (error) {
      this.logger.error('Google authentication failed', error);
      throw new UnauthorizedException(
        'Invalid or expired Google authorization code',
      );
    }
  }

  // ─── Google Auth (Sign In / Register) ────────────────────────────
  async googleAuth(dto: GoogleAuthDto) {
    const googleUser = await this.getGoogleUser(dto.code);

    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'GOOGLE',
          providerUserId: googleUser.googleId,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      const user = existingOAuth.user;

      if (user.isDeleted || !user.isActive) {
        throw new UnauthorizedException('This account has been deactivated');
      }
      if (user.isBanned) {
        throw new UnauthorizedException('This account has been banned');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      this.logger.log(`Google user ${user.id} logged in`);
      return this.buildAuthResponse(user);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (existingUser) {
      const linkingToken = this.jwtService.sign(
        {
          googleId: googleUser.googleId,
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          type: 'linking',
        },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '10m',
        },
      );

      return {
        requiresLinking: true,
        linkingToken,
      };
    }

    const username = await this.generateUsername(googleUser.name);

    let newUser: any;
    try {
      newUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            email: googleUser.email,
            avatarUrl: googleUser.picture,
            loginMethod: 'GOOGLE',
            role: 'LISTENER',
            isVerified: true,
            gender: 'PREFER_NOT_TO_SAY',
            dateOfBirth: new Date('2000-01-01'),
          },
        });

        const freePlan = await tx.subscriptionPlan.upsert({
          where: { name: 'FREE' },
          update: {
            isActive: true,
            monthlyPrice: 0,
            monthlyUploadMinutes: 180,
          },
          create: {
            name: 'FREE',
            description: 'Free tier',
            monthlyPrice: 0,
            monthlyUploadMinutes: 180,
            isActive: true,
          },
        });

        await tx.subscription.create({
          data: {
            user: { connect: { id: user.id } },
            plan: { connect: { id: freePlan.id } },
            status: 'ACTIVE',
            billingCycle: 'monthly',
          },
        });

        await tx.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            providerUserId: googleUser.googleId,
            accessToken: 'placeholder',
          },
        });

        return user;
      });
    } catch (error) {
      this.logger.error('Failed to create Google user', error);
      throw new InternalServerErrorException('Failed to create account');
    }

    this.logger.log(`New Google user registered: ${newUser.username}`);
    return this.buildAuthResponse(newUser);
  }

  // ─── Google Link (Complete Account Linking) ───────────────────────
  async googleLink(dto: GoogleLinkDto) {
    let payload: {
      googleId: string;
      email: string;
      name: string;
      picture: string;
      type: string;
    };

    try {
      payload = this.jwtService.verify(dto.linkingToken, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired linking token');
    }

    if (payload.type !== 'linking') {
      throw new UnauthorizedException('Invalid or expired linking token');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user || !user.passHash) {
      throw new UnauthorizedException('Invalid or expired linking token');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('This account has been banned');
    }

    try {
      await this.prisma.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerUserId: payload.googleId,
          accessToken: 'placeholder',
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(
          'This Google account is already linked to another account',
        );
      }
      throw new InternalServerErrorException('Failed to link account');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User ${user.id} linked Google account`);
    return this.buildAuthResponse(user);
  }
}
