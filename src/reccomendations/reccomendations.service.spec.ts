import { Test, TestingModule } from '@nestjs/testing';
import { ReccomendationsService } from './reccomendations.service';

describe('ReccomendationsService', () => {
  let service: ReccomendationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReccomendationsService],
    }).compile();

    service = module.get<ReccomendationsService>(ReccomendationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
