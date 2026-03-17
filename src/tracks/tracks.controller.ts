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
} from '@nestjs/common';
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTrackDto } from './dto/create-track.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Post()
  @UseGuards(JwtAccessGuard)
  create(@Request() req, @Body() dto: CreateTrackDto) {
    return this.tracksService.create(req.user.userId, dto);
    //                                        ↑ userId not id
  }

  @Post(':id/audio')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAudio(
    @Request() req,
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
    return this.tracksService.uploadAudio(trackId, req.user.userId, file);
  }

  @Get(':id/status')
  @UseGuards(JwtAccessGuard)
  getStatus(@Param('id') trackId: string) {
    return this.tracksService.getStatus(trackId);
  }
}
