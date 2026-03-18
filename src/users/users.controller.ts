import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { UsersService } from './users.service';
import * as usersDecorator from './users.decorator';

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
    return this.usersService.getCurrentUser(user.userId);
  }

  // ─── GET /me/social-links ───────────────────────────────────────
  //returns my social links
  @Get('me/social-links')
  @UseGuards(JwtAccessGuard)
  getSocialLinks(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getSocialLinks(user.userId);
  }
  //─── GET /me/tracks ───────────────────────────────────────
  //returns my tracks
  @Get('me/tracks')
  @UseGuards(JwtAccessGuard)
  getTracks(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getTracks(user.userId, page, limit);
  }
  //─── GET /me/reposts ───────────────────────────────────────
  //returns my reposts
  @Get('me/reposts')
  @UseGuards(JwtAccessGuard)
  getReposts(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getReposts(user.userId, page, limit);
  }

  // ─── GET /users/:id ───────────────────────────────────────
  //returns profile from id
  @Get(':id')
  getUser(
    @Param('id') id: string,
    @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getUser(id, user?.userId);
  }
}
