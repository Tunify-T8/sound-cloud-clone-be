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
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTrackDto } from './dto/create-track.dto';
import { PlaybackContextDto } from './dto/playback-context.dto';
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
  @UseInterceptors(FileInterceptor('artwork'))
  create(
    @Request() req: AuthRequest,
    @Body() dto: CreateTrackDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|png|gif|webp)/ }),
        ],
        fileIsRequired: false,
      }),
    )
    artworkFile?: Express.Multer.File,
  ) {
    return this.tracksService.create(req.user?.userId ?? '', dto, artworkFile);
  }

  @Post('playback-context')
  @UseGuards(JwtAccessGuard)
  async buildContext(@Body() dto: PlaybackContextDto) {
    return this.tracksService.buildPlaybackContext(
      dto.contextType,
      dto.contextId,
      dto.startTrackId,
      dto.shuffle,
      dto.repeat,
    );
  }

  @Post(':id/audio')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAudio(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
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

  @Post(':id/played')
  @UseGuards(JwtAccessGuard)
  async markPlayed(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
  ) {
    return this.tracksService.markTrackPlayed(trackId, req.user?.userId ?? '');
  }

  @Get('me/listening-history')
  @UseGuards(JwtAccessGuard)
  async getListeningHistory(
    @Request() req: AuthRequest,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.tracksService.getListeningHistory(
      req.user?.userId ?? '',
      Number(page),
      Number(limit),
    );
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  getMyTracks(@Request() req: AuthRequest) {
    return this.tracksService.getMyTracks(req.user?.userId ?? '');
  }

  @Get(':id/status')
  @UseGuards(JwtAccessGuard)
  getStatus(@Param('id', ParseUUIDPipe) trackId: string) {
    return this.tracksService.getStatus(trackId);
  }

  @Get(':id')
  @UseGuards(JwtAccessGuard)
  async getTrack(
    @Param('id', ParseUUIDPipe) trackId: string,
    @Request() req: AuthRequest,
  ) {
    const track = await this.tracksService.getTrack(trackId, req.user?.userId ?? '');
    if (!track) {
      return { message: 'Track not found', statusCode: 404 };
    } else {
      return { track, statusCode: 200 };
    }
    // na2es ashoof bs el user authorized wla la (hasaal alfred)
  }

  @Get(':id/playback')
  @UseGuards(JwtAccessGuard)
  async getPlaybackBundle(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
    @Query('privateToken') privateToken?: string,
  ) {
    return this.tracksService.getTrackPlaybackBundle(
      trackId,
      req.user?.userId ?? '',
      privateToken,
    );
  }

  @Get(':id/stream')
  @UseGuards(JwtAccessGuard)
  async getStream(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
    @Query('privateToken') privateToken?: string,
  ) {
    return this.tracksService.getStreamUrl(
      trackId,
      req.user?.userId ?? '',
      privateToken,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAccessGuard)
  @UseInterceptors(FileInterceptor('artwork'))
  async updateTrack(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
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

  @Delete('me/listening-history')
  @UseGuards(JwtAccessGuard)
  async clearHistory(@Request() req: AuthRequest) {
    return this.tracksService.clearListeningHistory(req.user?.userId ?? '');
  }

  @Delete(':id')
  @UseGuards(JwtAccessGuard)
  async deleteTrack(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string,
  ) {
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
    @Param('id', ParseUUIDPipe) trackId: string,
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

 
  @Post(":id/like")
  @UseGuards(JwtAccessGuard)
  async likeTrack(@Request() req: AuthRequest, @Param('id',ParseUUIDPipe) trackId: string) {
    return this.tracksService.likeTrack(trackId, req.user?.userId ?? '');
  }

  @Delete(":id/like")
  @UseGuards(JwtAccessGuard)
  async unlikeTrack(@Request() req: AuthRequest, @Param('id',ParseUUIDPipe) trackId: string) {
    return this.tracksService.unlikeTrack(trackId, req.user?.userId ?? '');
  }

  @Post(":id/repost")
  @UseGuards(JwtAccessGuard)
  async repostTrack(@Request() req: AuthRequest, @Param('id',ParseUUIDPipe) trackId: string) {
    return this.tracksService.repostTrack(trackId, req.user?.userId ?? '');
  }

  @Delete(":id/repost")
  @UseGuards(JwtAccessGuard)
  async unrepostTrack(@Request() req: AuthRequest, @Param('id',ParseUUIDPipe) trackId: string) {
    return this.tracksService.unrepostTrack(trackId, req.user?.userId ?? '');
  }

  @Post(':id/comments')
  @UseGuards(JwtAccessGuard)
  async addComment(
    @Request() req: AuthRequest,
    @Param('id',ParseUUIDPipe) trackId: string,
    @Body('text') text: string,
    @Body('timestamp') timestamp: number,
  ) {
    // Implement comment creation logic here
    return this.tracksService.addComment(trackId, req.user?.userId ?? '', text, timestamp);
  }

 @Get(':id/likes')
  @UseGuards(JwtAccessGuard)
  async getTrackLikes(
    @Param('id', ParseUUIDPipe) trackId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.tracksService.getTrackLikes(
      trackId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get(':id/reposts')
  @UseGuards(JwtAccessGuard)
  async getTrackReposts(
    @Param('id', ParseUUIDPipe) trackId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    // Implement getTrackReposts logic here
    return this.tracksService.getTrackReposts(
      trackId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get(':id/comments')
  @UseGuards(JwtAccessGuard)
  async getTrackComments(
    @Param('id', ParseUUIDPipe) trackId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    // Implement getTrackComments logic here
    return this.tracksService.getTrackComments(
      trackId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }


  @Get(':id/engagement')
  @UseGuards(JwtAccessGuard)
  async getEngagement(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) trackId: string) 
  {
    return this.tracksService.getEngagementMetrics(trackId, req.user?.userId ?? '');
  }

}
