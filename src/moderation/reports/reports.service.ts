import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ReportReasonDto } from '../dto/report-reason.dto';
import { Prisma, ReportedEntityType } from '@prisma/client';
import { SubmitReportDto } from '../dto/submit-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReportReasons(): Promise<ReportReasonDto[]> {
    return await this.prisma.reportReason.findMany({
      select: {
        id: true,
        label: true,
      },
    });
  }
  async submitReport(reporterId: string, dto: SubmitReportDto) {
    const {
      reportedEntityType,
      reportedEntityId,
      reasonId,
      detailsText,
      violationAreas,
    } = dto;

    // Reject reporting own content
    if (reportedEntityType !== ReportedEntityType.USER) {
      await this.assertNotOwnContent(
        reporterId,
        reportedEntityType,
        reportedEntityId,
      );
    } else {
      if (reportedEntityId === reporterId) {
        throw new BadRequestException('You cannot report yourself');
      }
    }

    // Validate reasonId exists
    const reason = await this.prisma.reportReason.findUnique({
      where: { id: reasonId },
    });
    if (!reason) {
      throw new BadRequestException('The provided reason ID does not exist');
    }

    // Validate target entity exists
    await this.assertEntityExists(reportedEntityType, reportedEntityId);

    try {
      await this.prisma.report.create({
        data: {
          reporterId,
          targetType: reportedEntityType,
          targetId: reportedEntityId,
          reasonId,
          description: detailsText,
          violationAreas: violationAreas ?? [],
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('You have already reported this content');
      }
      throw e;
    }

    return { message: 'Report submitted' };
  }

  async submitSpamReport(reporterId: string, commentId: string) {
    // Validate comment exists
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Reject reporting own comment
    if (comment.userId === reporterId) {
      throw new BadRequestException('You cannot report your own comment');
    }

    try {
      await this.prisma.report.create({
        data: {
          reporterId,
          targetType: ReportedEntityType.COMMENT,
          targetId: commentId,
          reasonId: 'spam',
          violationAreas: [],
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('You have already reported this content');
      }
      throw e;
    }

    return { message: 'Report submitted' };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async assertNotOwnContent(
    reporterId: string,
    entityType: ReportedEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === ReportedEntityType.TRACK) {
      const track = await this.prisma.track.findUnique({
        where: { id: entityId },
      });
      if (!track) throw new NotFoundException('Track not found');
      if (track.userId === reporterId) {
        throw new BadRequestException('You cannot report your own track');
      }
    } else if (entityType === ReportedEntityType.COMMENT) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: entityId },
      });
      if (!comment) throw new NotFoundException('Comment not found');
      if (comment.userId === reporterId) {
        throw new BadRequestException('You cannot report your own comment');
      }
    } else if (entityType === ReportedEntityType.COLLECTION) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: entityId },
      });
      if (!collection) throw new NotFoundException('Collection not found');
      if (collection.userId === reporterId) {
        throw new BadRequestException('You cannot report your own collection');
      }
    }
  }

  private async assertEntityExists(
    entityType: ReportedEntityType,
    entityId: string,
  ): Promise<void> {
    // Already checked in assertNotOwnContent for non-USER types
    // Only need to check here for USER type
    if (entityType === ReportedEntityType.USER) {
      const user = await this.prisma.user.findUnique({
        where: { id: entityId },
      });
      if (!user) throw new NotFoundException('User not found');
    }
  }
}
