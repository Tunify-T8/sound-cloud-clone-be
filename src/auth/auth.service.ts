import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  NotFoundException, 
  BadRequestException,
  ForbiddenException
} from '@nestjs/common';
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
    // randomBytes gives us cryptographically secure random bytes
    // toString('hex') converts to hex string
    // slice(0, 6) takes first 6 characters
    // toUpperCase() makes it clean and readable
    return randomBytes(3).toString('hex').toUpperCase();
  }

 // ─── Helper: Generate JWT Access Token ───────────────────────────
private generateAccessToken(userId: string, email: string, role: string): string {
  return this.jwtService.sign(
    { sub: userId, email, role },
    {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') as StringValue,
    },
  );
}


// ─── Helper: Generate JWT Refresh Token ──────────────────────────
private generateRefreshToken(userId: string, email: string): string {
  return this.jwtService.sign(
    { sub: userId, email },
    {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as StringValue,
    },
  );
}
  // ─── Register ────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 1. Check if email already exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
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

    // 3. Hash the password — bcrypt with 12 rounds (strong but not too slow)
    const passHash = await bcrypt.hash(dto.password, 12);

    // 4. Create the user in DB
    let user: any;
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          pass_hash: passHash,
          avatar_url: dto.avatarUrl ?? null,
          login_method: 'LOCAL',
          role: 'LISTENER',
          is_verified: false,
          gender: dto.gender,
          date_of_birth: dto.date_of_birth,
        },
      });
    } catch (error) {
      // Re-throw Prisma unique constraint violations properly
      if (error.code === 'P2002') {
        const field = error.meta?.target?.includes('email') ? 'Email' : 'Username';
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
        user_id: user.id,
        token: verificationToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
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
        isVerified: user.is_verified,
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
  const verificationToken = await this.prisma.emailVerificationToken.findUnique({
    where: { token: dto.token },
  });

  // 3. Validate everything — same generic error for all failures (security)
  if (
    !user ||
    !verificationToken ||
    verificationToken.used ||
    verificationToken.expires_at < new Date() ||
    verificationToken.user_id !== user.id  // token doesn't belong to this user
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
      is_verified: true,
      last_login_at: new Date(),
    },
  });

  // 6. Generate tokens
  const accessToken = this.generateAccessToken(user.id, user.email, user.role);
  const refreshTokenRaw = this.generateRefreshToken(user.id, user.email);
  // 7. Hash refresh token before saving to DB
  const refreshTokenHash = await bcrypt.hash(refreshTokenRaw, 12);

  // 8. Save refresh token to DB
  await this.prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token: refreshTokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  this.logger.log(`User ${user.id} verified email and logged in`);

  // 9. Return tokens + user info
  return {
    message: 'Email verified successfully',
    accessToken,
    refreshToken: refreshTokenRaw,  // raw token goes to client, hash stays in DB
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
// If exists → tell user to sign in (don't reveal sensitive info)
// If not → give green light to continue registration
async checkEmail(dto: CheckEmailDto) {
  const existing = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  if (existing) {
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
  if (user.is_verified) {
    throw new BadRequestException('Email is already verified');
  }

  // 3. Invalidate all previous unused tokens
  await this.prisma.emailVerificationToken.updateMany({
    where: {
      user_id: user.id,
      used: false,
    },
    data: { used: true },
  });

  // 4. Generate new token
  const verificationToken = this.generateToken();

  // 5. Save with fresh 24hr expiry
  await this.prisma.emailVerificationToken.create({
    data: {
      user_id: user.id,
      token: verificationToken,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // 6. Send email
  await this.mailerService.sendVerificationEmail(
    user.email,
    user.username,
    verificationToken,
  );

  this.logger.log(`Resent verification email to: ${user.email}`);

  // 7. Return success — don't reveal whether email exists to bad actors
  // (we throw 404 above because this isn't a sensitive auth endpoint)
  return {
    message: 'Verification email resent. Please check your inbox.',
  };
}


async login(dto: LoginDto) {
  // 1. Find user
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Check login method FIRST — before touching password
  if (user.login_method !== 'LOCAL' && !user.pass_hash) {
    // Pure OAuth user, never set a password
    const providerNames: Record<string, string> = {
      GOOGLE: 'Google',
      FACEBOOK: 'Facebook',
      APPLE: 'Apple',
      GITHUB: 'GitHub',
    };
    const providerLabel = providerNames[user.login_method] ?? user.login_method;
    throw new BadRequestException(
      `This account uses ${providerLabel} login. Please sign in with ${providerLabel}.`,
    );
  }

  // 3. Now verify password
  if (!(await bcrypt.compare(dto.password, user.pass_hash ?? ''))) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 4. Check email verified — no tokens until verified, same as register flow
  if (!user.is_verified) {
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
  if (user.is_banned) {
    throw new ForbiddenException('Your account has been permanently banned.');
  }

  // 6. Check suspended
  if (user.is_suspended) {
    if (user.suspended_until && user.suspended_until > new Date()) {
      throw new ForbiddenException(
        `Your account is suspended until ${user.suspended_until.toISOString()}.`,
      );
    }

    // Suspension expired — clear it + update last_login_at in one query
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        is_suspended: false,
        suspended_until: null,
        suspended_by_id: null,
        suspensionReason: null,
        last_login_at: new Date(),
      },
    });
  } else {
    // 7. Not suspended — just update last_login_at
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });
  }

  // 8. Generate tokens
  const accessToken = this.generateAccessToken(user.id, user.email, user.role);
  const refreshTokenRaw = this.generateRefreshToken(user.id, user.email);
  // 9. Hash refresh token → save to DB
  const refreshTokenHash = await bcrypt.hash(refreshTokenRaw, 12);
  await this.prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token: refreshTokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
      isVerified: user.is_verified,
      avatar_url: user.avatar_url,
    },
  };
}



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
    where: { user_id: payload.sub, is_active: true },
  });

  if (!activeTokens.length) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  // 3. Find matching token via bcrypt compare
  let matchedToken: typeof activeTokens[0] | null = null;
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
  if (matchedToken.expires_at < new Date()) {
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
    data: { is_active: false, revoked_at: new Date() },
  });

  // 7. Generate new tokens
  const newAccessToken = this.generateAccessToken(payload.sub, payload.email, user.role);
  const newRefreshTokenRaw = this.generateRefreshToken(payload.sub, payload.email);

  // 8. Hash + save new refresh token
  const newRefreshTokenHash = await bcrypt.hash(newRefreshTokenRaw, 12);
  await this.prisma.refreshToken.create({
    data: {
      user_id: payload.sub,
      token: newRefreshTokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    // Token invalid or expired — user is already effectively signed out
    return { message: 'Signed out successfully.' };
  }

  // 2. Find all active tokens for this user
  const activeTokens = await this.prisma.refreshToken.findMany({
    where: {
      user_id: payload.sub,
      is_active: true,
    },
  });

  // 3. No active tokens — already signed out
  if (!activeTokens.length) {
    return { message: 'Signed out successfully.' };
  }

  // 4. Find matching token via bcrypt compare
  let matchedToken: typeof activeTokens[0] | null = null;
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
      is_active: false,
      revoked_at: new Date(),
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
      user_id: payload.sub,
      is_active: true,
    },
    data: {
      is_active: false,
      revoked_at: new Date(),
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
      message: 'If an account exists with this email, you will receive a password reset link shortly.',
    };
  }

  // 3. Invalidate all previous unused reset tokens
  await this.prisma.passwordResetToken.updateMany({
    where: {
      user_id: user.id,
      used: false,
    },
    data: { used: true },
  });

  // 4. Generate new token
  const resetToken = this.generateToken();

  // 5. Save with 3hr expiry
  await this.prisma.passwordResetToken.create({
    data: {
      user_id: user.id,
      token: resetToken,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
    },
  });

  // 6. Send reset email
  await this.mailerService.sendPasswordResetEmail(
    user.email,
    user.username,
    resetToken,
  );

  this.logger.log(`Password reset token generated for user ${user.id}`);

  // 7. Return generic success — same message as user not found
  return {
    message: 'If an account exists with this email, you will receive a password reset link shortly.',
  };
}







