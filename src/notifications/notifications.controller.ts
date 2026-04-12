import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Post,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { NotificationType, ReferenceType } from '@prisma/client';

interface AuthRequest extends Request {
  user?: { userId: string };
}

@Controller('notifications')
@UseGuards(JwtAccessGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GET /notifications/unread-count  ← must be before /:notificationId
  @Get('unread-count')
  async getUnreadCount(@Request() req: AuthRequest) {
    return this.notificationsService.getUnreadCount(req.user?.userId ?? '');
  }

  // GET /notifications/preferences   ← must be before /:notificationId
  @Get('preferences')
  async getPreferences(@Request() req: AuthRequest) {
    return this.notificationsService.getPreferences(req.user?.userId ?? '');
  }

  // GET /notifications
  @Get()
  async getNotifications(
    @Request() req: AuthRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('type') type?: string,
    @Query('unread') unread?: string,
  ) {
    // Parse and validate type filter
    let types: NotificationType[] | undefined;
    if (type) {
      const requested = type.split(',').map((t) => t.trim());
      const validTypes = Object.values(NotificationType);
      const invalid = requested.find(
        (t) => !validTypes.includes(t as NotificationType),
      );
      if (invalid) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_NOTIFICATION_TYPE',
            message: 'Invalid type value passed as filter',
            statusCode: 400,
          },
        });
      }
      types = requested as NotificationType[];
    }

    return this.notificationsService.getNotifications(
      req.user?.userId ?? '',
      Math.max(1, parseInt(page)),
      Math.min(50, Math.max(1, parseInt(limit))),
      types,
      unread === 'true',
    );
  }

  // PATCH /notifications/read-all    ← must be before /:notificationId
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req: AuthRequest) {
    return this.notificationsService.markAllAsRead(req.user?.userId ?? '');
  }

  // PATCH /notifications/preferences ← must be before /:notificationId
  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @Request() req: AuthRequest,
    @Body()
    body: { push?: Record<string, boolean>; email?: Record<string, boolean> },
  ) {
    const result = await this.notificationsService.updatePreferences(
      req.user?.userId ?? '',
      body.push,
      body.email,
    );

    if (result.invalidKey) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_PREFERENCE_KEY',
          message: 'Unknown notification preference field',
          statusCode: 400,
        },
      });
    }

    return { message: 'Preferences updated successfully' };
  }

  // PATCH /notifications/:notificationId  ← must be LAST
  @Patch(':notificationId')
  @HttpCode(HttpStatus.OK)
  async markOneAsRead(
    @Request() req: AuthRequest,
    @Param('notificationId') notificationId: string,
  ) {
    const result = await this.notificationsService.markOneAsRead(
      req.user?.userId ?? '',
      notificationId,
    );

    if (result.notFound) {
      throw new NotFoundException({
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
          statusCode: 404,
        },
      });
    }

    if (result.forbidden) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this notification',
          statusCode: 403,
        },
      });
    }

    return { message: 'Notification marked as read' };
  }
}
