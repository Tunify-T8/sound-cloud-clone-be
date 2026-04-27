import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SuspendUserDto } from '../dto/suspended-user.dto';
import { SearchIndexService } from 'src/search-index/search-index.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async suspendUser(
    targetUserId: string,
    adminId: string,
    dto: SuspendUserDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('User not found');
    if (user.isSuspended)
      throw new BadRequestException('User is already suspended');

    const suspendedUntil = dto.durationHours
      ? new Date(Date.now() + dto.durationHours * 60 * 60 * 1000)
      : null;

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isSuspended: true,
        suspendedById: adminId,
        suspendedUntil,
        suspensionReason: dto.reason,
      },
    });
    await this.searchIndexService.indexUser(user.id);

    return { message: 'User suspended' };
  }

  async unsuspendUser(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('User not found');
    if (!user.isSuspended)
      throw new BadRequestException('User is not suspended');

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isSuspended: false,
        suspendedById: null,
        suspendedUntil: null,
        suspensionReason: null,
      },
    });
    await this.searchIndexService.indexUser(user.id);

    return { message: 'User unsuspended' };
  }

  async getUserModerationOverview(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        email: true,
        role: true,
        isVerified: true,
        isActive: true,
        isSuspended: true,
        suspendedUntil: true,
        suspensionReason: true,
        isBanned: true,
        isDeleted: true,
        createdAt: true,
        suspendedBy: {
          select: { id: true, username: true, displayName: true },
        },
        bannedBy: {
          select: { id: true, username: true, displayName: true },
        },
        _count: {
          select: {
            submittedReports: true, // reports this user has filed
            tracks: true,
            comments: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // reports filed AGAINST this user
    const reportsAgainstCount = await this.prisma.report.count({
      where: { targetId: targetUserId },
    });

    return { ...user, reportsAgainstCount };
  }
}
