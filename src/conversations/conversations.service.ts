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
}
