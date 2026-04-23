import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
    constructor(private prisma: PrismaService) {}

    async deleteConversation(userId: string, conversationId: string) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId, isDeleted: false },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Check if the user is part of the conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('User is not part of the conversation');
        }

        // Mark the conversation as deleted
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        return { message: `Conversation ${conversationId} deleted for user ${userId}` };
    }

    async getMessages(userId: string, conversationId: string, page: number, limit: number) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId, isDeleted: false },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Check if the user is part of the conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('User is not part of the conversation');
        }

        // Check if user is blocked from this conversation
        const blockedUserIds = (await this.prisma.userBlock.findMany({
            where: { blockedId: userId },
            select: { blockerId: true },
        })).map(b => b.blockerId);

        const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
        if (blockedUserIds.includes(otherUserId)) {
            throw new ForbiddenException('You are blocked by this user');
        }

        const validPage = Math.max(1, page);
        const validLimit = Math.max(1, Math.min(limit, 100));
        const skip = (validPage - 1) * validLimit;
        // Fetch messages for the conversation

        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            skip: skip,
            take: validLimit,
            include: {
                track: { select: { id: true, title: true, coverUrl: true, durationSeconds: true, userId: true } },
                collection: { select: { id: true, title: true, coverUrl: true } },
                sharedUser: { select: { id: true, username: true, avatarUrl: true } },
                sender: { select: { id: true, username: true, avatarUrl: true } },
            },
        });

        const total = await this.prisma.message.count({ where: { conversationId } });

        // Get all unique user IDs for artist lookups
        const userIds = messages
            .filter(m => m.track?.userId)
            .map(m => m.track!.userId)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true },
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        const items = messages.map((message) => {
            const type = message.type;
            let attachment: string | null = null;
            let preview;

            if (type === 'TRACK_LIKE' && message.track) {
                attachment = message.track.id;
                const artist = userMap.get(message.track.userId);
                preview = {
                    title: message.track.title || 'Unknown Track',
                    artistName: artist?.username || 'Unknown Artist',
                    artworkUrl: message.track.coverUrl || null,
                    durationSeconds: message.track.durationSeconds || null,
                };
            } else if (type === 'USER' && message.sharedUser) {
                attachment = message.sharedUser.id;
                preview = {
                    username: message.sharedUser.username,
                    avatarUrl: message.sharedUser.avatarUrl,
                };
            } else if ((type === 'PLAYLIST' || type === 'ALBUM' || type === 'UPLOAD') && message.collection) {
                attachment = message.collection.id;
                preview = {
                    title: message.collection.title,
                    coverUrl: message.collection.coverUrl,
                };
            }

            return {
                id: message.id,
                sender: message.sender,
                type: message.type,
                text: message.content,
                createdAt: message.createdAt,
                attachment: {
                    id: attachment,
                    type: type,
                    preview: preview,
                },
            };
        });;;


        return {
            conversationId: conversationId,
            messages: items,
            page: validPage,
            limit: validLimit,
            total: total,
            totalPages: Math.ceil(total / validLimit),
            hasNextPage: skip + messages.length < total,
            hasPreviousPage: skip > 0,
        };
    }


    async markAs(userId: string, conversationId: string, flag: boolean) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId, isDeleted: false },
        });
        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Check if the user is part of the conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('User is not part of the conversation');
        }

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { isRead: flag },
        });

        return { message: `Conversation ${conversationId} marked as ${flag ? 'read' : 'unread'} for user ${userId}` };
    }

    async archiveConversation(userId: string, conversationId: string) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId, isDeleted: false },
        });
        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Check if the user is part of the conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('User is not part of the conversation');
        }

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { status: 'ARCHIVED' },
        });
        return { message: `Conversation ${conversationId} archived for user ${userId}` };
    }

    async blockUser(userId: string, conversationId: string, removeComments: boolean, reportSpam: boolean) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId, isDeleted: false },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Check if the user is part of the conversation
        if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
            throw new ForbiddenException('User is not part of the conversation');
        }

        const blockedUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;

        // Update conversation, remove follows, and create block in transaction
        const userBlock = await this.prisma.$transaction(async (tx) => {
            await tx.conversation.update({
                where: { id: conversationId },
                data: { status: 'BLOCKED' },
            });

            // Remove follows in both directions
            await tx.follow.deleteMany({
                where: {
                    OR: [
                        { followerId: userId, followingId: blockedUserId },
                        { followerId: blockedUserId, followingId: userId },
                    ],
                },
            });

            // Create the block record
            return await tx.userBlock.create({
                data: {
                    blockerId: userId,
                    blockedId: blockedUserId,
                    removeComments,
                    reportSpam,
                },
            });
        });

        return { message: 'User blocked successfully', blockedUserId, blockId: userBlock.id };
    }

    async unblockUser(userId: string, blockedUserId: string) {
        const userBlock = await this.prisma.userBlock.findUnique({
            where: { blockerId_blockedId: { blockerId: userId, blockedId: blockedUserId } },
        });

        if (!userBlock) {
            throw new NotFoundException('User not blocked');
        }

        await this.prisma.userBlock.delete({
            where: { id: userBlock.id },
        });

        return { message: 'User unblocked successfully' };
    }
}
