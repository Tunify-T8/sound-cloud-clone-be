import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';






@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── POST /auth/register ──────────────────────────────────────────
  // Registers a new user and sends a verification email
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }




// ─── POST /auth/verify-email ──────────────────────────────────────
// Verifies user email using the token sent to their inbox
@Post('verify-email')
@HttpCode(HttpStatus.OK)
async verifyEmail(@Body() dto: VerifyEmailDto) {
  return this.authService.verifyEmail(dto);
}



// ─── POST /auth/check-email ───────────────────────────────────────
// Step 1 of registration — checks if email is already registered
@Post('check-email')
@HttpCode(HttpStatus.OK)
async checkEmail(@Body() dto: CheckEmailDto) {
  return this.authService.checkEmail(dto);
}




// ─── POST /auth/resend-verification ──────────────────────────────
// Resends the email verification token to the user's inbox
@Post('resend-verification')
@HttpCode(HttpStatus.OK)
async resendVerification(@Body() dto: ResendVerificationDto) {
  return this.authService.resendVerification(dto);
}



// ─── POST /auth/login ─────────────────────────────────────────────
// Authenticates user and returns access + refresh tokens
@Post('login')
@HttpCode(HttpStatus.OK)
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}

// ─── POST /auth/refresh-token ─────────────────────────────────────
// Rotates refresh token and returns new access + refresh tokens
@Post('refresh-token')
@HttpCode(HttpStatus.OK)
async refreshToken(@Body() dto: RefreshTokenDto) {
  return this.authService.refreshToken(dto);
}



// ─── POST /auth/signout ───────────────────────────────────────────
// Revokes current device's refresh token
@Post('signout')
@HttpCode(HttpStatus.OK)
async signout(@Body() dto: LogoutDto) {
  return this.authService.signout(dto);
}

// ─── POST /auth/signout-all ───────────────────────────────────────
// Revokes all refresh tokens for this user across all devices
@Post('signout-all')
@HttpCode(HttpStatus.OK)
async signoutAll(@Body() dto: LogoutDto) {
  return this.authService.signoutAll(dto);

}





// ─── POST /auth/forgot-password ───────────────────────────────────
// Sends password reset email — always returns success (security)
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.authService.forgotPassword(dto);
}

// ─── POST /auth/reset-password ────────────────────────────────────
// Resets password using token from email
@Post('reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(@Body() dto: ResetPasswordDto) {
  return this.authService.resetPassword(dto);
}






}


