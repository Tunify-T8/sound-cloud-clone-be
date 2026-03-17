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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // ─── Initialize Google OAuth2 client with our credentials ─────
    this.oauthClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  // ─── Helper: Generate Access Token ───────────────────────────────
  private generateAccessToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign(
      { sub: userId, email, role },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') as StringValue,
      },
    );
  }

  // ─── Helper: Generate Refresh Token ──────────────────────────────
  private generateRefreshToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as StringValue,
      },
    );
  }

  // ─── Helper: Save refresh token to DB ────────────────────────────
  private async saveRefreshToken(userId: string, refreshTokenRaw: string): Promise<void> {
    const hash = await bcrypt.hash(refreshTokenRaw, 12);
    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token: hash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ─── Helper: Build standard auth response ────────────────────────
  // Same shape as local login — frontend handles both identically
  private async buildAuthResponse(user: any) {
    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
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
        isVerified: true, // Google users are always verified — Google already confirmed the email
        avatar_url: user.avatar_url,
      },
    };
  }

  // ─── Helper: Generate username from Google display name ──────────
  // "John Doe" → "john_doe" → if taken → "john_doe_a3f2"
  private async generateUsername(displayName: string): Promise<string> {
    // Clean the display name — lowercase, replace spaces with underscores, strip special chars
    const base = displayName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20); // cap at 20 chars so total username stays reasonable

    // Try base username first
    const existing = await this.prisma.user.findUnique({
      where: { username: base },
    });

    if (!existing) return base;

    // Base taken — append 4 random hex chars and try again
    // Loop handles the (very unlikely) case where even the suffixed version is taken
    let attempts = 0;
    while (attempts < 5) {
      const suffix = Math.random().toString(16).slice(2, 6); // 4 random hex chars
      const candidate = `${base}_${suffix}`;
      const conflict = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!conflict) return candidate;
      attempts++;
    }

    // Extremely unlikely to reach here — fallback with timestamp
    return `${base}_${Date.now().toString(16).slice(-6)}`;
  }

  // ─── Helper: Exchange auth code with Google ───────────────────────
  // Sends code to Google, gets back user info (email, name, picture, Google ID)
  private async getGoogleUser(code: string): Promise<{
    googleId: string;
    email: string;
    name: string;
    picture: string | null;
  }> {
    try {
      // Step 1 — Exchange authorization code for tokens
      const { tokens } = await this.oauthClient.getToken(code);

      // Step 2 — Verify the id_token Google returned
      // This confirms the token is genuine and gives us the user's info
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Failed to get user info from Google');
      }

      return {
    
        googleId: payload.sub,          // Google's unique user ID
        email: payload.email!,
        name: payload.name ?? payload.email!, // fallback to email if no name
        picture: payload.picture ?? null,
      };
    } catch (error) {
      // Don't expose Google's internal errors to the client
      this.logger.error('Google token exchange failed', error);
      throw new UnauthorizedException('Invalid or expired Google authorization code');
    }
  }

  // ─── Google Auth (Sign In / Register) ────────────────────────────
  async googleAuth(dto: GoogleAuthDto) {
    // 1. Exchange code with Google → get user info
    const googleUser = await this.getGoogleUser(dto.code);

    // 2. Check if this Google account is already linked to a Tunify account
    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_provider_user_id: {
          provider: 'GOOGLE',
          provider_user_id: googleUser.googleId,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      // ── Returning Google user — just log them in ─────────────────
      const user = existingOAuth.user;

      // Check account is still active
      if (user.is_deleted || !user.is_active) {
        throw new UnauthorizedException('This account has been deactivated');
      }
      if (user.is_banned) {
        throw new UnauthorizedException('This account has been banned');
      }

      // Update last_login_at
      await this.prisma.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      this.logger.log(`Google user ${user.id} logged in`);
      return this.buildAuthResponse(user);
    }

    // 3. No OAuth account found — check if email exists as LOCAL account
    const existingUser = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (existingUser) {
      // ── Email conflict — prompt user to link accounts ─────────────
      // Generate a short-lived linking token carrying the Google user info
      // Frontend uses this token in POST /auth/google/link
      const linkingToken = this.jwtService.sign(
        {
          googleId: googleUser.googleId,
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          type: 'linking', // extra safety — reject this token anywhere else
        },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '10m', // short-lived — linking must happen immediately
        },
      );

      return {
        requiresLinking: true,
        linkingToken,
      };
    }

    // 4. Brand new user — create account + link Google
    const username = await this.generateUsername(googleUser.name);

    let newUser: any;
    try {
      // Create user and OAuthAccount in a transaction — both must succeed or neither does
      newUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            email: googleUser.email,
            avatar_url: googleUser.picture,
            login_method: 'GOOGLE',
            role: 'LISTENER',
            is_verified: true,       // Google already verified the email
            gender: 'PREFER_NOT_TO_SAY', // default — user can update in profile settings
            date_of_birth: new Date('2000-01-01'), // placeholder — user can update in profile
          },
        });

        await tx.oAuthAccount.create({
          data: {
            user_id: user.id,
            provider: 'GOOGLE',
            provider_user_id: googleUser.googleId,
            access_token: 'placeholder', // we don't store Google's access token long-term
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
    // 1. Verify and decode the linking token
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

    // 2. Extra safety — reject tokens not meant for linking
    if (payload.type !== 'linking') {
      throw new UnauthorizedException('Invalid or expired linking token');
    }

    // 3. Find the LOCAL account
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user || !user.pass_hash) {
      throw new UnauthorizedException('Invalid or expired linking token');
    }

    // 4. Verify password — confirms user owns this account
    const isPasswordValid = await bcrypt.compare(dto.password, user.pass_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    // 5. Check account is active
    if (user.is_deleted || !user.is_active) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (user.is_banned) {
      throw new UnauthorizedException('This account has been banned');
    }

    // 6. Create OAuthAccount — links Google to this LOCAL user
    try {
      await this.prisma.oAuthAccount.create({
        data: {
          user_id: user.id,
          provider: 'GOOGLE',
          provider_user_id: payload.googleId,
          access_token: 'placeholder',
        },
      });
    } catch (error) {
      // P2002 = unique constraint — Google account already linked to someone else
      if (error.code === 'P2002') {
        throw new BadRequestException('This Google account is already linked to another account');
      }
      throw new InternalServerErrorException('Failed to link account');
    }

    // 7. Update last_login_at
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    this.logger.log(`User ${user.id} linked Google account`);

    // 8. Return tokens — same shape as normal login
    return this.buildAuthResponse(user);
  }
}