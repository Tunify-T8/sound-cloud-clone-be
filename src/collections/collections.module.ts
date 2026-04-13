import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { SearchIndexService } from '../search-index/search-index.service';
import { OpensearchService } from '../opensearch/opensearch.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [CollectionsController],
  providers: [CollectionsService, SearchIndexService, OpensearchService],
})
export class CollectionsModule {}