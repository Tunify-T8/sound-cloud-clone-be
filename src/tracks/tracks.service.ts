import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TracksService {
    constructor(private storage:StorageService){}

    async testUpload(file: Express.Multer.File){
        const url = await this.storage.uploadAudio(file);
        return(url);
    }
}
