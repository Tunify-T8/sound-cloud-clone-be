import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tracks ───────────────────────────────────────────────────────

  async hideTrack(trackId: string, adminId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track || track.isDeleted)
      throw new NotFoundException('Track not found');

    await this.prisma.track.update({
      where: { id: trackId },
      data: { isHidden: true, hiddenAt: new Date(), hiddenBy: adminId },
    });

    return { message: 'Track hidden' };
  }

  async unhideTrack(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track || track.isDeleted)
      throw new NotFoundException('Track not found');

    await this.prisma.track.update({
      where: { id: trackId },
      data: { isHidden: false, hiddenAt: null, hiddenBy: null },
    });

    return { message: 'Track unhidden' };
  }

  async deleteTrack(trackId: string, adminId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track || track.isDeleted)
      throw new NotFoundException('Track not found');

    await this.prisma.track.update({
      where: { id: trackId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
    });

    return { message: 'Track removed' };
  }

  // ── Comments ─────────────────────────────────────────────────────

  async hideComment(commentId: string, adminId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted)
      throw new NotFoundException('Comment not found');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isHidden: true, hiddenAt: new Date(), hiddenBy: adminId },
    });

    return { message: 'Comment hidden' };
  }

  async unhideComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted)
      throw new NotFoundException('Comment not found');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isHidden: false, hiddenAt: null, hiddenBy: null },
    });

    return { message: 'Comment unhidden' };
  }

  async deleteComment(commentId: string, adminId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted)
      throw new NotFoundException('Comment not found');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
    });

    return { message: 'Comment removed' };
  }
}
