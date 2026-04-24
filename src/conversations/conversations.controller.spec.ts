import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let conversationsService: ConversationsService;

  const mockConversationsService = {
    deleteConversation: jest.fn(),
    getMessages: jest.fn(),
    markAs: jest.fn(),
    archiveConversation: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
  };

  const mockRequest = {
    user: {
      userId: 'user-123',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        {
          provide: ConversationsService,
          useValue: mockConversationsService,
        },
      ],
    }).compile();

    controller = module.get<ConversationsController>(ConversationsController);
    conversationsService = module.get<ConversationsService>(ConversationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ───── deleteConversation ─────────────────────────────────────
  describe('DELETE /conversations/:id', () => {
    it('should delete a conversation', async () => {
      const mockResponse = { message: 'Conversation conv-123 deleted for user user-123' };
      mockConversationsService.deleteConversation.mockResolvedValue(mockResponse);

      const result = await controller.deleteConversation(mockRequest, 'conv-123');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.deleteConversation).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
      );
    });

    it('should pass userId from request to service', async () => {
      mockConversationsService.deleteConversation.mockResolvedValue({});

      await controller.deleteConversation(mockRequest, 'conv-123');

      expect(mockConversationsService.deleteConversation).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
      );
    });

    it('should propagate service errors', async () => {
      mockConversationsService.deleteConversation.mockRejectedValue(
        new NotFoundException('Conversation not found'),
      );

      await expect(
        controller.deleteConversation(mockRequest, 'conv-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───── getMessages ────────────────────────────────────────────
  describe('GET /conversations/:id/messages', () => {
    it('should return messages with default pagination', async () => {
      const mockResponse = {
        conversationId: 'conv-123',
        messages: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockConversationsService.getMessages.mockResolvedValue(mockResponse);

      const result = await controller.getMessages(mockRequest, 'conv-123');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.getMessages).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        1,
        20,
      );
    });

    it('should accept custom pagination parameters', async () => {
      const mockResponse = {
        conversationId: 'conv-123',
        messages: [],
        page: 2,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: true,
      };
      mockConversationsService.getMessages.mockResolvedValue(mockResponse);

      const result = await controller.getMessages(mockRequest, 'conv-123', 2, 50);

      expect(mockConversationsService.getMessages).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        2,
        50,
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should return formatted messages', async () => {
      const mockResponse = {
        conversationId: 'conv-123',
        messages: [
          {
            id: 'msg-123',
            sender: { id: 'user-456', username: 'sender' },
            type: 'TEXT',
            text: 'Hello',
            createdAt: new Date(),
            attachment: { id: null, type: 'TEXT', preview: null },
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockConversationsService.getMessages.mockResolvedValue(mockResponse);

      const result = await controller.getMessages(mockRequest, 'conv-123');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('TEXT');
    });

    it('should throw error when conversation not found', async () => {
      mockConversationsService.getMessages.mockRejectedValue(
        new NotFoundException('Conversation not found'),
      );

      await expect(
        controller.getMessages(mockRequest, 'conv-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───── markAsRead ─────────────────────────────────────────────
  describe('POST /conversations/:id/read', () => {
    it('should mark conversation as read', async () => {
      const mockResponse = { message: 'Conversation conv-123 marked as read for user user-123' };
      mockConversationsService.markAs.mockResolvedValue(mockResponse);

      const result = await controller.markAsRead(mockRequest, 'conv-123');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.markAs).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        true,
      );
    });

    it('should pass true as the third parameter', async () => {
      mockConversationsService.markAs.mockResolvedValue({});

      await controller.markAsRead(mockRequest, 'conv-123');

      expect(mockConversationsService.markAs).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        true,
      );
    });
  });

  // ───── markAsUnread ───────────────────────────────────────────
  describe('POST /conversations/:id/unread', () => {
    it('should mark conversation as unread', async () => {
      const mockResponse = { message: 'Conversation conv-123 marked as unread for user user-123' };
      mockConversationsService.markAs.mockResolvedValue(mockResponse);

      const result = await controller.markAsUnread(mockRequest, 'conv-123');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.markAs).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        false,
      );
    });

    it('should pass false as the third parameter', async () => {
      mockConversationsService.markAs.mockResolvedValue({});

      await controller.markAsUnread(mockRequest, 'conv-123');

      expect(mockConversationsService.markAs).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        false,
      );
    });
  });

  // ───── archiveConversation ────────────────────────────────────
  describe('POST /conversations/:id/archive', () => {
    it('should archive a conversation', async () => {
      const mockResponse = { message: 'Conversation conv-123 archived for user user-123' };
      mockConversationsService.archiveConversation.mockResolvedValue(mockResponse);

      const result = await controller.archiveConversation(mockRequest, 'conv-123');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.archiveConversation).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
      );
    });

    it('should return confirmation message', async () => {
      const mockResponse = { message: 'Conversation archived' };
      mockConversationsService.archiveConversation.mockResolvedValue(mockResponse);

      const result = await controller.archiveConversation(mockRequest, 'conv-123');

      expect(result.message).toContain('archived');
    });
  });

  // ───── blockUser ───────────────────────────────────────────────
  describe('POST /conversations/:id/block', () => {
    it('should block a user with options', async () => {
      const mockResponse = {
        message: 'User blocked successfully',
        blockedUserId: 'other-user-456',
        blockId: 'block-123',
      };
      mockConversationsService.blockUser.mockResolvedValue(mockResponse);

      const result = await controller.blockUser(
        mockRequest,
        'conv-123',
        true,
        false,
      );

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.blockUser).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        true,
        false,
      );
    });

    it('should pass removeComments and reportSpam flags', async () => {
      mockConversationsService.blockUser.mockResolvedValue({});

      await controller.blockUser(mockRequest, 'conv-123', false, true);

      expect(mockConversationsService.blockUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        false,
        true,
      );
    });

    it('should handle both flags as true', async () => {
      mockConversationsService.blockUser.mockResolvedValue({});

      await controller.blockUser(mockRequest, 'conv-123', true, true);

      expect(mockConversationsService.blockUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        true,
        true,
      );
    });

    it('should throw error when conversation not found', async () => {
      mockConversationsService.blockUser.mockRejectedValue(
        new NotFoundException('Conversation not found'),
      );

      await expect(
        controller.blockUser(mockRequest, 'conv-999', true, false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───── unblockUser ────────────────────────────────────────────
  describe('POST /conversations/unblock/:blockedUserId', () => {
    it('should unblock a user', async () => {
      const mockResponse = { message: 'User unblocked successfully' };
      mockConversationsService.unblockUser.mockResolvedValue(mockResponse);

      const result = await controller.unblockUser(mockRequest, 'blocked-user-456');

      expect(result).toEqual(mockResponse);
      expect(mockConversationsService.unblockUser).toHaveBeenCalledWith(
        'user-123',
        'blocked-user-456',
      );
    });

    it('should return success message', async () => {
      const mockResponse = { message: 'User unblocked successfully' };
      mockConversationsService.unblockUser.mockResolvedValue(mockResponse);

      const result = await controller.unblockUser(mockRequest, 'blocked-user-456');

      expect(result.message).toContain('unblocked');
    });

    it('should throw error when user is not blocked', async () => {
      mockConversationsService.unblockUser.mockRejectedValue(
        new NotFoundException('User not blocked'),
      );

      await expect(
        controller.unblockUser(mockRequest, 'not-blocked-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
