import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// ── Mock Service ────────────────────────────────────────────
const mockSearchService = {
  globalSearch: jest.fn(),
  searchTracks: jest.fn(),
  searchCollections: jest.fn(),
  searchPeople: jest.fn(),
};

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── globalSearch ──────────────────────────────────────────
  it('should call globalSearch with userId when provided', async () => {
    const query = { q: 'test' };
    const user = { userId: 'user-1' };

    await controller.globalSearch(query as any, user as any);

    expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
      query,
      'user-1',
    );
  });

  it('should call globalSearch without userId', async () => {
    const query = { q: 'test' };

    await controller.globalSearch(query as any, undefined);

    expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
      query,
      undefined,
    );
  });

  // ── searchTracks ──────────────────────────────────────────
  it('should call searchTracks', async () => {
    const query = { q: 'track' };

    await controller.searchTracks(query as any);

    expect(mockSearchService.searchTracks).toHaveBeenCalledWith(query);
  });

  // ── searchCollections ─────────────────────────────────────
  it('should call searchCollections', async () => {
    const query = { q: 'album' };

    await controller.searchCollections(query as any);

    expect(mockSearchService.searchCollections).toHaveBeenCalledWith(query);
  });

  // ── searchPeople ──────────────────────────────────────────
  it('should call searchPeople with userId', async () => {
    const query = { q: 'user' };
    const user = { userId: 'user-1' };

    await controller.searchPeople(query as any, user as any);

    expect(mockSearchService.searchPeople).toHaveBeenCalledWith(
      query,
      'user-1',
    );
  });

  it('should call searchPeople without userId', async () => {
    const query = { q: 'user' };

    await controller.searchPeople(query as any, undefined);

    expect(mockSearchService.searchPeople).toHaveBeenCalledWith(
      query,
      undefined,
    );
  });
});
