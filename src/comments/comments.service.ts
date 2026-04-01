import { Injectable, NotFoundException } from '@nestjs/common';
import { repl } from '@nestjs/core';
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
            data: { 
                isDeleted: true, 
                deletedAt: new Date(),
                deletedBy: userId,
            },
        });

        return { 
            message: 'Comment deleted successfully',
            commentCount: track._count.comments - 1, // Decrement the comment count by 1
        };
        
    }

    async addReply(commentId: string, userId: string, text: string) {
        const parentComment = await this.prisma.comment.findUnique({
            where: { id: commentId, isDeleted: false },
        });

        if (!parentComment) {
            throw new NotFoundException('Parent comment not found');
        }

        const reply = await this.prisma.comment.create({
            data: {
                userId: userId,
                trackId: parentComment.trackId,
                parentCommentId: commentId,
                content: text,
            },
        });


        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return{ 
            replyId: reply.id,
            commentId: commentId,
            userId: userId,
            username: user.username,
            avatarUrl: user.avatarUrl,
            text: text,
            likesCount: 0,
            createdAt: reply.createdAt,
        }
    }

}
