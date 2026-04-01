import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseGuards,
  Request,
  Patch,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { use } from 'passport';
@Controller('comments')
export class CommentsController{
    constructor(private readonly commentsService: CommentsService) {}

    @Delete(':id')
    @UseGuards(JwtAccessGuard)
    deleteComment(
        @Request() req: Request,
        @Param('id', ParseUUIDPipe) commentId: string,
    ) {
        const userId = (req as any).user?.userId;
        return this.commentsService.deleteComment(userId, commentId);
    }
}
