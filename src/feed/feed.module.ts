import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';

@Module({
  providers: [FeedService],
  controllers: [FeedController],
  exports: [FeedService]
})
export class FeedModule {}
