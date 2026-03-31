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
    const user = { userId: 'user-1', email: 'test@example.com', role: 'user' };

    await controller.globalSearch(query, user);

    expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
      query,
      'user-1',
    );
  });

  it('should call globalSearch without userId', async () => {
    const query = { q: 'test' };

    await controller.globalSearch(query, undefined);

    expect(mockSearchService.globalSearch).toHaveBeenCalledWith(
      query,
      undefined,
    );
  });

  // ── searchTracks ──────────────────────────────────────────
  it('should call searchTracks', async () => {
    const query = { q: 'track' };

    await controller.searchTracks(query);

    expect(mockSearchService.searchTracks).toHaveBeenCalledWith(query);
  });

  // ── searchCollections ─────────────────────────────────────
  it('should call searchCollections', async () => {
    const query = { q: 'album' };

    await controller.searchCollections(query);

    expect(mockSearchService.searchCollections).toHaveBeenCalledWith(query);
  });

  // ── searchPeople ──────────────────────────────────────────
  it('should call searchPeople with userId', async () => {
    const query = { q: 'user' };
    const user = { userId: 'user-1', email: 'test@example.com', role: 'user' };

    await controller.searchPeople(query, user);

    expect(mockSearchService.searchPeople).toHaveBeenCalledWith(
      query,
      'user-1',
    );
  });

  it('should call searchPeople without userId', async () => {
    const query = { q: 'user' };

    await controller.searchPeople(query, undefined);

    expect(mockSearchService.searchPeople).toHaveBeenCalledWith(
      query,
      undefined,
    );
  });
});
