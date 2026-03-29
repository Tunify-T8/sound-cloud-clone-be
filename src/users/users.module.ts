import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
