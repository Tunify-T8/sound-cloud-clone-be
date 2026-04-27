import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';

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

  constructor(private readonly prisma: PrismaService) {}

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

  async sendNotificationToUser(userId: string, notification: any) {
    const sockets = this.connectedUsers.get(userId);
    if (sockets && sockets.size > 0) {
      // User has at least one active Socket.IO connection — deliver in-app
      sockets.forEach((socket) => socket.emit('notification', notification));
    } else {
      // User is fully offline — fall back to FCM push
      await this.sendPushNotification(userId, notification);
    }
  }

  private async sendPushNotification(userId: string, notification: any) {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (!tokens.length) return;

    const messages = tokens.map(({ token }) => ({
      token,
      notification: {
        title: 'Tunify',
        body: notification.message,
      },
      data: {
        type: notification.type,
        referenceType: notification.referenceType ?? '',
        referenceId: notification.referenceId ?? '',
      },
    }));

    const response = await admin.messaging().sendEach(messages);

    // Delete stale tokens FCM says are invalid
    response.responses.forEach((res, i) => {
      if (!res.success && this.isInvalidTokenError(res.error?.code)) {
        this.prisma.deviceToken.delete({ where: { token: tokens[i].token } });
      }
    });
  }

  private isInvalidTokenError(code?: string): boolean {
    return [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ].includes(code ?? '');
  }
}
