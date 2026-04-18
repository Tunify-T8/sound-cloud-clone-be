import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
@Controller('comments')
export class CommentsController{
    constructor(private readonly commentsService: CommentsService) {}

    @Delete(':id')
    @UseGuards(JwtAccessGuard)
    async deleteComment(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.deleteComment(userId, commentId);
    }

    @Post(':id/replies')
    @UseGuards(JwtAccessGuard)
    async addReply(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
        @Body('text') text: string,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.addReply(commentId, userId, text);
    }

    @Get(':id/replies')
    @UseGuards(JwtAccessGuard)
    async getReplies(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.getReplies(commentId, userId, page, limit);
    }

    @Post(':id/like')
    @UseGuards(JwtAccessGuard)
    async likeComment(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.likeComment(commentId, userId);
    }

    @Delete(':id/like')
    @UseGuards(JwtAccessGuard)
    async unlikeComment(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.unlikeComment(commentId, userId);
    }
}
