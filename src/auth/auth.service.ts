import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
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
private generateAccessToken(userId: string, email: string): string {
  return this.jwtService.sign(
    { sub: userId, email },
    {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') as StringValue,
    },
  );
}

// ─── Helper: Generate JWT Refresh Token ──────────────────────────
private generateRefreshToken(userId: string): string {
  return this.jwtService.sign(
    { sub: userId },
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



// ─── Verify Email ────────────────────────────────────────────────
async verifyEmail(dto: VerifyEmailDto) {
  // 1. Find the token in DB
  const verificationToken = await this.prisma.emailVerificationToken.findUnique({
    where: { token: dto.token },
  });

  // 2. If not found, expired, or already used → same error for security
  if (
    !verificationToken ||
    verificationToken.used ||
    verificationToken.expires_at < new Date()
  ) {
    throw new UnauthorizedException('Invalid or expired verification token');
  }

  // 3. Mark token as used
  await this.prisma.emailVerificationToken.update({
    where: { id: verificationToken.id },
    data: { used: true },
  });

  // 4. Mark user as verified
  await this.prisma.user.update({
    where: { id: verificationToken.user_id },
    data: { is_verified: true },
  });

  this.logger.log(`User ${verificationToken.user_id} verified their email`);

  // 5. Return success
  return {
    message: 'Email verified successfully',
    user: {
      id: verificationToken.user_id,
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


}