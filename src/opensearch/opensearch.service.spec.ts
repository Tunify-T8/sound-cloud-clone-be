import { Test, TestingModule } from '@nestjs/testing';
import { OpensearchService } from './opensearch.service';
import { ConfigService } from '@nestjs/config';

// ── Mock Client ─────────────────────────────────────────────
const mockClient = {
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  index: jest.fn(),
  delete: jest.fn(),
  bulk: jest.fn(),
  search: jest.fn(),
};

// Mock constructor
jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn(() => mockClient),
}));

const mockConfig = {
  get: jest.fn().mockReturnValue('http://localhost:9200'),
};

describe('OpensearchService', () => {
  let service: OpensearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpensearchService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<OpensearchService>(OpensearchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should check if index exists', async () => {
    mockClient.indices.exists.mockResolvedValue({ body: true });

    const result = await service.indexExists('test');

    expect(result).toBe(true);
  });

  it('should create index', async () => {
    await service.createIndex('test', {});

    expect(mockClient.indices.create).toHaveBeenCalled();
  });

  it('should delete index', async () => {
    await service.deleteIndex('test');

    expect(mockClient.indices.delete).toHaveBeenCalledWith({
      index: 'test',
    });
  });

  it('should index document', async () => {
    await service.indexDocument('test', '1', { foo: 'bar' });

    expect(mockClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'test',
        id: '1',
      }),
    );
  });

  it('should delete document', async () => {
    await service.deleteDocument('test', '1');

    expect(mockClient.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'test',
        id: '1',
      }),
    );
  });

  it('should bulk index', async () => {
    await service.bulkIndex([{ index: {} }]);

    expect(mockClient.bulk).toHaveBeenCalled();
  });

  it('should search', async () => {
    mockClient.search.mockResolvedValue({ body: { hits: [] } });

    const result = await service.search('test', {});

    expect(result).toEqual({ hits: [] });
  });
});
