import { Controller, Post, UseInterceptors,UploadedFile } from '@nestjs/common';
import { TracksService } from './tracks.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('tracks')
export class TracksController {
    constructor(private tracksService: TracksService){}

    @Post('test-upload')
    @UseInterceptors(FileInterceptor('file'))
    async testUpload(@UploadedFile() file: Express.Multer.File){
        return this.tracksService.testUpload(file);
    }
}
