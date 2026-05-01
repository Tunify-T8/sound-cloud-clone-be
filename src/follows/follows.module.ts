import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchIndexService } from 'src/search-index/search-index.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FollowsController],
  providers: [FollowsService, SearchIndexService, OpensearchService],
})
export class FollowsModule {}
