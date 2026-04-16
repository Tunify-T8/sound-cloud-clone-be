import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Get,
  Query,
  Param,
  Req,
} from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddTrackDto } from './dto/add-track.dto';
import { ReorderTracksDto } from './dto/reorder-tracks.dto';

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
  @Get('me')
@UseGuards(JwtAccessGuard)
getMyCollections(
  @Request() req: AuthRequest,
  @Query('page') page = '1',
  @Query('limit') limit = '10',
  @Query('type') type?: string,
) {
  return this.collectionsService.getMyCollections(
    req.user?.userId ?? '',
    Math.max(1, parseInt(page)),
    Math.min(50, Math.max(1, parseInt(limit))),
    type,
  );
}


@Get('token/:token')
getCollectionByToken(@Param('token') token: string) {
  return this.collectionsService.getCollectionByToken(token);
}

@Get(':id')
@UseGuards(JwtOptionalGuard)
getCollectionById(
  @Param('id') id: string,
  @Request() req: AuthRequest,
) {
  return this.collectionsService.getCollectionById(
    id,
    req.user?.userId,
  );
}


@Put(':id')
@UseGuards(JwtAccessGuard)
@UseInterceptors(FileInterceptor('cover'))
updateCollection(
  @Param('id') id: string,
  @Request() req: AuthRequest,
  @Body() dto: UpdateCollectionDto,
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
  return this.collectionsService.updateCollection(
    id,
    req.user?.userId ?? '',
    dto,
    coverFile,
  );
}



@Delete(':id')
@UseGuards(JwtAccessGuard)
deleteCollection(
  @Param('id') id: string,
  @Request() req: AuthRequest,
) {
  return this.collectionsService.deleteCollection(
    id,
    req.user?.userId ?? '',
  );
}

@Get(':id/tracks')
@UseGuards(JwtOptionalGuard)
getCollectionTracks(
  @Param('id') id: string,
  @Request() req: AuthRequest,
  @Query('page') page = '1',
  @Query('limit') limit = '10',
) {
  return this.collectionsService.getCollectionTracks(
    id,
    req.user?.userId,
    Math.max(1, parseInt(page)),
    Math.min(50, Math.max(1, parseInt(limit))),
  );
}

@Post(':id/tracks/add')
@UseGuards(JwtAccessGuard)
async addTrack(
  @Param('id') id: string,
  @Body() dto: AddTrackDto,
  @Req() req: AuthRequest,
) {
  const userId = req.user?.userId ?? '';
  return this.collectionsService.addTrack(id, userId, dto);
}


@Post(':id/tracks/remove')
@UseGuards(JwtAccessGuard)
async removeTrack(
  @Param('id') id: string,
  @Body() dto: AddTrackDto,
  @Req() req: AuthRequest,
) {
  const userId = req.user?.userId ?? '';
  return this.collectionsService.removeTrack(id, userId, dto);
}


@Put(':id/tracks/reorder')
@UseGuards(JwtAccessGuard)
async reorderTracks(
  @Param('id') id: string,
  @Body() dto: ReorderTracksDto,
  @Req() req: AuthRequest,
) {
  const userId = req.user?.userId ?? '';
  return this.collectionsService.reorderTracks(id, userId, dto);
}


@Post(':id/like')
@UseGuards(JwtAccessGuard)
async likeCollection(
  @Param('id') id: string,
  @Req() req: AuthRequest,
) {
  const userId = req.user?.userId ?? '';
  return this.collectionsService.likeCollection(id, userId);
}


@Delete(':id/like')
@UseGuards(JwtAccessGuard)
async unlikeCollection(
  @Param('id') id: string,
  @Req() req: AuthRequest,
) {
  const userId = req.user?.userId ?? '';
  return this.collectionsService.unlikeCollection(id, userId);
}



@Get(':id/embed')
async getEmbed(@Param('id') id: string) {
  return this.collectionsService.getEmbed(id);
}


}