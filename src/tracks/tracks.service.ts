import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AudioService } from 'src/audio/audio.service';

@Injectable()
export class TracksService {
    constructor(private storage:StorageService , private audio:AudioService){}

}
