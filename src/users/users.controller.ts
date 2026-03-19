import { Controller, Get, UseGuards, Param, Query } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { UsersService } from './users.service';
import * as usersDecorator from './users.decorator';
import { CollectionType } from '@prisma/client';

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

  //─── GET /me/albums ───────────────────────────────────────
  //returns my albums
  @Get('me/albums')
  @UseGuards(JwtAccessGuard)
  getAlbums(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getCollections(
      user.userId,
      CollectionType.ALBUM,
      page,
      limit,
    );
  }

  //─── GET /me/playlists ───────────────────────────────────────
  //returns my playlists
  @Get('me/playlists')
  @UseGuards(JwtAccessGuard)
  getPlaylists(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getCollections(
      user.userId,
      CollectionType.PLAYLIST,
      page,
      limit,
    );
  }

  // ─── GET /me/liked-tracks ───────────────────────────────────────
  //returns my liked tracks
  @Get('me/liked-tracks')
  @UseGuards(JwtAccessGuard)
  getLikedTracks(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getLikedTracks(user.userId, page, limit);
  }

  // ─── GET /me/followers───────────────────────────────────────
  //returns my followers
  @UseGuards(JwtAccessGuard)
  @Get('me/followers')
  getMyFollowers(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.usersService.getFollowerList(user.userId, +page, +limit);
  }

  @UseGuards(JwtAccessGuard)
  @Get('me/following')
  getMyFollowing(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.usersService.getFollowingList(user.userId, +page, +limit);
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

  // ─── GET /:id/followers ───────────────────────────────────────
  //gets follower list of a user
  @Get(':id/followers')
  getFollowers(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getFollowerList(id, page, limit);
  }

  // ─── GET /:id/following ───────────────────────────────────────
  //gets following list of a user
  @Get(':id/following')
  getFollowing(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getFollowingList(id, page, limit);
  }
}
