import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtService } from '@nestjs/jwt';

interface AuthSocket extends Socket {
  userId?: string;
}

type MessageType = 'TEXT' | 'TRACK_LIKE' | 'TRACK_UPLOAD' | 'PLAYLIST' | 'ALBUM' | 'USER';

interface MessagePayload {
  conversationId: string;
  content?: string;
  type?: MessageType;
  trackId?: string;
  collectionId?: string;
  userId?: string;
}

@WebSocketGateway({ 
    port: 3001,
    cors: { origin: '*' },
    namespace: 'conversations',
})
@Injectable()
export class ConversationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly conversationsService: ConversationsService,
  ) {}

  /**
   * Authenticate socket connection via JWT token
   * Token should be sent in: handshake.auth.token
   */
  async handleConnection(socket: AuthSocket) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        console.log('[WebSocket] No token provided, disconnecting');
        socket.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'your-secret-key',
      });

      socket.userId = decoded.userId || decoded.sub;
      console.log('[WebSocket] User authenticated:', socket.userId);
      socket.emit('authenticated', { message: 'Connected to messaging' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[WebSocket] Authentication failed:', errorMessage);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: AuthSocket) {
    // User disconnected - can track presence here
    console.log('[WebSocket] User disconnected:', socket.userId);
    socket.emit('left', { userId: socket.userId, message: 'Left conversation' });
  }

  /**
   * Join a conversation room
   * Room name: conversation:{conversationId}
   */
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) {
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }

    const { conversationId } = data;

    try {
      // Verify user can access conversation through service
      await this.conversationsService.getMessages(socket.userId, conversationId, 1, 1);

      // Join room
      const roomName = `conversation:${conversationId}`;
      socket.join(roomName);
      socket.emit('joined', { conversationId, message: 'Joined conversation' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to join conversation';
      socket.emit('error', { message: errorMessage });
    }
  }

  /**
   * Send message in conversation
   * Types: TEXT, TRACK_LIKE, TRACK_UPLOAD, PLAYLIST, ALBUM, USER
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: MessagePayload,
  ) {
    if (!socket.userId) {
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }

    const { conversationId, content, type = 'TEXT', trackId, collectionId, userId } = payload;

    try {
      // Validate message content based on type
      if (type === 'TEXT' && !content) {
        throw new BadRequestException('Text messages must have content');
      }

      if (type === 'TRACK_LIKE' && !trackId) {
        throw new BadRequestException('Track like message must include trackId');
      }

      if ((type === 'PLAYLIST' || type === 'ALBUM' || type === 'TRACK_UPLOAD') && !collectionId) {
        throw new BadRequestException('Collection message must include collectionId');
      }

      if (type === 'USER' && !userId) {
        throw new BadRequestException('User share message must include userId');
      }

      // Delegate to service - handles conversation validation, blocking checks, and creation
      const message = await this.conversationsService.createMessage(
        socket.userId,
        conversationId,
        type as any,
        content,
        trackId,
        collectionId,
        userId,
      );

      // Format message for broadcast
      const formattedMessage = await this.formatMessage(message);

      // Broadcast to conversation room
      const roomName = `conversation:${conversationId}`;
      this.server.to(roomName).emit('message:received', {
        conversationId,
        message: formattedMessage,
      });

      socket.emit('message:sent', { messageId: message.id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      socket.emit('error', { 
        message: errorMessage,
      });
    }
  }

  /**
   * Mark message as read
   */
  @SubscribeMessage('message:markRead')
  async handleMarkMessageRead(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    if (!socket.userId) {
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }

    const { messageId, conversationId } = data;

    try {
      // Delegate to service
      await this.conversationsService.markMessageAsRead(socket.userId, messageId, conversationId);

      // Broadcast read status
      const roomName = `conversation:${conversationId}`;
      this.server.to(roomName).emit('message:read', {
        conversationId,
        messageId,
      });

      socket.emit('read:success', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to mark message as read';
      socket.emit('error', { message: errorMessage });
    }
  }

  /**
   * Typing indicator
   */
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) return;

    const { conversationId } = data;
    const roomName = `conversation:${conversationId}`;

    // Broadcast typing indicator to other participants
    socket.to(roomName).emit('typing:active', {
      conversationId,
      userId: socket.userId,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) return;

    const { conversationId } = data;
    const roomName = `conversation:${conversationId}`;

    socket.to(roomName).emit('typing:inactive', {
      conversationId,
      userId: socket.userId,
    });
  }

  /**
   * Leave conversation room
   */
  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!socket.userId) return;

    const { conversationId } = data;
    const roomName = `conversation:${conversationId}`;
    socket.leave(roomName);
    socket.emit('left', { conversationId });
  }

  /**
   * Format message for broadcast with nested data and artist lookups
   */
  private async formatMessage(message: any) {
    return this.conversationsService.formatMessage(message);
  }
}
