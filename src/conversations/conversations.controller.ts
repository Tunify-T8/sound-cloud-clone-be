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
import { ConversationsService } from './conversations.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
@Controller('conversations')
export class ConversationsController {
    constructor(private readonly conversationsService: ConversationsService) {}

    @Delete(':id')
    @UseGuards(JwtAccessGuard)
    deleteConversation(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
    ) {
        return this.conversationsService.deleteConversation(req.user.userId, conversationId);
    }

    @Get(':id/messages')
    @UseGuards(JwtAccessGuard)
    getMessages(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        return this.conversationsService.getMessages(req.user.userId, conversationId, page, limit);
    }

    @Post(':id/read')
    @UseGuards(JwtAccessGuard)
    markAsRead(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
    ) {
        return this.conversationsService.markAs(req.user.userId, conversationId, true);
    }

    @Post(':id/unread')
    @UseGuards(JwtAccessGuard)
    markAsUnread(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
    ) {
        return this.conversationsService.markAs(req.user.userId, conversationId, false);
    }

    @Post(':id/archive')
    @UseGuards(JwtAccessGuard)
    archiveConversation(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
    ) {
        return this.conversationsService.archiveConversation(req.user.userId, conversationId);
    }

    @Delete(':id/archive')
    @UseGuards(JwtAccessGuard)
    unarchiveConversation(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
    ) {
        return this.conversationsService.unarchiveConversation(req.user.userId, conversationId);
    }

    @Post(':id/block')
    @UseGuards(JwtAccessGuard)
    blockUser(
        @Request() req,
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @Body('removeComments') removeComments: boolean,
        @Body('reportSpam') reportSpam: boolean,
    ) {
        return this.conversationsService.blockUser(req.user.userId, conversationId, removeComments, reportSpam);
    }

    @Post('unblock/:blockedUserId')
    @UseGuards(JwtAccessGuard)
    unblockUser(
        @Request() req,
        @Param('blockedUserId', new ParseUUIDPipe()) blockedUserId: string,
    ) {
        return this.conversationsService.unblockUser(req.user.userId, blockedUserId);
    }
}
