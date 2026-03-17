import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { UsersService } from './users.service';
import { CurrentUserId } from './users.decorator';
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}
  // ─── GET /users/me ───────────────────────────────────────
  //returns the user currently signed in
  @Get('me')
  @UseGuards(JwtAccessGuard)
  getCurrentUser(@CurrentUserId() userId: string) {
    return this.usersService.getCurrentUser(userId);
  }
}
