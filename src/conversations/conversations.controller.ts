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
}
