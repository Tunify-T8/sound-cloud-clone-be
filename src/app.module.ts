import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { TracksModule } from './tracks/tracks.module';
import { StorageModule } from './storage/storage.module';
import { AudioModule } from './audio/audio.module';
import { BullModule } from '@nestjs/bull';
import { FollowsModule } from './follows/follows.module';
import { FeedModule } from './feed/feed.module';
import { SearchModule } from './search/search.module';
import { SearchIndexService } from './search-index/search-index.service';
import { OpensearchService } from './opensearch/opensearch.service';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    TracksModule,
    StorageModule,
    AudioModule,
    FollowsModule,
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    FeedModule,
    SearchModule,
    CommentsModule,
  ],
  controllers: [AppController],
  providers: [AppService, SearchIndexService, OpensearchService],
})
export class AppModule {}
