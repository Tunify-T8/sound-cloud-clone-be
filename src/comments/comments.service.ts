import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

        const parentUsername = await this.prisma.user.findUnique({
            where: { id: parentComment.userId },
            select: { username: true },
        });

        return{ 
            replyId: reply.id,
            commentId: commentId,  //to be changed to parentID
            parentUsername: parentUsername?.username || 'Unknown',
            user: {
                userId: userId,
                username: user.username,
                avatarUrl: user.avatarUrl,
            },
            text: text,
            likesCount: 0,
            createdAt: reply.createdAt,
        }
    }

    async getReplies(commentId: string, userId: string, page: number = 1, limit: number = 20) {
        const parentComment = await this.prisma.comment.findUnique({
            where: { id: commentId, isDeleted: false },
        });

        if (!parentComment) {
            throw new NotFoundException('Parent comment not found');
        }

            const validPage = Math.max(1, page);
            const validLimit = Math.max(1, Math.min(limit, 100));
            const skip = (validPage - 1) * validLimit;


        
        const replies = await this.prisma.comment.findMany({
            where: { parentCommentId: commentId, isDeleted: false },
            include: {
                user: true,
                _count: {
                    select: { 
                        replies: true, 
                        likes: true,
                    },
                },
                likes: { //to check if the user has liked the comment
                    where: { userId: userId },
                    select: { id: true },
                },
            },
            orderBy: { createdAt: 'asc' },
            skip: (validPage - 1) * validLimit,
            take: validLimit,
        });



        const parentUsername = await this.prisma.user.findUnique({
            where: { id: parentComment.userId },
            select: { username: true },
        });

        const totalCount = await this.prisma.comment.count({
            where: { parentCommentId: commentId, isDeleted: false },
        });


        return {
            replies: replies.map(reply => ({
                replyId: reply.id,
                parentId: commentId,
                parentUsername: parentUsername?.username || 'Unknown',
                user: {
                    userId: reply.userId,
                    username: reply.user.username,
                    avatarUrl: reply.user.avatarUrl,
                },
                text: reply.content,
                likesCount: reply._count.likes,
                repliesCount: reply._count.replies,
                isLiked: !!reply.likes[0],
                createdAt: reply.createdAt,
            })),
            page: validPage,
            limit: validLimit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / validLimit),
            hasNextPage: skip + replies.length < totalCount,
            hasPreviousPage: skip > 0,
        };

    }

    async likeComment(commentId: string, userId: string) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId, isDeleted: false },
        });

        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        const existingLike = await this.prisma.commentLike.findFirst({
            where: { userId: userId, commentId: commentId },
        });

        if (existingLike) {
            throw new ForbiddenException('You have already liked this comment');
        }

        await this.prisma.commentLike.create({
            data: { userId: userId, commentId: commentId },
        });

        return { 
            message: 'Comment liked successfully',
            likesCount: await this.prisma.commentLike.count({
                where: { commentId: commentId },
            }),
        };
    }

    async unlikeComment(commentId: string, userId: string) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId, isDeleted: false },
        });

        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        const existingLike = await this.prisma.commentLike.findFirst({
            where: { userId: userId, commentId: commentId },
        });

        if (!existingLike) {
            throw new ForbiddenException('You have not liked this comment');
        }

        await this.prisma.commentLike.delete({
            where: { id: existingLike.id },
        });
        return { 
            message: 'Comment unliked successfully', 
            likesCount: await this.prisma.commentLike.count({
                where: { commentId: commentId },
            }),
        };

    }
}
