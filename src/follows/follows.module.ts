import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}