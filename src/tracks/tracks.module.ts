import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { StorageModule } from '../storage/storage.module';
import { AudioModule } from '../audio/audio.module';

@Module({
  imports: [StorageModule , AudioModule],
  controllers: [TracksController],
  providers: [TracksService]
})
export class TracksModule {}
