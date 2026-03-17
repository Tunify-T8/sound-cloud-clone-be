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
  Put,
} from '@nestjs/common';
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTrackDto } from './dto/create-track.dto';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Post()
  create(@Body() dto: CreateTrackDto) {
    return this.tracksService.create('aaaa', dto);
  }

  @Post(':id/audio')
  @UseInterceptors(FileInterceptor('file'))
  uploadAudio(
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
    const userId = 'aaaa';
    return this.tracksService.uploadAudio(trackId, userId, file);
  }

  @Get(':id/status')
  getStatus(@Param('id') trackId: string) {
    return this.tracksService.getStatus(trackId);
  }

  @Get(':id')
  async getTrack(@Param('id') trackId: string) {
    const track = await this.tracksService.getTrack(trackId);
    if(!track){
      return {message: 'Track not found', statusCode: 404};
    }
    else{
      return {track, statusCode: 200};
    }
    // na2es ashoof bs el user authorized wla la (hasaal alfred)
  }

  // @Put(':id')
  // async updateTrack(@Param('id') trackId: string, @Body() dto: UpdateTrackDto) {
  //   const track = await this.tracksService.updateTrack(trackId, dto);
  //   if(!track){
  //     return {message: 'Track not found', statusCode: 404};
  //   }
  //   else{
  //     return {track, statusCode: 200};
  //   }
  // }

  //sswd
}
