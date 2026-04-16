import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const COMMENT_ID = 'comment-abc';

const mockCommentResponse = {
  message: 'Comment deleted successfully',
  commentCount: 9,
};

const mockReplyResponse = {
  replyId: 'reply-123',
  commentId: COMMENT_ID,
  parentUsername: 'original-user',
  user: {
    userId: USER_ID,
    username: 'test-user',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  text: 'This is a reply',
  likesCount: 0,
  createdAt: new Date(),
};

const mockRepliesResponse = {
  replies: [
    {
      replyId: 'reply-1',
      parentId: COMMENT_ID,
      parentUsername: 'original-user',
      user: {
        userId: 'user-456',
        username: 'replier-1',
        avatarUrl: null,
      },
      text: 'Great comment!',
      likesCount: 3,
      repliesCount: 1,
      isLiked: false,
      createdAt: new Date(),
    },
  ],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const mockLikeResponse = {
  message: 'Comment liked successfully',
  likesCount: 5,
};

const mockUnlikeResponse = {
  message: 'Comment unliked successfully',
  likesCount: 4,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

const makeServiceMock = () => ({
  deleteComment: jest.fn(),
  addReply: jest.fn(),
  getReplies: jest.fn(),
  likeComment: jest.fn(),
  unlikeComment: jest.fn(),
});

const makeReq = (userId = USER_ID) =>
  ({ user: { userId } }) as any;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CommentsController', () => {
  let controller: CommentsController;
  let service: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    service = makeServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: service }],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommentsController>(CommentsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /comments/:id  →  deleteComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('deleteComment()', () => {
    it('calls service.deleteComment with userId and commentId', async () => {
      service.deleteComment.mockResolvedValue(mockCommentResponse);

      const result = await controller.deleteComment(makeReq(), COMMENT_ID);

      expect(service.deleteComment).toHaveBeenCalledWith(USER_ID, COMMENT_ID);
      expect(result).toEqual(mockCommentResponse);
    });

    it('returns success message with updated comment count', async () => {
      const response = {
        message: 'Comment deleted successfully',
        commentCount: 42,
      };
      service.deleteComment.mockResolvedValue(response);

      const result = await controller.deleteComment(makeReq(), COMMENT_ID);

      expect(result.message).toBe('Comment deleted successfully');
      expect(result.commentCount).toBe(42);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /comments/:id/replies  →  addReply()
  // ══════════════════════════════════════════════════════════════════════════

  describe('addReply()', () => {
    it('calls service.addReply with commentId, userId, and text', async () => {
      service.addReply.mockResolvedValue(mockReplyResponse);

      const result = await controller.addReply(
        makeReq(),
        COMMENT_ID,
        'This is a reply'
      );

      expect(service.addReply).toHaveBeenCalledWith(
        COMMENT_ID,
        USER_ID,
        'This is a reply'
      );
      expect(result).toEqual(mockReplyResponse);
    });

    it('returns reply with user and creator information', async () => {
      service.addReply.mockResolvedValue(mockReplyResponse);

      const result = await controller.addReply(
        makeReq(),
        COMMENT_ID,
        'Test reply'
      );

      expect(result.replyId).toBeDefined();
      expect(result.user.username).toBe('test-user');
      expect(result.text).toBe('This is a reply');
      expect(result.likesCount).toBe(0);
    });

    it('includes parent username in reply', async () => {
      service.addReply.mockResolvedValue(mockReplyResponse);

      const result = await controller.addReply(
        makeReq(),
        COMMENT_ID,
        'test'
      );

      expect(result.parentUsername).toBe('original-user');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /comments/:id/replies  →  getReplies()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getReplies()', () => {
    it('calls service.getReplies with commentId, userId, and pagination params', async () => {
      service.getReplies.mockResolvedValue(mockRepliesResponse);

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        1,
        20
      );

      expect(service.getReplies).toHaveBeenCalledWith(
        COMMENT_ID,
        USER_ID,
        1,
        20
      );
      expect(result).toEqual(mockRepliesResponse);
    });

    it('uses default pagination when not provided', async () => {
      service.getReplies.mockResolvedValue(mockRepliesResponse);

      await controller.getReplies(makeReq(), COMMENT_ID);

      expect(service.getReplies).toHaveBeenCalledWith(COMMENT_ID, USER_ID, 1, 20);
    });

    it('returns paginated replies with pagination metadata', async () => {
      service.getReplies.mockResolvedValue(mockRepliesResponse);

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        1,
        20
      );

      expect(result.replies).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('returns replies with isLiked flag per reply', async () => {
      const replyWithLike = {
        ...mockRepliesResponse.replies[0],
        isLiked: true,
      };
      service.getReplies.mockResolvedValue({
        ...mockRepliesResponse,
        replies: [replyWithLike],
      });

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        1,
        20
      );

      expect(result.replies[0].isLiked).toBe(true);
    });

    it('correctly handles multiple replies', async () => {
      const multipleReplies = {
        ...mockRepliesResponse,
        replies: Array(5).fill(mockRepliesResponse.replies[0]),
        total: 5,
      };
      service.getReplies.mockResolvedValue(multipleReplies);

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        1,
        20
      );

      expect(result.replies).toHaveLength(5);
    });

    it('indicates hasNextPage when there are more replies', async () => {
      const manyRepliesResponse = {
        ...mockRepliesResponse,
        total: 50,
        totalPages: 3,
        hasNextPage: true,
      };
      service.getReplies.mockResolvedValue(manyRepliesResponse);

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        1,
        20
      );

      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('indicates hasPreviousPage when not on first page', async () => {
      const page2Response = {
        ...mockRepliesResponse,
        page: 2,
        hasPreviousPage: true,
        hasNextPage: true,
      };
      service.getReplies.mockResolvedValue(page2Response);

      const result = await controller.getReplies(
        makeReq(),
        COMMENT_ID,
        2,
        20
      );

      expect(result.hasPreviousPage).toBe(true);
      expect(result.page).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /comments/:id/like  →  likeComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('likeComment()', () => {
    it('calls service.likeComment with commentId and userId', async () => {
      service.likeComment.mockResolvedValue(mockLikeResponse);

      const result = await controller.likeComment(makeReq(), COMMENT_ID);

      expect(service.likeComment).toHaveBeenCalledWith(COMMENT_ID, USER_ID);
      expect(result).toEqual(mockLikeResponse);
    });

    it('returns success message with updated likes count', async () => {
      service.likeComment.mockResolvedValue(mockLikeResponse);

      const result = await controller.likeComment(makeReq(), COMMENT_ID);

      expect(result.message).toBe('Comment liked successfully');
      expect(result.likesCount).toBe(5);
    });

    it('handles multiple likes correctly', async () => {
      const multiLikeResponse = {
        message: 'Comment liked successfully',
        likesCount: 100,
      };
      service.likeComment.mockResolvedValue(multiLikeResponse);

      const result = await controller.likeComment(makeReq(), COMMENT_ID);

      expect(result.likesCount).toBe(100);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /comments/:id/like  →  unlikeComment()
  // ══════════════════════════════════════════════════════════════════════════

  describe('unlikeComment()', () => {
    it('calls service.unlikeComment with commentId and userId', async () => {
      service.unlikeComment.mockResolvedValue(mockUnlikeResponse);

      const result = await controller.unlikeComment(makeReq(), COMMENT_ID);

      expect(service.unlikeComment).toHaveBeenCalledWith(COMMENT_ID, USER_ID);
      expect(result).toEqual(mockUnlikeResponse);
    });

    it('returns success message with updated likes count', async () => {
      service.unlikeComment.mockResolvedValue(mockUnlikeResponse);

      const result = await controller.unlikeComment(makeReq(), COMMENT_ID);

      expect(result.message).toBe('Comment unliked successfully');
      expect(result.likesCount).toBe(4);
    });

    it('correctly decrements likes count', async () => {
      const decrementedResponse = {
        message: 'Comment unliked successfully',
        likesCount: 0,
      };
      service.unlikeComment.mockResolvedValue(decrementedResponse);

      const result = await controller.unlikeComment(makeReq(), COMMENT_ID);

      expect(result.likesCount).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Guard and Error Handling
  // ══════════════════════════════════════════════════════════════════════════

  describe('Authorization', () => {
    it('extracts userId from authenticated request', async () => {
      service.likeComment.mockResolvedValue(mockLikeResponse);

      const req = { user: { userId: 'custom-user-id' } } as any;
      await controller.likeComment(req, COMMENT_ID);

      expect(service.likeComment).toHaveBeenCalledWith(
        COMMENT_ID,
        'custom-user-id'
      );
    });
  });

  describe('Error handling', () => {
    it('propagates NotFoundException from service when comment not found', async () => {
      service.deleteComment.mockRejectedValue(
        new NotFoundException('Comment not found')
      );

      await expect(controller.deleteComment(makeReq(), 'nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('propagates ForbiddenException when user is unauthorized', async () => {
      service.deleteComment.mockRejectedValue(
        new ForbiddenException('You can only delete your own comments')
      );

      await expect(controller.deleteComment(makeReq(), COMMENT_ID)).rejects.toThrow(
        ForbiddenException
      );
    });
  });
});
