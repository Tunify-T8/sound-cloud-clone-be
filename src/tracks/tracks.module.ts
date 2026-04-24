import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { StorageModule } from '../storage/storage.module';
import { AudioModule } from '../audio/audio.module';
import { TracksProcessor } from './tracks.processor';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    AudioModule,
    SearchModule,
    BullModule.registerQueue({ name: 'tracks' }),
    NotificationsModule
  ],
  controllers: [TracksController],
  providers: [TracksService, TracksProcessor],
})
export class TracksModule {}
