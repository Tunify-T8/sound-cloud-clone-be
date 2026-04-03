import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import type { JwtPayload } from '../users/users.decorator';
import { CurrentUser } from '../users/users.decorator';

@Controller('users')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  // ─── POST /users/:id/follow ───────────────────────────────────
  @Post(':id/follow')
  @UseGuards(JwtAccessGuard)
  followUser(
    @Param('id') targetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.followsService.followUser(user.userId, targetId);
  }

  // ─── DELETE /users/:id/unfollow ─────────────────────────────────
  @Delete(':id/unfollow')
  @UseGuards(JwtAccessGuard)
  unfollowUser(
    @Param('id') targetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.followsService.unfollowUser(user.userId, targetId);
  }

  // ─── POST /users/:id/block ────────────────────────────────────
  @Post(':id/block')
  @UseGuards(JwtAccessGuard)
  blockUser(
    @Param('id') targetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.followsService.blockUser(user.userId, targetId);
  }

  // ─── DELETE /users/:id/unblock ──────────────────────────────────
  @Delete(':id/unblock')
  @UseGuards(JwtAccessGuard)
  unblockUser(
    @Param('id') targetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.followsService.unblockUser(user.userId, targetId);
  }

  // ─── GET /users/me/blocked-users ────────────────────────────────────
  @Get('me/blocked-users')
  @UseGuards(JwtAccessGuard)
  getBlockedUsers(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.followsService.getBlockedUsers(user.userId, +page, +limit);
  }



    // ─── GET /users/:id/follow-status ────────────────────────────
    @Get(':id/follow-status')
    @UseGuards(JwtAccessGuard)
    getFollowStatus(
    @Param('id') targetId: string,
    @CurrentUser() user: JwtPayload,
    ) {
    return this.followsService.getFollowStatus(user.userId, targetId);
    }



    // ─── GET /users/me/true-friends ───────────────────────────────
    @Get('me/true-friends')
    @UseGuards(JwtAccessGuard)
    getTrueFriends(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    ) {
    return this.followsService.getTrueFriends(user.userId, +page, +limit);
    }

    // ─── GET /users/me/suggested ──────────────────────────────────
    @Get('me/suggested')
    @UseGuards(JwtAccessGuard)
    getSuggestedUsers(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    ) {
    return this.followsService.getSuggestedUsers(user.userId, +page, +limit);
    }

    // ─── GET /users/me/suggested/artists ─────────────────────────
    @Get('me/suggested/artists')
    @UseGuards(JwtAccessGuard)
    getSuggestedArtists(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    ) {
    return this.followsService.getSuggestedArtists(user.userId, +page, +limit);
    }

}