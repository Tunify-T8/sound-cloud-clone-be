import { Test, TestingModule } from '@nestjs/testing';
import { ReccomendationsController } from './reccomendations.controller';

describe('ReccomendationsController', () => {
  let controller: ReccomendationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReccomendationsController],
    }).compile();

    controller = module.get<ReccomendationsController>(ReccomendationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
