import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let mockPrismaService: any;

  const mockConversation = {
    id: 'conv-123',
    user1Id: 'user-123',
    user2Id: 'other-user-456',
    isDeleted: false,
    deletedAt: null,
    status: 'ACTIVE',
    isRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage = {
    id: 'msg-123',
    conversationId: 'conv-123',
    senderId: 'user-123',
    type: 'TEXT',
    content: 'Hello there!',
    trackId: null,
    collectionId: null,
    userId: null,
    read: false,
    createdAt: new Date(),
    track: null,
    collection: null,
    sharedUser: null,
    sender: { id: 'user-123', username: 'testuser', avatarUrl: null },
  };

  const mockTrackMessage = {
    ...mockMessage,
    id: 'msg-track-123',
    type: 'TRACK_LIKE',
    trackId: 'track-123',
    track: {
      id: 'track-123',
      title: 'Test Track',
      coverUrl: 'https://example.com/cover.jpg',
      durationSeconds: 180,
      userId: 'artist-user-123',
    },
  };

  const mockUserShare = {
    id: 'shared-user-456',
    username: 'shareduser',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  beforeEach(async () => {
    mockPrismaService = {
      conversation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      message: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      follow: {
        deleteMany: jest.fn(),
      },
      userBlock: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───── deleteConversation ─────────────────────────────────────
  describe('deleteConversation', () => {
    it('should delete a conversation when user is part of it', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.conversation.update.mockResolvedValue({
        ...mockConversation,
        isDeleted: true,
        deletedAt: expect.any(Date),
      });

      const result = await service.deleteConversation('user-123', 'conv-123');

      expect(result.message).toContain('deleted for user user-123');
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(service.deleteConversation('user-123', 'conv-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.deleteConversation('unauthorized-user', 'conv-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should work when user2 deletes the conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.conversation.update.mockResolvedValue({
        ...mockConversation,
        isDeleted: true,
      });

      const result = await service.deleteConversation('other-user-456', 'conv-123');

      expect(result.message).toContain('deleted for user other-user-456');
    });
  });

  // ───── getMessages ────────────────────────────────────────────
  describe('getMessages', () => {
    it('should return paginated messages with correct format', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.findMany.mockResolvedValue([mockMessage]);
      mockPrismaService.message.count.mockResolvedValue(1);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.getMessages('user-123', 'conv-123', 1, 20);

      expect(result.conversationId).toBe('conv-123');
      expect(result.messages).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(service.getMessages('user-123', 'conv-999', 1, 20)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.getMessages('unauthorized-user', 'conv-123', 1, 20)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user is blocked', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([
        { blockerId: 'other-user-456' },
      ]);

      await expect(service.getMessages('user-123', 'conv-123', 1, 20)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should validate and adjust pagination parameters', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.findMany.mockResolvedValue([]);
      mockPrismaService.message.count.mockResolvedValue(0);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.getMessages('user-123', 'conv-123', 0, 150);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 100, // Limited to 100
        }),
      );
    });

    it('should calculate pagination correctly for page 2', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.findMany.mockResolvedValue(Array(20).fill(mockMessage));
      mockPrismaService.message.count.mockResolvedValue(50);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.getMessages('user-123', 'conv-123', 2, 20);

      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.totalPages).toBe(3);
    });

    it('should batch-load artists for track messages', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.findMany.mockResolvedValue([mockTrackMessage]);
      mockPrismaService.message.count.mockResolvedValue(1);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'artist-user-123', username: 'artistname' },
      ]);

      const result = await service.getMessages('user-123', 'conv-123', 1, 20);

      expect(result.messages[0].attachment.preview.artistName).toBe('artistname');
    });
  });

  // ───── markAs (read/unread) ────────────────────────────────────
  describe('markAs', () => {
    it('should mark conversation as read', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.conversation.update.mockResolvedValue({
        ...mockConversation,
        isRead: true,
      });

      const result = await service.markAs('user-123', 'conv-123', true);

      expect(result.message).toContain('marked as read');
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: { isRead: true },
      });
    });

    it('should mark conversation as unread', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.conversation.update.mockResolvedValue({
        ...mockConversation,
        isRead: false,
      });

      const result = await service.markAs('user-123', 'conv-123', false);

      expect(result.message).toContain('marked as unread');
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: { isRead: false },
      });
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(service.markAs('user-123', 'conv-999', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.markAs('unauthorized-user', 'conv-123', true)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───── archiveConversation ─────────────────────────────────────
  describe('archiveConversation', () => {
    it('should archive a conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.conversation.update.mockResolvedValue({
        ...mockConversation,
        status: 'ARCHIVED',
      });

      const result = await service.archiveConversation('user-123', 'conv-123');

      expect(result.message).toContain('archived');
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(service.archiveConversation('user-123', 'conv-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.archiveConversation('unauthorized-user', 'conv-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ───── blockUser ───────────────────────────────────────────────
  describe('blockUser', () => {
    it('should block a user and remove follows in transaction', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          conversation: { update: jest.fn() },
          follow: { deleteMany: jest.fn() },
          userBlock: {
            create: jest.fn().mockResolvedValue({
              id: 'block-123',
              blockerId: 'user-123',
              blockedId: 'other-user-456',
            }),
          },
        });
      });

      const result = await service.blockUser('user-123', 'conv-123', true, false);

      expect(result.message).toBe('User blocked successfully');
      expect(result.blockedUserId).toBe('other-user-456');
      expect(result.blockId).toBe('block-123');
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(service.blockUser('user-123', 'conv-999', true, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.blockUser('unauthorized-user', 'conv-123', true, false)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should identify correct blocked user when user2 initiates block', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          conversation: { update: jest.fn() },
          follow: { deleteMany: jest.fn() },
          userBlock: {
            create: jest.fn().mockResolvedValue({ id: 'block-456' }),
          },
        });
      });

      const result = await service.blockUser('other-user-456', 'conv-123', false, true);

      expect(result.blockedUserId).toBe('user-123');
    });
  });

  // ───── unblockUser ─────────────────────────────────────────────
  describe('unblockUser', () => {
    it('should unblock a user', async () => {
      mockPrismaService.userBlock.findUnique.mockResolvedValue({
        id: 'block-123',
        blockerId: 'user-123',
        blockedId: 'other-user-456',
      });
      mockPrismaService.userBlock.delete.mockResolvedValue({
        id: 'block-123',
      });

      const result = await service.unblockUser('user-123', 'other-user-456');

      expect(result.message).toBe('User unblocked successfully');
      expect(mockPrismaService.userBlock.delete).toHaveBeenCalledWith({
        where: { id: 'block-123' },
      });
    });

    it('should throw NotFoundException when user is not blocked', async () => {
      mockPrismaService.userBlock.findUnique.mockResolvedValue(null);

      await expect(service.unblockUser('user-123', 'not-blocked-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───── createMessage ───────────────────────────────────────────
  describe('createMessage', () => {
    it('should create a TEXT message', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.create.mockResolvedValue(mockMessage);
      mockPrismaService.conversation.update.mockResolvedValue(mockConversation);

      const result = await service.createMessage(
        'user-123',
        'conv-123',
        'TEXT',
        'Hello there!',
      );

      expect(result.type).toBe('TEXT');
      expect(result.content).toBe('Hello there!');
      expect(mockPrismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TEXT',
            content: 'Hello there!',
            trackId: null,
          }),
        }),
      );
    });

    it('should create a TRACK_LIKE message', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.create.mockResolvedValue(mockTrackMessage);
      mockPrismaService.conversation.update.mockResolvedValue(mockConversation);

      const result = await service.createMessage(
        'user-123',
        'conv-123',
        'TRACK_LIKE',
        undefined,
        'track-123',
      );

      expect(result.type).toBe('TRACK_LIKE');
      expect(result.trackId).toBe('track-123');
    });

    it('should create a USER share message', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([]);
      mockPrismaService.message.create.mockResolvedValue({
        ...mockMessage,
        type: 'USER',
        userId: 'shared-user-456',
      });
      mockPrismaService.conversation.update.mockResolvedValue(mockConversation);

      const result = await service.createMessage(
        'user-123',
        'conv-123',
        'USER',
        undefined,
        undefined,
        undefined,
        'shared-user-456',
      );

      expect(result.type).toBe('USER');
      expect(result.userId).toBe('shared-user-456');
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.createMessage('user-123', 'conv-999', 'TEXT', 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(
        service.createMessage('unauthorized-user', 'conv-123', 'TEXT', 'Hello'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is blocked', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrismaService.userBlock.findMany.mockResolvedValue([
        { blockerId: 'other-user-456' },
      ]);

      await expect(
        service.createMessage('user-123', 'conv-123', 'TEXT', 'Hello'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───── getMessageById ──────────────────────────────────────────
  describe('getMessageById', () => {
    it('should return message by id', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue(mockMessage);

      const result = await service.getMessageById('msg-123');

      expect(result.id).toBe('msg-123');
      expect(result.type).toBe('TEXT');
    });

    it('should throw NotFoundException when message not found', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue(null);

      await expect(service.getMessageById('msg-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify user access when userId is provided', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        ...mockMessage,
        conversation: mockConversation,
      });

      const result = await service.getMessageById('msg-123', 'user-123');

      expect(result.id).toBe('msg-123');
    });

    it('should throw ForbiddenException when user cannot access message', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        ...mockMessage,
        conversation: mockConversation,
      });

      await expect(
        service.getMessageById('msg-123', 'unauthorized-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───── markMessageAsRead ───────────────────────────────────────
  describe('markMessageAsRead', () => {
    it('should mark message as read', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        ...mockMessage,
        conversation: mockConversation,
        senderId: 'other-user-456',
      });
      mockPrismaService.message.update.mockResolvedValue({
        ...mockMessage,
        read: true,
      });

      const result = await service.markMessageAsRead(
        'user-123',
        'msg-123',
        'conv-123',
      );

      expect(result.read).toBe(true);
      expect(mockPrismaService.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-123' },
        data: { read: true },
      });
    });

    it('should throw NotFoundException when message not found', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue(null);

      await expect(
        service.markMessageAsRead('user-123', 'msg-999', 'conv-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is the sender', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        ...mockMessage,
        conversation: mockConversation,
        senderId: 'user-123',
      });

      await expect(
        service.markMessageAsRead('user-123', 'msg-123', 'conv-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not part of conversation', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue({
        ...mockMessage,
        conversation: mockConversation,
      });

      await expect(
        service.markMessageAsRead('unauthorized-user', 'msg-123', 'conv-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───── formatMessage ───────────────────────────────────────────
  describe('formatMessage', () => {
    it('should format TEXT message correctly', async () => {
      const result = await service.formatMessage(mockMessage);

      expect(result.id).toBe('msg-123');
      expect(result.type).toBe('TEXT');
      expect(result.text).toBe('Hello there!');
      expect(result.attachment.id).toBeNull();
    });

    it('should format TRACK_LIKE message with artist info', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'artist-user-123',
        username: 'artistname',
      });

      const result = await service.formatMessage(mockTrackMessage);

      expect(result.type).toBe('TRACK_LIKE');
      expect(result.attachment.id).toBe('track-123');
      expect(result.attachment.preview.artistName).toBe('artistname');
    });

    it('should format USER share message', async () => {
      const userMessage = {
        ...mockMessage,
        type: 'USER',
        sharedUser: mockUserShare,
      };

      const result = await service.formatMessage(userMessage);

      expect(result.type).toBe('USER');
      expect(result.attachment.id).toBe('shared-user-456');
      expect(result.attachment.preview.username).toBe('shareduser');
    });

    it('should format PLAYLIST message', async () => {
      const playlistMessage = {
        ...mockMessage,
        type: 'PLAYLIST',
        collection: {
          id: 'playlist-123',
          title: 'My Playlist',
          coverUrl: 'https://example.com/playlist.jpg',
        },
      };

      const result = await service.formatMessage(playlistMessage);

      expect(result.type).toBe('PLAYLIST');
      expect(result.attachment.id).toBe('playlist-123');
      expect(result.attachment.preview.title).toBe('My Playlist');
    });
  });
});
