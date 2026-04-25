import { AdminSearchController } from './admin-search.controller';

describe('AdminSearchController', () => {
  let controller: AdminSearchController;

  const mockSearchIndex = {
    reindexAllTracks: jest.fn(),
    reindexAllUsers: jest.fn(),
    reindexAllCollections: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminSearchController(mockSearchIndex as any);
  });

  // ── reindexAll ───────────────────────────────────────────
  describe('reindexAll', () => {
    it('should trigger all reindex methods and return message', async () => {
      mockSearchIndex.reindexAllTracks.mockResolvedValue(undefined);
      mockSearchIndex.reindexAllUsers.mockResolvedValue(undefined);
      mockSearchIndex.reindexAllCollections.mockResolvedValue(undefined);

      const result = await controller.reindexAll();

      expect(mockSearchIndex.reindexAllTracks).toHaveBeenCalled();
      expect(mockSearchIndex.reindexAllUsers).toHaveBeenCalled();
      expect(mockSearchIndex.reindexAllCollections).toHaveBeenCalled();

      expect(result).toEqual({ message: 'Reindex started' });
    });

    it('should log error if any reindex fails', async () => {
      const error = new Error('fail');

      mockSearchIndex.reindexAllTracks.mockRejectedValue(error);
      mockSearchIndex.reindexAllUsers.mockResolvedValue(undefined);
      mockSearchIndex.reindexAllCollections.mockResolvedValue(undefined);

      const loggerSpy = jest
        .spyOn(controller['logger'], 'error')
        .mockImplementation();

      await controller.reindexAll();
      await Promise.resolve(); // flush microtasks

      expect(loggerSpy).toHaveBeenCalledWith('Reindex all failed', error.stack);
    });
  });

  // ── reindexTracks ───────────────────────────────────────
  describe('reindexTracks', () => {
    it('should call service and return message', async () => {
      mockSearchIndex.reindexAllTracks.mockResolvedValue(undefined);

      const result = await controller.reindexTracks();

      expect(mockSearchIndex.reindexAllTracks).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Track reindex started' });
    });

    it('should log error if reindex fails', async () => {
      const error = new Error('fail');
      mockSearchIndex.reindexAllTracks.mockRejectedValue(error);

      const loggerSpy = jest
        .spyOn(controller['logger'], 'error')
        .mockImplementation();

      await controller.reindexTracks();
      await Promise.resolve();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Track reindex failed',
        error.stack,
      );
    });
  });

  // ── reindexUsers ───────────────────────────────────────
  describe('reindexUsers', () => {
    it('should call service and return message', async () => {
      mockSearchIndex.reindexAllUsers.mockResolvedValue(undefined);

      const result = await controller.reindexUsers();

      expect(mockSearchIndex.reindexAllUsers).toHaveBeenCalled();
      expect(result).toEqual({ message: 'User reindex started' });
    });

    it('should log error if reindex fails', async () => {
      const error = new Error('fail');
      mockSearchIndex.reindexAllUsers.mockRejectedValue(error);

      const loggerSpy = jest
        .spyOn(controller['logger'], 'error')
        .mockImplementation();

      await controller.reindexUsers();
      await Promise.resolve();

      expect(loggerSpy).toHaveBeenCalledWith(
        'User reindex failed',
        error.stack,
      );
    });
  });

  // ── reindexCollections ─────────────────────────────────
  describe('reindexCollections', () => {
    it('should call service and return message', async () => {
      mockSearchIndex.reindexAllCollections.mockResolvedValue(undefined);

      const result = await controller.reindexCollections();

      expect(mockSearchIndex.reindexAllCollections).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Collection reindex started',
      });
    });

    it('should log error if reindex fails', async () => {
      const error = new Error('fail');
      mockSearchIndex.reindexAllCollections.mockRejectedValue(error);

      const loggerSpy = jest
        .spyOn(controller['logger'], 'error')
        .mockImplementation();

      await controller.reindexCollections();
      await Promise.resolve();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Collection reindex failed',
        error.stack,
      );
    });
  });
});
