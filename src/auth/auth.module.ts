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

@Module({
  imports: [
    PrismaModule,
    MailerModule,
    ConfigModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,  // strategy must be a provider so Passport can find it
    JwtAccessGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    JwtAccessGuard,  // export so other modules can use @UseGuards(JwtAccessGuard)
    RolesGuard,      // export so other modules can use @UseGuards(RolesGuard)
  ],
})
export class AuthModule {}