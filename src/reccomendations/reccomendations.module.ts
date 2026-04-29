import { Module } from '@nestjs/common';
import { ReccomendationsService } from './reccomendations.service';
import { ReccomendationsController } from './reccomendations.controller';

@Module({
  providers: [ReccomendationsService],
  controllers: [ReccomendationsController]
})
export class ReccomendationsModule {}
