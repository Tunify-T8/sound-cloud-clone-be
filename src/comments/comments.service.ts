import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

    async deleteComment(userId: string, commentId: string) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId, isDeleted: false },
        });

        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        
        const track = await this.prisma.track.findUnique({
            where: { id: comment.trackId, isDeleted: false },
            include: {
                _count: {
                    select: { comments: true },
                },
            },
        });

        if (!track) {
            throw new NotFoundException('Track not found');
        }

        if (comment.userId !== userId) {
            throw new NotFoundException('You can only delete your own comments');
        }

        await this.prisma.comment.update({
            where: { id: commentId },
            data: { isDeleted: true },
        });

        return { 
            message: 'Comment deleted successfully',
            commentCount: track._count.comments - 1, // Decrement the comment count by 1
        };
        
    }
}
