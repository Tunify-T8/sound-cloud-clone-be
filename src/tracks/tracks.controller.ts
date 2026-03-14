import { Controller, Post, UseInterceptors,UploadedFile } from '@nestjs/common';
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('tracks')
export class TracksController {
    constructor(private tracksService: TracksService){}
}
