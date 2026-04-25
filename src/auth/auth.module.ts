import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '../mailer/mailer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { GoogleAuthService } from './google-auth.service';
import { JwtOptionalStrategy } from './strategies/jwt-optional.strategy';
import { JwtOptionalGuard } from './guards/jwt-optional.guard';
import { SearchModule } from 'src/search/search.module';

@Module({
  imports: [
    PrismaModule,
    MailerModule,
    ConfigModule,
    PassportModule,
    JwtModule.register({}),
    SearchModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    JwtAccessStrategy, // strategy must be a provider so Passport can find it
    JwtOptionalStrategy,
    JwtAccessGuard,
    JwtOptionalGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    JwtAccessGuard, // export so other modules can use @UseGuards(JwtAccessGuard)
    JwtOptionalGuard,
    RolesGuard, // export so other modules can use @UseGuards(RolesGuard)
  ],
})
export class AuthModule {}
