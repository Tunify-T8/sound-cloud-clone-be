import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';

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
    } catch (err: any) {
      console.log('Token verification failed:', err.message);
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