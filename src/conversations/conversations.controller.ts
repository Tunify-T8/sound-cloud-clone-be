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
}
