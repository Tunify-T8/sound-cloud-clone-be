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
} from '@nestjs/common';
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackMultipartDto } from './dto/update-track-multipart.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

interface AuthRequest extends Request {
  user?: { userId: string };
}

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Post()
  @UseGuards(JwtAccessGuard)
  create(@Request() req: AuthRequest, @Body() dto: CreateTrackDto) {
    return this.tracksService.create(req.user?.userId ?? '', dto);
  }

  @Post(':id/audio')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAudio(
    @Request() req: AuthRequest,
    @Param('id') trackId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /audio\/(mpeg|wav|flac|aiff|ogg|aac|x-flac|x-aiff)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tracksService.uploadAudio(
      trackId,
      req.user?.userId ?? '',
      file,
    );
  }

  @Get(':id/status')
  @UseGuards(JwtAccessGuard)
  getStatus(@Param('id') trackId: string) {
    return this.tracksService.getStatus(trackId);
  }

  @Get(':id')
  @UseGuards(JwtAccessGuard)
  async getTrack(@Param('id') trackId: string) {
    const track = await this.tracksService.getTrack(trackId);
    if (!track) {
      return { message: 'Track not found', statusCode: 404 };
    } else {
      return { track, statusCode: 200 };
    }
    // na2es ashoof bs el user authorized wla la (hasaal alfred)
  }

  @Patch(':id')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('artwork'))
  async updateTrack(
    @Request() req: AuthRequest,
    @Param('id') trackId: string,
    @Body() dto: UpdateTrackMultipartDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB for images
          new FileTypeValidator({ fileType: /image\/(jpeg|png|gif|webp)/ }),
        ],
        fileIsRequired: false, // Artwork is optional
      }),
    )
    artworkFile?: Express.Multer.File,
  ) {
    const userId = req.user?.userId ?? '';
    const result = await this.tracksService.updateTrack(
      trackId,
      userId,
      dto,
      artworkFile,
    );
    return result;
  }

  //--------------------TO BE ADDED IF WELL USE PATCH---------------------//
  // @Patch(':id')
  // async updateTrackJson(
  //   @Param('id') trackId: string,
  //   @Body() dto: UpdateTrackDto,
  // ) {
  //   const userId = 'b712d133-03c6-4229-b07e-6da113d23bb8';
  //   const track = await this.tracksService.updateTrackJson(trackId, userId, dto);
  //   return { track, statusCode: 200 };
  // }

  @Delete(':id')
  @UseGuards(JwtAccessGuard)
  async deleteTrack(@Request() req: AuthRequest, @Param('id') trackId: string) {
    const result = await this.tracksService.deleteTrack(
      trackId,
      req.user?.userId ?? '',
    );
    return { trackId, ...result };
  }

  @Post(':id/audio/replace')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  async replaceAudio(
    @Request() req: AuthRequest,
    @Param('id') trackId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /audio\/(mpeg|wav)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tracksService.replaceAudio(
      trackId,
      req.user?.userId ?? '',
      file,
    );
  }
}
