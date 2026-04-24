import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminAction, ReportStatus, Prisma } from '@prisma/client';
import { QueryReportsDto } from '../dto/query-reports.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';

const reportSummarySelect = {
  id: true,
  targetType: true,
  targetId: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  adminAction: true,
  reason: { select: { id: true, label: true } },
  reporter: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.ReportSelect;

const reportDetailSelect = {
  ...reportSummarySelect,
  description: true,
  violationAreas: true,
  adminNote: true,
  reviewedByUser: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.ReportSelect;

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(dto: QueryReportsDto) {
    const { status, entityType, reasonId, page = 1, limit = 20 } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {
      ...(status && { status }),
      ...(entityType && { targetType: entityType }),
      ...(reasonId && { reasonId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: reportSummarySelect,
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        totalCount: total,
        hasMore: skip + data.length < total,
      },
    };
  }

  async getReportById(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: reportDetailSelect,
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  async resolveReport(
    reportId: string,
    adminId: string,
    dto: ResolveReportDto,
  ) {
    const { status, adminNote, actionTaken } = dto;

    if (status === ReportStatus.PENDING) {
      throw new BadRequestException('Status must be RESOLVED or REJECTED');
    }

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status,
          adminNote,
          adminAction: actionTaken ?? AdminAction.NONE,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      if (!actionTaken || actionTaken === AdminAction.NONE) return;

      if (report.targetType === 'TRACK') {
        await this.applyTrackAction(tx, report.targetId, actionTaken, adminId);
      } else if (report.targetType === 'COMMENT') {
        await this.applyCommentAction(
          tx,
          report.targetId,
          actionTaken,
          adminId,
        );
      } else if (report.targetType === 'USER') {
        await this.applyUserAction(tx, report.targetId, actionTaken, adminId);
      }
    });

    return { message: 'Report updated' };
  }

  // ── Side-effect helpers ──────────────────────────────────────────

  private async applyTrackAction(
    tx: Prisma.TransactionClient,
    trackId: string,
    action: AdminAction,
    adminId: string,
  ): Promise<void> {
    if (action === AdminAction.HIDE) {
      await tx.track.update({
        where: { id: trackId },
        data: { isHidden: true, hiddenAt: new Date(), hiddenBy: adminId },
      });
    } else if (action === AdminAction.REMOVE) {
      await tx.track.update({
        where: { id: trackId },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
      });
    }
  }

  private async applyCommentAction(
    tx: Prisma.TransactionClient,
    commentId: string,
    action: AdminAction,
    adminId: string,
  ): Promise<void> {
    if (action === AdminAction.HIDE) {
      await tx.comment.update({
        where: { id: commentId },
        data: { isHidden: true, hiddenAt: new Date(), hiddenBy: adminId },
      });
    } else if (action === AdminAction.REMOVE) {
      await tx.comment.update({
        where: { id: commentId },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
      });
    }
  }

  private async applyUserAction(
    tx: Prisma.TransactionClient,
    userId: string,
    action: AdminAction,
    adminId: string,
  ): Promise<void> {
    if (action === AdminAction.SUSPEND_USER) {
      await tx.user.update({
        where: { id: userId },
        data: {
          isSuspended: true,
          suspendedById: adminId,
        },
      });
    }
  }
}
