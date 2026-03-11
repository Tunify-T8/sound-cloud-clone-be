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


}


