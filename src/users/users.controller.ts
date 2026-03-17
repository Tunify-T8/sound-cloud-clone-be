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
  getCurrentUser(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getCurrentUser(user.sub);
  }

  // ─── GET /users/:id ───────────────────────────────────────
  //returns profile from id
  @Get(':id')
  getUser(
    @Param() id: string,
    @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getUser(id, user?.sub);
  }
}
