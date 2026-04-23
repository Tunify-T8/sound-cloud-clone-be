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
}
