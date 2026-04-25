import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminOnly } from 'src/auth/decorators/roles.decorator';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { SearchIndexService } from 'src/search-index/search-index.service';
import { SEARCH_INDEXES } from 'src/search/constants/search.constants';

@UseGuards(JwtAccessGuard, RolesGuard)
@AdminOnly()
@Controller('admin-search')
export class AdminSearchController {
  private readonly logger = new Logger(AdminSearchController.name);

  constructor(private readonly searchIndex: SearchIndexService) {}

  @Post('reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexAll() {
    // fire and forget — reindexing can take a while
    void Promise.all([
      this.searchIndex.reindexAllTracks(),
      this.searchIndex.reindexAllUsers(),
      this.searchIndex.reindexAllCollections(),
    ]).catch((err: unknown) => {
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error('Reindex all failed', stack);
    });

    return { message: 'Reindex started' };
  }

  @Post('reindex/tracks')
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexTracks() {
    void this.searchIndex.reindexAllTracks().catch((err: unknown) => {
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error('Track reindex failed', stack);
    });
    return { message: 'Track reindex started' };
  }

  @Post('reindex/users')
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexUsers() {
    void this.searchIndex.reindexAllUsers().catch((err: unknown) => {
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error('User reindex failed', stack);
    });
    return { message: 'User reindex started' };
  }

  @Post('reindex/collections')
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexCollections() {
    void this.searchIndex.reindexAllCollections().catch((err: unknown) => {
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error('Collection reindex failed', stack);
    });
    return { message: 'Collection reindex started' };
  }

  @Delete('indexes')
  @HttpCode(HttpStatus.OK)
  async deleteAllIndexes() {
    await Promise.all([
      this.searchIndex.deleteIndex(SEARCH_INDEXES.TRACKS),
      this.searchIndex.deleteIndex(SEARCH_INDEXES.USERS),
      this.searchIndex.deleteIndex(SEARCH_INDEXES.COLLECTIONS),
    ]);
    return { message: 'Indexes deleted' };
  }
}
