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
import { CollectionsModule } from './collections/collections.module';
import { CommentsModule } from './comments/comments.module';
import { ModerationModule } from './moderation/moderation.module';
import { AdminReportsController } from './moderation/admin-reports/admin-reports.controller';
import { ReportsController } from './moderation/reports/reports.controller';
import { ReportsService } from './moderation/reports/reports.service';
import { AdminReportsService } from './moderation/admin-reports/admin-reports.service';
import { AdminUsersService } from './moderation/admin-users/admin-users.service';
import { AdminUsersController } from './moderation/admin-users/admin-users.controller';
import { AdminContentController } from './moderation/admin-content/admin-content.controller';
import { AdminContentService } from './moderation/admin-content/admin-content.service';
import { HealthModule } from './health/health.module';
import { AdminAnalyticsController } from './moderation/admin-analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './moderation/admin-analytics/admin-analytics.service';
import { AdminSearchController } from './admin-search/admin-search.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversationsModule } from './conversations/conversations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ReccomendationsModule } from './reccomendations/reccomendations.module';

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
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
      },
    }),
    FeedModule,
    SearchModule,
    CollectionsModule,
    CommentsModule,
    ModerationModule,
    HealthModule,
    NotificationsModule,
    ConversationsModule,
    SubscriptionsModule,
    ReccomendationsModule,
  ],
  controllers: [AppController, AdminReportsController, ReportsController, AdminUsersController, AdminContentController, AdminAnalyticsController, AdminSearchController],
  providers: [AppService, SearchIndexService, OpensearchService, ReportsService, AdminReportsService, AdminUsersService, AdminContentService, AdminAnalyticsService],
})
export class AppModule {}
