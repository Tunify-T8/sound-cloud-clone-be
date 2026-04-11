import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { NotificationsService } from './notifications.service';
import { forwardRef, Inject } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private connectedUsers = new Map<string, Socket>();

  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.query?.token as string;

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const payload = WsJwtGuard.verifyToken(token);
      this.connectedUsers.set(payload.sub, socket);
      socket.data.userId = payload.sub;
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
    }
  }

  sendNotificationToUser(userId: string, notification: any) {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit('notification', notification);
    }
  }
}