import { Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AdminOnly } from 'src/auth/decorators/roles.decorator';
import { AdminContentService } from './admin-content.service';
import * as usersDecorator from 'src/users/users.decorator';

@UseGuards(JwtAccessGuard, RolesGuard)
@AdminOnly()
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly adminContentService: AdminContentService) {}

  // ── Tracks ───────────────────────────────────────────────────────

  @Patch('tracks/:trackId/hide')
  hideTrack(
    @Param('trackId') trackId: string,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminContentService.hideTrack(trackId, user.userId);
  }

  @Patch('tracks/:trackId/unhide')
  unhideTrack(@Param('trackId') trackId: string) {
    return this.adminContentService.unhideTrack(trackId);
  }

  @Delete('tracks/:trackId')
  deleteTrack(
    @Param('trackId') trackId: string,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminContentService.deleteTrack(trackId, user.userId);
  }

  // ── Comments ─────────────────────────────────────────────────────

  @Patch('comments/:commentId/hide')
  hideComment(
    @Param('commentId') commentId: string,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminContentService.hideComment(commentId, user.userId);
  }

  @Patch('comments/:commentId/unhide')
  unhideComment(@Param('commentId') commentId: string) {
    return this.adminContentService.unhideComment(commentId);
  }

  @Delete('comments/:commentId')
  deleteComment(
    @Param('commentId') commentId: string,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminContentService.deleteComment(commentId, user.userId);
  }
}
