import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { TracksModule } from './tracks/tracks.module';
import { StorageModule } from './storage/storage.module';
import { AudioModule } from './audio/audio.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    // ConfigModule global so all modules can access .env variables
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TracksModule,
    StorageModule,
    AudioModule,
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
