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

  private connectedUsers = new Map<string, Set<Socket>>();

  async handleConnection(socket: Socket) {
    const token = socket.handshake.query?.token as string;

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const payload = WsJwtGuard.verifyToken(token);
      socket.data.userId = payload.sub;

      if (!this.connectedUsers.has(payload.sub)) {
        this.connectedUsers.set(payload.sub, new Set());
      }
      this.connectedUsers.get(payload.sub)!.add(socket);
    } catch (err: any) {
      console.log('Token verification failed:', err.message);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      const sockets = this.connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) this.connectedUsers.delete(userId);
      }
    }
  }

  sendNotificationToUser(userId: string, notification: any) {
    const sockets = this.connectedUsers.get(userId);
    if (sockets) {
      sockets.forEach((socket) => socket.emit('notification', notification));
    }
  }
}