// ─── Reset Password ───────────────────────────────────────────────
async resetPassword(dto: ResetPasswordDto) {
  // 1. Check newPassword === confirmPassword
  if (dto.newPassword !== dto.confirmPassword) {
    throw new BadRequestException('Passwords do not match');
  }

  // 1. Find user by email
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  // 2. Find token
  const resetToken = await this.prisma.passwordResetToken.findUnique({
    where: { token: dto.token },
  });

  // 3. Validate everything — same generic error for all failures
  if (
    !user ||
    !resetToken ||
    resetToken.used ||
    resetToken.expires_at < new Date() ||
    resetToken.user_id !== user.id
  ) {
    throw new UnauthorizedException('Invalid or expired reset token');
  }

  // 4. Hash new password
  const newPassHash = await bcrypt.hash(dto.newPassword, 12);

  // 5. Update user password
  await this.prisma.user.update({
    where: { id: user.id },
    data: { pass_hash: newPassHash },
  });

  // 6. Mark token as used
  await this.prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { used: true },
  });

  // 7. Signout all devices if requested — defaults to true if not provided
  const shouldSignoutAll = dto.signoutAll !== false;
  if (shouldSignoutAll) {
    await this.prisma.refreshToken.updateMany({
      where: {
        user_id: user.id,
        is_active: true,
      },
      data: {
        is_active: false,
        revoked_at: new Date(),
      },
    });
  }

  this.logger.log(`Password reset for user ${user.id}. Signout all: ${shouldSignoutAll}`);

  return {
    message: 'Password reset successfully.',
    signedOutAll: shouldSignoutAll,
  };
}




}



