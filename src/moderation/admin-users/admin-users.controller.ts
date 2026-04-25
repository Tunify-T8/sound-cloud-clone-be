import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AdminOnly } from 'src/auth/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import * as usersDecorator from 'src/users/users.decorator';
import { SuspendUserDto } from '../dto/suspended-user.dto';

@UseGuards(JwtAccessGuard, RolesGuard)
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get(':userId/moderation/')
  getUserModerationOverview(@Param('userId') userId: string) {
    return this.adminUsersService.getUserModerationOverview(userId);
  }

  @Post('/:userId/suspend')
  suspendUser(
    @Param('userId') userId: string,
    @Body() dto: SuspendUserDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminUsersService.suspendUser(userId, user.userId, dto);
  }

  @Post('/:userId/unsuspend')
  unsuspendUser(@Param('userId') userId: string) {
    return this.adminUsersService.unsuspendUser(userId);
  }
}
