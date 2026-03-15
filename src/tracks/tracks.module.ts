import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { StorageModule } from '../storage/storage.module';
import { AudioModule } from '../audio/audio.module';
import { TracksProcessor } from './tracks.processor';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [StorageModule , AudioModule, BullModule.registerQueue({ name: 'tracks' })],
  controllers: [TracksController],
  providers: [TracksService, TracksProcessor]
})
export class TracksModule {}
