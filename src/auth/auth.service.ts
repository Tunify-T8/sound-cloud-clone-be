import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { StringValue } from 'ms';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
//import { DeleteAccountDto } from './dto/delete-account.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  // ─── Helper: Generate 6-char uppercase token ─────────────────────
  private generateToken(): string {
    return randomBytes(3).toString('hex').toUpperCase();
  }

  // ─── Helper: Generate JWT Access Token ───────────────────────────
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

  // ─── Helper: Generate JWT Refresh Token ──────────────────────────
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

  // ─── Helper: Verify reCAPTCHA v3 token ───────────────────────────
  private async verifyCaptcha(token: string | undefined): Promise<void> {
    // Skip CAPTCHA verification in development — remove this check in production
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return;
    }

    if (!token) {
      throw new BadRequestException('CAPTCHA token is required.');
    }

    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');
    const minScore = parseFloat(
      this.configService.get<string>('RECAPTCHA_MIN_SCORE') ?? '0.5',
    );

    const response = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`,
      { method: 'POST' },
    );

    const data = await response.json();

    if (!data.success || data.score < minScore) {
      throw new BadRequestException(
        'CAPTCHA verification failed. Please try again.',
      );
    }
  }

  // ─── Register ────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 0. Verify CAPTCHA — reject bots before touching the DB
    await this.verifyCaptcha(dto.captchaToken);

    // 1. Check if email already exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 1a. If email exists but account was soft-deleted → reactivate it
    if (existingEmail && existingEmail.isDeleted) {
      const passHash = await bcrypt.hash(dto.password, 12);

      const reactivated = await this.prisma.user.update({
        where: { id: existingEmail.id },
        data: {
          username: dto.username,
          passHash,
          avatarUrl: dto.avatarUrl ?? existingEmail.avatarUrl,
          isDeleted: false,
          isActive: true,
          deletedAt: null,
          isVerified: false,
          gender: dto.gender,
          dateOfBirth: dto.date_of_birth,
          loginMethod: 'LOCAL',
        },
      });

      // Invalidate any old verification tokens
      await this.prisma.emailVerificationToken.updateMany({
        where: { userId: reactivated.id, used: false },
        data: { used: true },
      });

      // Generate fresh verification token
      const verificationToken = this.generateToken();
      await this.prisma.emailVerificationToken.create({
        data: {
          userId: reactivated.id,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Send verification email
      await this.mailerService.sendVerificationEmail(
        reactivated.email,
        reactivated.username,
        verificationToken,
      );

      this.logger.log(`Reactivated soft-deleted account: ${reactivated.username}`);

      return {
        message: 'Account reactivated. Please verify your email.',
        user: {
          id: reactivated.id,
          username: reactivated.username,
          email: reactivated.email,
          isVerified: reactivated.isVerified,
        },
      };
    }

    // 1b. Email exists and account is active → reject
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    // 2. Check if username already exists
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    // 3. Hash the password
    const passHash = await bcrypt.hash(dto.password, 12);

    // 4. Create the user and attach the default FREE subscription in DB
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            username: dto.username,
            email: dto.email,
            passHash,
            avatarUrl: dto.avatarUrl ?? null,
            loginMethod: 'LOCAL',
            role: 'LISTENER',
            isVerified: false,
            gender: dto.gender,
            dateOfBirth: dto.date_of_birth,
          },
        });

        const freePlan = await tx.subscriptionPlan.findUnique({
          where: { name: 'free' },
          select: {
            id: true,
          },
        });

        await tx.subscription.create({
          data: {
            user: { connect: { id: createdUser.id } },
            plan: { connect: { id: freePlan?.id } },
            status: 'ACTIVE',
            billingCycle: 'monthly',
          },
        });

        return createdUser;
      });
    } catch (error) {
      const prismaError = error as {
        code?: string;
        meta?: { target?: string[] };
      };
      if (prismaError.code === 'P2002') {
        const field = prismaError.meta?.target?.includes('email')
          ? 'Email'
          : 'Username';
        throw new ConflictException(`${field} already in use`);
      }
      this.logger.error('Failed to create user', error);
      throw new InternalServerErrorException('Failed to create user');
    }

    // 5. Generate a 6-char verification token
    const verificationToken = this.generateToken();

    // 6. Save token in DB with 24hr expiry
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 7. Send verification email
    await this.mailerService.sendVerificationEmail(
      user.email,
      user.username,
      verificationToken,
    );

    this.logger.log(`New user registered: ${user.username}`);

    // 8. Return user info only — no tokens until email is verified
    return {
      message: 'Registration successful. Please verify your email.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
      },
    };
  }

  // ─── Verify Email ───────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto) {
    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 2. Find token
    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { token: dto.token },
      });

    // 3. Validate everything — same generic error for all failures (security)
    if (
      !user ||
      !verificationToken ||
      verificationToken.used ||
      verificationToken.expiresAt < new Date() ||
      verificationToken.userId !== user.id
    ) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // 4. Mark token as used
    await this.prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { used: true },
    });

    // 5. Mark user as verified + update last_login_at
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        lastLoginAt: new Date(),
      },
    });

    // 6. Generate tokens
    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshTokenRaw = this.generateRefreshToken(user.id, user.email);
    // 7. Hash refresh token before saving to DB
    const refreshTokenHash = await bcrypt.hash(refreshTokenRaw, 12);

    // 8. Save refresh token to DB
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    this.logger.log(`User ${user.id} verified email and logged in`);

    // 9. Return tokens + user info
    return {
      message: 'Email verified successfully',
      accessToken,
      refreshToken: refreshTokenRaw, // raw token goes to client, hash stays in DB
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: true,
      },
    };
  }

  // ─── Check Email ─────────────────────────────────────────────────
  // Checks if email exists before registration
  // If exists and active → tell user to sign in
  // If exists but soft-deleted → treat as new user, allow registration
  // If not exists → give green light to continue registration
  async checkEmail(dto: CheckEmailDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing && !existing.isDeleted) {
      return {
        exists: true,
        message: 'Welcome back! Please sign in.',
      };
    }
  
    return {
      exists: false,
      message: 'Email available. Please continue with registration.',
    };
  }

  // ─── Resend Verification ──────────────────────────────────────────
  async resendVerification(dto: ResendVerificationDto) {
    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new NotFoundException('No account found with this email');
    }

    // 2. Already verified → reject
    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // 3. Invalidate all previous unused tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        used: false,
      },
      data: { used: true },
    });

    // 4. Generate new token
    const verificationToken = this.generateToken();

    // 5. Save with fresh 24hr expiry
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 6. Send email
    await this.mailerService.sendVerificationEmail(
      user.email,
      user.username,
      verificationToken,
    );

    this.logger.log(`Resent verification email to: ${user.email}`);

    return {
      message: 'Verification email resent. Please check your inbox.',
    };
  }

  // ─── Login ────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account is not deleted
    if (user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Check login method FIRST — before touching password
    if (user.loginMethod !== 'LOCAL' && !user.passHash) {
      const providerNames: Record<string, string> = {
        GOOGLE: 'Google',
        FACEBOOK: 'Facebook',
        APPLE: 'Apple',
        GITHUB: 'GitHub',
      };
      const providerLabel = providerNames[user.loginMethod] ?? user.loginMethod;
      throw new BadRequestException(
        `This account uses ${providerLabel} login. Please sign in with ${providerLabel}.`,
      );
    }

    // 3. Now verify password
    if (!(await bcrypt.compare(dto.password, user.passHash ?? ''))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Check email verified
    if (!user.isVerified) {
      return {
        message: 'Please verify your email before logging in.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isVerified: false,
        },
      };
    }

    // 5. Check banned
    if (user.isBanned) {
      throw new ForbiddenException('Your account has been permanently banned.');
    }

    // 6. Check suspended
    if (user.isSuspended) {
      if (user.suspendedUntil && user.suspendedUntil > new Date()) {
        throw new ForbiddenException(
          `Your account is suspended until ${user.suspendedUntil.toISOString()}.`,
        );
      }

      // Suspension expired — clear it + update lastLoginAt in one query
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isSuspended: false,
          suspendedUntil: null,
          suspendedById: null,
          suspensionReason: null,
          lastLoginAt: new Date(),
        },
      });
    } else {
      // 7. Not suspended — just update lastLoginAt
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    // 8. Generate tokens
    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshTokenRaw = this.generateRefreshToken(user.id, user.email);

    // 9. Hash refresh token → save to DB
    const refreshTokenHash = await bcrypt.hash(refreshTokenRaw, 12);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`User ${user.id} logged in`);

    // 10. Return tokens + user info
    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────
  async refreshToken(dto: RefreshTokenDto) {
    // 1. Verify JWT
    let payload: { sub: string; email: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Find all active tokens for this user
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, isActive: true },
    });

    if (!activeTokens.length) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 3. Find matching token via bcrypt compare
    let matchedToken: (typeof activeTokens)[0] | null = null;
    for (const storedToken of activeTokens) {
      const isMatch = await bcrypt.compare(dto.refreshToken, storedToken.token);
      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 4. Check DB expiry
    if (matchedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 5. Fetch fresh role — role can change, must always be current
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 6. Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { isActive: false, revokedAt: new Date() },
    });

    // 7. Generate new tokens
    const newAccessToken = this.generateAccessToken(
      payload.sub,
      payload.email,
      user.role,
    );
    const newRefreshTokenRaw = this.generateRefreshToken(
      payload.sub,
      payload.email,
    );

    // 8. Hash + save new refresh token
    const newRefreshTokenHash = await bcrypt.hash(newRefreshTokenRaw, 12);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        token: newRefreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`Refresh token rotated for user ${payload.sub}`);

    // 9. Return new tokens
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenRaw,
    };
  }

  // ─── Sign Out (current device) ────────────────────────────────────
  async signout(dto: LogoutDto) {
    // 1. Verify JWT — if invalid, user is already logged out, return success
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return { message: 'Signed out successfully.' };
    }

    // 2. Find all active tokens for this user
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        isActive: true,
      },
    });

    // 3. No active tokens — already signed out
    if (!activeTokens.length) {
      return { message: 'Signed out successfully.' };
    }

    // 4. Find matching token via bcrypt compare
    let matchedToken: (typeof activeTokens)[0] | null = null;
    for (const storedToken of activeTokens) {
      const isMatch = await bcrypt.compare(dto.refreshToken, storedToken.token);
      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    // 5. No match — token already revoked or doesn't exist, return success
    if (!matchedToken) {
      return { message: 'Signed out successfully.' };
    }

    // 6. Revoke the token
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`User ${payload.sub} signed out`);

    return { message: 'Signed out successfully.' };
  }

  // ─── Sign Out All Devices ─────────────────────────────────────────
  async signoutAll(dto: LogoutDto) {
    // 1. Verify JWT — if invalid, user is already logged out everywhere
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return { message: 'Signed out from all devices successfully.' };
    }

    // 2. Revoke ALL active tokens for this user in one query
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId: payload.sub,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(
      `User ${payload.sub} signed out from all devices. Tokens revoked: ${result.count}`,
    );

    return { message: 'Signed out from all devices successfully.' };
  }

  // ─── Forgot Password ──────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 2. Always return success — never reveal if email exists
    if (!user) {
      return {
        message:
          'If an account exists with this email, you will receive a password reset link shortly.',
      };
    }

    // 3. Invalidate all previous unused reset tokens
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false,
      },
      data: { used: true },
    });

    // 4. Generate new token
    const resetToken = this.generateToken();

    // 5. Save with 3hr expiry
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      },
    });

    // 6. Send reset email
    await this.mailerService.sendPasswordResetEmail(
      user.email,
      user.username,
      resetToken,
    );

    this.logger.log(`Password reset token generated for user ${user.id}`);

    // 7. Return generic success
    return {
     
      message: 'If an account exists with this email, you will receive a password reset link shortly.'
    };
  }

  // ─── Delete Account ───────────────────────────────────────────────
  async deleteAccount(userId: string) {
    // 1. Fetch user from DB
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 2. Banned users cannot delete their account
    if (user.isBanned) {
      throw new ForbiddenException(
        'Banned accounts cannot be deleted. Please contact support.',
      );
    }

    // 3. Password check
    /*if (user.passHash) {
      if (!dto.password) {
        throw new BadRequestException(
          'Password is required to delete your account',
        );
      }
      const isPasswordValid = await bcrypt.compare(dto.password, user.passHash);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }*/

    // 4. Soft delete
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
      },
    });

    // 5. Revoke all active refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`User ${userId} deleted their account`);

    return {
      message: 'Your account has been deleted successfully.',
    };
  }

  // ─── Reset Password ───────────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    // 1. Check newPassword === confirmPassword
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // 2. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 3. Find token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    // 4. Validate everything — same generic error for all failures
    if (
      !user ||
      !resetToken ||
      resetToken.used ||
      resetToken.expiresAt < new Date() ||
      resetToken.userId !== user.id
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // 5. Hash new password
    const newPassHash = await bcrypt.hash(dto.newPassword, 12);

    // 6. Update user password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passHash: newPassHash },
    });

    // 7. Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    // 8. Signout all devices if requested
    const shouldSignoutAll = dto.signoutAll !== false;
    if (shouldSignoutAll) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });
    }

    this.logger.log(
      `Password reset for user ${user.id}. Signout all: ${shouldSignoutAll}`,
    );

    return {
      message: 'Password reset successfully.',
      signedOutAll: shouldSignoutAll,
    };
  }
}
