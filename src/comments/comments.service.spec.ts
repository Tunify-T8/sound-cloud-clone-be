import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';
const COMMENT_ID = 'comment-abc';
const TRACK_ID = 'track-xyz';

const mockComment = {
  id: COMMENT_ID,
  userId: USER_ID,
  trackId: TRACK_ID,
  content: 'Great track!',
  parentCommentId: null,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockReply = {
  id: 'reply-123',
  userId: USER_ID,
  trackId: TRACK_ID,
  content: 'Thanks for the comment!',
  parentCommentId: COMMENT_ID,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  createdAt: new Date('2024-01-02'),
  updatedAt: new Date('2024-01-02'),
};

const mockUser = {
  id: USER_ID,
  username: 'test-user',
  avatarUrl: 'https://example.com/avatar.jpg',
};

const mockTrack = {
  id: TRACK_ID,
  title: 'Test Track',
  artistId: OTHER_USER_ID,
  isDeleted: false,
  _count: {
    comments: 10,
  },
};

const mockCommentLike = {
  id: 'like-123',
  userId: USER_ID,
  commentId: COMMENT_ID,
  createdAt: new Date(),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: PrismaService,
          useValue: {
            comment: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            track: {
              findUnique: jest.fn(),
            },
            commentLike: {
              findFirst: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // deleteComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('deleteComment()', () => {
    it('soft deletes a comment and returns updated count', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.track.findUnique as jest.Mock).mockResolvedValue(mockTrack);
      (prisma.comment.update as jest.Mock).mockResolvedValue({
        ...mockComment,
        isDeleted: true,
      });

      const result = await service.deleteComment(USER_ID, COMMENT_ID);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: COMMENT_ID, isDeleted: false },
      });
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: COMMENT_ID },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
          deletedBy: USER_ID,
        },
      });
      expect(result.message).toBe('Comment deleted successfully');
      expect(result.commentCount).toBe(9); // 10 - 1
    });

    it('throws NotFoundException when comment does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteComment(USER_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws NotFoundException when comment is already deleted', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteComment(USER_ID, COMMENT_ID)).rejects.toThrow(
        'Comment not found'
      );
    });

    it('throws NotFoundException when track does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.track.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteComment(USER_ID, COMMENT_ID)).rejects.toThrow(
        'Track not found'
      );
    });

    it('throws NotFoundException when user is not the comment author', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.track.findUnique as jest.Mock).mockResolvedValue(mockTrack);

      await expect(
        service.deleteComment(OTHER_USER_ID, COMMENT_ID)
      ).rejects.toThrow('You can only delete your own comments');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // addReply()
  // ══════════════════════════════════════════════════════════════════════════

  describe('addReply()', () => {
    it('creates a reply to a comment', async () => {
      const parentCommentUser = { username: 'parent-user' };
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.create as jest.Mock).mockResolvedValue(mockReply);
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(parentCommentUser);

      const result = await service.addReply(COMMENT_ID, USER_ID, 'Great comment!');

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: COMMENT_ID, isDeleted: false },
      });
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          trackId: TRACK_ID,
          parentCommentId: COMMENT_ID,
          content: 'Great comment!',
        },
      });
      expect(result.replyId).toBe('reply-123');
      expect(result.commentId).toBe(COMMENT_ID);
      expect(result.parentUsername).toBe('parent-user');
      expect(result.text).toBe('Great comment!');
      expect(result.likesCount).toBe(0);
    });

    it('throws NotFoundException when parent comment does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addReply(COMMENT_ID, USER_ID, 'Reply text')
      ).rejects.toThrow('Parent comment not found');
    });

    it('throws NotFoundException when user not found', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.create as jest.Mock).mockResolvedValue(mockReply);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addReply(COMMENT_ID, USER_ID, 'Text')
      ).rejects.toThrow('User not found');
    });

    it('returns parent username as Unknown when parent user not found', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.create as jest.Mock).mockResolvedValue(mockReply);
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);

      const result = await service.addReply(COMMENT_ID, USER_ID, 'text');

      expect(result.parentUsername).toBe('Unknown');
    });

    it('includes user information in reply response', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.create as jest.Mock).mockResolvedValue(mockReply);
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ username: 'parent-user' });

      const result = await service.addReply(COMMENT_ID, USER_ID, 'text');

      expect(result.user).toEqual({
        userId: USER_ID,
        username: 'test-user',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getReplies()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getReplies()', () => {
    it('returns paginated replies with pagination metadata', async () => {
      const mockRepliesData = [
        {
          id: 'reply-1',
          userId: 'user-1',
          content: 'First reply',
          user: { username: 'user1', avatarUrl: null },
          _count: { likes: 5, replies: 1 },
          likes: [],
          createdAt: new Date('2024-01-02'),
        },
      ];
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(mockRepliesData);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getReplies(COMMENT_ID, USER_ID, 1, 20);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
      expect(result.replies).toHaveLength(1);
    });

    it('uses default pagination when not provided', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(0);

      await service.getReplies(COMMENT_ID, USER_ID);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it('correctly calculates pagination with multiple pages', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(
        Array(10).fill({
          id: 'reply-id',
          userId: 'user-id',
          content: 'reply',
          user: { username: 'user', avatarUrl: null },
          _count: { likes: 0, replies: 0 },
          likes: [],
          createdAt: new Date(),
        })
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(50);

      const result = await service.getReplies(COMMENT_ID, USER_ID, 1, 10);

      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('indicates hasPreviousPage when not on first page', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(50);

      const result = await service.getReplies(COMMENT_ID, USER_ID, 3, 10);

      expect(result.hasPreviousPage).toBe(true);
      expect(result.hasNextPage).toBe(true);
    });

    it('validates and constrains page and limit values', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(0);

      // Test negative page (should use 1)
      await service.getReplies(COMMENT_ID, USER_ID, -1, 20);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // (1 - 1) * 20
        })
      );
    });

    it('sets isLiked flag correctly based on whether user has liked', async () => {
      const mockRepliesData = [
        {
          id: 'reply-liked',
          userId: 'user-1',
          content: 'Liked reply',
          user: { username: 'user1', avatarUrl: null },
          _count: { likes: 1, replies: 0 },
          likes: [{ id: 'like-1' }], // User has liked this reply
          createdAt: new Date(),
        },
        {
          id: 'reply-not-liked',
          userId: 'user-2',
          content: 'Not liked reply',
          user: { username: 'user2', avatarUrl: null },
          _count: { likes: 0, replies: 0 },
          likes: [], // User has not liked this reply
          createdAt: new Date(),
        },
      ];
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(mockRepliesData);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(2);

      const result = await service.getReplies(COMMENT_ID, USER_ID, 1, 20);

      expect(result.replies[0].isLiked).toBe(true);
      expect(result.replies[1].isLiked).toBe(false);
    });

    it('throws NotFoundException when parent comment does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getReplies(COMMENT_ID, USER_ID, 1, 20)
      ).rejects.toThrow('Parent comment not found');
    });

    it('returns replies with user information', async () => {
      const mockRepliesData = [
        {
          id: 'reply-1',
          userId: COMMENT_ID,
          content: 'Reply text',
          user: { username: 'replier', avatarUrl: 'https://example.com/av.jpg' },
          _count: { likes: 3, replies: 1 },
          likes: [],
          createdAt: new Date(),
        },
      ];
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue(mockRepliesData);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getReplies(COMMENT_ID, USER_ID, 1, 20);

      expect(result.replies[0].user.username).toBe('replier');
      expect(result.replies[0].likesCount).toBe(3);
      expect(result.replies[0].repliesCount).toBe(1);
    });

    it('limits maximum page size to 100', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'parent-user',
      });
      (prisma.comment.count as jest.Mock).mockResolvedValue(0);

      // Request with limit > 100
      await service.getReplies(COMMENT_ID, USER_ID, 1, 200);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Should be capped at 100
        })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // likeComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('likeComment()', () => {
    it('creates a like and returns updated count', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.commentLike.create as jest.Mock).mockResolvedValue(
        mockCommentLike
      );
      (prisma.commentLike.count as jest.Mock).mockResolvedValue(5);

      const result = await service.likeComment(COMMENT_ID, USER_ID);

      expect(prisma.commentLike.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          commentId: COMMENT_ID,
        },
      });
      expect(result.message).toBe('Comment liked successfully');
      expect(result.likesCount).toBe(5);
    });

    it('throws NotFoundException when comment does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.likeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow('Comment not found');
    });

    it('throws ForbiddenException when user already liked the comment', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(
        mockCommentLike
      );

      await expect(
        service.likeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow('You have already liked this comment');
    });

    it('does not create like when user has already liked', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(
        mockCommentLike
      );

      await expect(
        service.likeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.commentLike.create).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // unlikeComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('unlikeComment()', () => {
    it('deletes a like and returns updated count', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(
        mockCommentLike
      );
      (prisma.commentLike.delete as jest.Mock).mockResolvedValue(
        mockCommentLike
      );
      (prisma.commentLike.count as jest.Mock).mockResolvedValue(4);

      const result = await service.unlikeComment(COMMENT_ID, USER_ID);

      expect(prisma.commentLike.delete).toHaveBeenCalledWith({
        where: { id: 'like-123' },
      });
      expect(result.message).toBe('Comment unliked successfully');
      expect(result.likesCount).toBe(4);
    });

    it('throws NotFoundException when comment does not exist', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unlikeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow('Comment not found');
    });

    it('throws ForbiddenException when user has not liked the comment', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unlikeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow('You have not liked this comment');
    });

    it('does not delete like when user has not liked', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unlikeComment(COMMENT_ID, USER_ID)
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.commentLike.delete).not.toHaveBeenCalled();
    });

    it('correctly decrements likes count', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.commentLike.findFirst as jest.Mock).mockResolvedValue(
        mockCommentLike
      );
      (prisma.commentLike.delete as jest.Mock).mockResolvedValue(
        mockCommentLike
      );
      (prisma.commentLike.count as jest.Mock).mockResolvedValue(0);

      const result = await service.unlikeComment(COMMENT_ID, USER_ID);

      expect(result.likesCount).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Soft Delete Logic
  // ══════════════════════════════════════════════════════════════════════════

  describe('Soft Delete Logic', () => {
    it('stores deletion metadata when deleting comment', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.track.findUnique as jest.Mock).mockResolvedValue(mockTrack);
      (prisma.comment.update as jest.Mock).mockResolvedValue({
        ...mockComment,
        isDeleted: true,
      });

      await service.deleteComment(USER_ID, COMMENT_ID);

      const callArgs = (prisma.comment.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.isDeleted).toBe(true);
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(callArgs.data.deletedBy).toBe(USER_ID);
    });

    it('queries with isDeleted: false filter to exclude soft-deleted comments', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(mockComment);
      (prisma.track.findUnique as jest.Mock).mockResolvedValue(mockTrack);
      (prisma.comment.update as jest.Mock).mockResolvedValue({
        ...mockComment,
        isDeleted: true,
      });

      await service.deleteComment(USER_ID, COMMENT_ID);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: COMMENT_ID, isDeleted: false },
      });
    });
  });
});
