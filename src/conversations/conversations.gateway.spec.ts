import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';
import { JwtService } from '@nestjs/jwt';

describe('ConversationsGateway', () => {
  let gateway: ConversationsGateway;
  let mockConversationsService: any;
  let mockJwtService: any;

  const mockSocket = {
    handshake: {
      auth: {
        token: 'valid-jwt-token',
      },
      headers: {
        authorization: undefined,
      },
    },
    userId: undefined,
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  };

  const mockServer = {
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  };

  beforeEach(async () => {
    mockConversationsService = {
      getMessages: jest.fn(),
      createMessage: jest.fn(),
      markMessageAsRead: jest.fn(),
      formatMessage: jest.fn(),
    };

    mockJwtService = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsGateway,
        {
          provide: ConversationsService,
          useValue: mockConversationsService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    gateway = module.get<ConversationsGateway>(ConversationsGateway);
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // ───── handleConnection ───────────────────────────────────────
  describe('handleConnection', () => {
    it('should authenticate user with valid token', async () => {
      mockJwtService.verify.mockReturnValue({ userId: 'user-123' });

      const socket = { ...mockSocket } as any;
      await gateway.handleConnection(socket);

      expect(socket.userId).toBe('user-123');
      expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.any(Object));
    });

    it('should use sub field when userId is not present', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-456' });

      const socket = { ...mockSocket } as any;
      await gateway.handleConnection(socket);

      expect(socket.userId).toBe('user-456');
    });

    it('should disconnect socket when no token is provided', async () => {
      const socket = {
        ...mockSocket,
        handshake: {
          auth: {},
          headers: {},
        },
      } as any;

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect socket with invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const socket = { ...mockSocket } as any;
      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should read token from Authorization header as fallback', async () => {
      mockJwtService.verify.mockReturnValue({ userId: 'user-123' });

      const socket = {
        ...mockSocket,
        handshake: {
          auth: {},
          headers: {
            authorization: 'Bearer valid-jwt-token',
          },
        },
      } as any;

      await gateway.handleConnection(socket);

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'valid-jwt-token',
        expect.objectContaining({ secret: expect.any(String) }),
      );
    });
  });

  // ───── handleDisconnect ────────────────────────────────────────
  describe('handleDisconnect', () => {
    it('should emit left event on disconnect', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;

      gateway.handleDisconnect(socket);

      expect(socket.emit).toHaveBeenCalledWith('left', expect.any(Object));
    });

    it('should include userId in disconnect message', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;

      gateway.handleDisconnect(socket);

      expect(socket.emit).toHaveBeenCalledWith('left', {
        userId: 'user-123',
        message: expect.any(String),
      });
    });
  });

  // ───── handleJoinConversation ──────────────────────────────────
  describe('conversation:join', () => {
    it('should join a conversation room', async () => {
      mockConversationsService.getMessages.mockResolvedValue({
        messages: [],
      });

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleJoinConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.join).toHaveBeenCalledWith('conversation:conv-123');
      expect(socket.emit).toHaveBeenCalledWith('joined', expect.any(Object));
    });

    it('should verify user access to conversation', async () => {
      mockConversationsService.getMessages.mockResolvedValue({
        messages: [],
      });

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleJoinConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(mockConversationsService.getMessages).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        1,
        1,
      );
    });

    it('should emit error when user is unauthorized', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;

      await gateway.handleJoinConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should emit error when user cannot access conversation', async () => {
      mockConversationsService.getMessages.mockRejectedValue(
        new Error('Not part of this conversation'),
      );

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleJoinConversation(socket, {
        conversationId: 'conv-999',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.any(String),
      });
    });
  });

  // ───── handleSendMessage ───────────────────────────────────────
  describe('message:send', () => {
    it('should send a TEXT message', async () => {
      const mockMessage = {
        id: 'msg-123',
        type: 'TEXT',
        content: 'Hello',
      };
      mockConversationsService.createMessage.mockResolvedValue(mockMessage);
      mockConversationsService.formatMessage.mockResolvedValue({
        ...mockMessage,
        sender: { id: 'user-123' },
      });

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TEXT',
        content: 'Hello',
      });

      expect(mockConversationsService.createMessage).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        'TEXT',
        'Hello',
        undefined,
        undefined,
        undefined,
      );
      expect(mockServer.to).toHaveBeenCalledWith('conversation:conv-123');
    });

    it('should send a TRACK_LIKE message', async () => {
      const mockMessage = {
        id: 'msg-123',
        type: 'TRACK_LIKE',
        trackId: 'track-123',
      };
      mockConversationsService.createMessage.mockResolvedValue(mockMessage);
      mockConversationsService.formatMessage.mockResolvedValue({
        ...mockMessage,
      });

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TRACK_LIKE',
        trackId: 'track-123',
      });

      expect(mockConversationsService.createMessage).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        'TRACK_LIKE',
        undefined,
        'track-123',
        undefined,
        undefined,
      );
    });

    it('should validate TEXT message has content', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TEXT',
        content: undefined,
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Text messages must have content'),
      });
    });

    it('should validate TRACK_LIKE has trackId', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TRACK_LIKE',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('trackId'),
      });
    });

    it('should validate PLAYLIST has collectionId', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'PLAYLIST',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('collectionId'),
      });
    });

    it('should validate ALBUM has collectionId', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'ALBUM',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('collectionId'),
      });
    });

    it('should validate USER share has userId', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'USER',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('userId'),
      });
    });

    it('should emit message:sent on success', async () => {
      const mockMessage = {
        id: 'msg-123',
        type: 'TEXT',
      };
      mockConversationsService.createMessage.mockResolvedValue(mockMessage);
      mockConversationsService.formatMessage.mockResolvedValue(mockMessage);

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TEXT',
        content: 'Hello',
      });

      expect(socket.emit).toHaveBeenCalledWith('message:sent', {
        messageId: 'msg-123',
      });
    });

    it('should emit error when user is unauthorized', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;

      await gateway.handleSendMessage(socket, {
        conversationId: 'conv-123',
        type: 'TEXT',
        content: 'Hello',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized',
      });
    });
  });

  // ───── handleMarkMessageRead ───────────────────────────────────
  describe('message:markRead', () => {
    it('should mark message as read', async () => {
      mockConversationsService.markMessageAsRead.mockResolvedValue({});

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleMarkMessageRead(socket, {
        messageId: 'msg-123',
        conversationId: 'conv-123',
      });

      expect(mockConversationsService.markMessageAsRead).toHaveBeenCalledWith(
        'user-123',
        'msg-123',
        'conv-123',
      );
    });

    it('should broadcast read status to room', async () => {
      mockConversationsService.markMessageAsRead.mockResolvedValue({});

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleMarkMessageRead(socket, {
        messageId: 'msg-123',
        conversationId: 'conv-123',
      });

      expect(mockServer.to).toHaveBeenCalledWith('conversation:conv-123');
    });

    it('should emit read:success on success', async () => {
      mockConversationsService.markMessageAsRead.mockResolvedValue({});

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleMarkMessageRead(socket, {
        messageId: 'msg-123',
        conversationId: 'conv-123',
      });

      expect(socket.emit).toHaveBeenCalledWith('read:success', {
        messageId: 'msg-123',
      });
    });

    it('should emit error when unauthorized', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;

      await gateway.handleMarkMessageRead(socket, {
        messageId: 'msg-123',
        conversationId: 'conv-123',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should emit error on service failure', async () => {
      mockConversationsService.markMessageAsRead.mockRejectedValue(
        new Error('Message not found'),
      );

      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleMarkMessageRead(socket, {
        messageId: 'msg-999',
        conversationId: 'conv-123',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.any(String),
      });
    });
  });

  // ───── handleTypingStart ───────────────────────────────────────
  describe('typing:start', () => {
    it('should broadcast typing indicator to room', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleTypingStart(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.to).toHaveBeenCalledWith('conversation:conv-123');
    });

    it('should not broadcast when user is not authenticated', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;
      await gateway.handleTypingStart(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('should emit typing:active event', async () => {
      const socket = {
        ...mockSocket,
        userId: 'user-123',
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      } as any;

      await gateway.handleTypingStart(socket, {
        conversationId: 'conv-123',
      });

      const emitFn = socket.to().emit;
      expect(emitFn).toHaveBeenCalledWith(
        'typing:active',
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
        }),
      );
    });
  });

  // ───── handleTypingStop ────────────────────────────────────────
  describe('typing:stop', () => {
    it('should broadcast typing stop to room', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleTypingStop(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.to).toHaveBeenCalledWith('conversation:conv-123');
    });

    it('should emit typing:inactive event', async () => {
      const socket = {
        ...mockSocket,
        userId: 'user-123',
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      } as any;

      await gateway.handleTypingStop(socket, {
        conversationId: 'conv-123',
      });

      const emitFn = socket.to().emit;
      expect(emitFn).toHaveBeenCalledWith(
        'typing:inactive',
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
        }),
      );
    });

    it('should not broadcast when user is not authenticated', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;
      await gateway.handleTypingStop(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  // ───── handleLeaveConversation ─────────────────────────────────
  describe('conversation:leave', () => {
    it('should leave conversation room', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleLeaveConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.leave).toHaveBeenCalledWith('conversation:conv-123');
    });

    it('should emit left event', async () => {
      const socket = { ...mockSocket, userId: 'user-123' } as any;
      await gateway.handleLeaveConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.emit).toHaveBeenCalledWith('left', {
        conversationId: 'conv-123',
      });
    });

    it('should not perform action when user is not authenticated', async () => {
      const socket = { ...mockSocket, userId: undefined } as any;
      await gateway.handleLeaveConversation(socket, {
        conversationId: 'conv-123',
      });

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });
});
