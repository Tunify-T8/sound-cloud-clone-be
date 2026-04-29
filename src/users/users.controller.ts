import {
  Controller,
  Get,
  UseGuards,
  Param,
  Query,
  Patch,
  Post,
  Body,
  Delete,
  Request,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  // ParseFilePipe,
  // MaxFileSizeValidator,
  // FileTypeValidator,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { UpdateSocialLinksDto } from './dto/update-social-links.dto';
import { UsersService } from './users.service';
import * as usersDecorator from './users.decorator';
import { CollectionType, SocialPlatform } from '@prisma/client';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ParseSocialPlatformPipe } from './pipes/parse-social-platform.pipe';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard';
interface AuthRequest extends Request {
  user?: { userId: string };
}

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

  @Get('me/conversations')
  @UseGuards(JwtAccessGuard)
  getMyConversations(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.usersService.getMyConversations(user.userId, page, limit);
  }

  @Post('me/conversations')
  @UseGuards(JwtAccessGuard)
  createConversation(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Body('userId') otherUserId: string,
  ) {
    return this.usersService.createConversation(user.userId, otherUserId);
  }

  @Get('me/messages/unread-count')
  @UseGuards(JwtAccessGuard)
  getUnreadMessagesCount(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getUnreadMessagesCount(user.userId);
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

  // ─── GET /:id/liked-tracks ───────────────────────────────────────
  // returns liked tracks of a specific user
  @Get(':id/liked-tracks')
  @UseGuards(JwtAccessGuard)
  getLikedTracksByUser(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getLikedTracks(id, page, limit);
  }

  // ─── GET /me/popular-tracks ────────────────────────────
  @Get('me/popular-tracks')
  @UseGuards(JwtAccessGuard)
  getPopularTracks(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getPopularTracks(user.userId, page, limit);
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

  //─── GET /me/favorite-genres ───────────────────────────────────────
  // returns my social links
  @Get('me/favorite-genres')
  @UseGuards(JwtAccessGuard)
  getFavoriteGenres(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getFavoriteGenres(user.userId);
  }

  // ─── GET /users/:id ───────────────────────────────────────
  //returns profile from id
  @Get(':id')
  getUser(
    @Param('id', ParseUUIDPipe) id: string,
    @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.usersService.getUser(id, user?.userId);
  }

  @Get(':id/likes')
  getUserLikes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getLikedTracks(id, page, limit);
  }

  // ─── GET /:id/followers ───────────────────────────────────────
  //gets follower list of a user
  @Get(':id/followers')
  getFollowers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getFollowerList(id, page, limit);
  }

  @Get(':id/reposts')
  @UseGuards(JwtAccessGuard)
  getUserReposts(
    @Param('id', ParseUUIDPipe) userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getReposts(userId, page, limit);
  }

  // ─── GET /:id/following ───────────────────────────────────────
  //gets following list of a user
  @Get(':id/following')
  getFollowing(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getFollowingList(id, page, limit);
  }

  // ─── GET /:id/tracks ───────────────────────────────────────
  //gets track list of a user
  @Get(':id/tracks')
  @UseGuards(JwtAccessGuard)
  getPublicUserTracks(
    @Param('id', ParseUUIDPipe) targetUserId: string,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getPublicTracks(
      targetUserId,
      user.userId,
      page,
      limit,
    );
  }

  // ─── PATCH /me/social-links ───────────────────────────────────────
  //updates social links of user
  @Patch('me/social-links')
  @UseGuards(JwtAccessGuard)
  updateSocialLinks(
    @Body() input: UpdateSocialLinksDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.updateSocialLinks(user.userId, input);
  }

  // ─── PATCH /me/profile ───────────────────────────────────────
  //updates user profile
  @Patch('me/profile')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'avatar', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      {
        limits: { fileSize: 2 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
          if (!file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
            return cb(
              new BadRequestException('Only JPEG/JPG/PNG allowed'),
              false,
            );
          }
          cb(null, true);
        },
      },
    ),
  )
  updateProfile(
    @Body() input: UpdateUserProfileDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @UploadedFiles()
    files?: {
      avatar?: Express.Multer.File[];
      cover?: Express.Multer.File[];
    },
  ) {
    return this.usersService.updateUserProfile(user.userId, input, files);
  }

  // ─── DELETE /me/social-links/:platform ───────────────────────────────────────
  //delete a social link
  @Delete('me/social-links/:platform')
  @UseGuards(JwtAccessGuard)
  deleteSocialLink(
    @Param('platform', ParseSocialPlatformPipe) platform: SocialPlatform,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.usersService.deleteSocialLink(user.userId, platform);
  }

  @Get('me/upload')
  @UseGuards(JwtAccessGuard)
  getUploadStats(@Request() req: AuthRequest) {
    const userId = req.user?.userId ?? '';
    return this.usersService.getUploadStats(userId);
  }

  @Get(':id/artist-tools/upload-minutes')
  @UseGuards(JwtAccessGuard)
  getUploadMinutes(@Param('id', ParseUUIDPipe) userId: string) {
    return this.usersService.getUploadStats(userId);
  }

  @Get(':username/collections')
  @UseGuards(JwtOptionalGuard)
  getUserCollections(
    @Param('username') username: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req?: AuthRequest,
  ) {
    const requesterId = req?.user?.userId;
    return this.usersService.getUserCollections(
      username,
      requesterId,
      +page,
      +limit,
    );
  }

  @Get(':username/albums')
  @UseGuards(JwtOptionalGuard)
  getUserAlbums(
    @Param('username') username: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req?: AuthRequest,
  ) {
    const requesterId = req?.user?.userId;
    return this.usersService.getUserCollections(
      username,
      requesterId,
      +page,
      +limit,
      CollectionType.ALBUM,
    );
  }

  @Get(':username/playlists')
  @UseGuards(JwtOptionalGuard)
  getUserPlaylists(
    @Param('username') username: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req?: AuthRequest,
  ) {
    const requesterId = req?.user?.userId;
    return this.usersService.getUserCollections(
      username,
      requesterId,
      +page,
      +limit,
      CollectionType.PLAYLIST,
    );
  }
  @Get('me/track-genres')
  getGenre() {
    return this.usersService.getGenres();
  }
}
