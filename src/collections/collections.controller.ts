import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { FileInterceptor } from '@nestjs/platform-express';

interface AuthRequest extends Request {
  user?: { userId: string };
}

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('cover'))
  create(
    @Request() req: AuthRequest,
    @Body() dto: CreateCollectionDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|png|gif|webp)/ }),
        ],
        fileIsRequired: false,
      }),
    )
    coverFile?: any,
  ) {
    return this.collectionsService.create(
      req.user?.userId ?? '',
      dto,
      coverFile,
    );
  }
}