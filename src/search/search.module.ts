import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';
import { SearchIndexService } from 'src/search-index/search-index.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [OpensearchService, SearchIndexService, SearchService],
})
export class SearchModule {}
