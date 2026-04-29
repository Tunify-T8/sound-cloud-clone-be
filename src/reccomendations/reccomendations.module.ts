import { Module } from '@nestjs/common';
import { ReccomendationsController } from './reccomendations.controller';
import { RecommendationsService } from './reccomendations.service';

@Module({
  providers: [RecommendationsService],
  controllers: [ReccomendationsController],
})
export class ReccomendationsModule {}
