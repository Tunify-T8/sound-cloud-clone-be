import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateUserDto } from './dto/private-user.dto';
import { PublicUserDto } from './dto/public-user.dto';
import { UserDto } from './dto/user.dto';
import { UserTracksDto, LikedTracksDto } from './dto/user-tracks.dto';
import { UserRepostsDto } from './dto/user-reposts.dto';
import { UserCollectionsDto } from './dto/user-collections.dto';
import { CollectionType } from '@prisma/client';
import { FollowListDto } from './dto/user-follow.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        display_name: true,
        email: true,
        role: true,
        bio: true,
        location: true,
        avatar_url: true,
        cover_url: true,
        created_at: true,
        visibility: true,
        is_active: true,
        is_verified: true,
        updated_at: true,
        last_login_at: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const [tracksCount, followersCount, followingCount, likesReceived] =
      await Promise.all([
        this.prisma.track.count({ where: { userId: userId } }),
        this.prisma.follow.count({ where: { followingId: userId } }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.trackLike.count({
          where: { track: { userId: userId } },
        }),
      ]);
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      bio: user.bio,
      location: user.location,
      avatarUrl: user.avatar_url,
      coverUrl: user.cover_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login_at,
      visibility: user.visibility,
      isActive: user.is_active,
      isVerified: user.is_verified,
      tracksCount,
      followersCount,
      followingCount,
      likesReceived,
    };
  }

  async getUser(
    id: string,
    userId?: string,
  ): Promise<PublicUserDto | PrivateUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        display_name: true,
        role: true,
        bio: true,
        location: true,
        avatar_url: true,
        cover_url: true,
        created_at: true,
        visibility: true,
        is_active: true,
        is_verified: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let isFollowing = false;

    if (userId) {
      const follow = await this.prisma.follow.findFirst({
        where: {
          followerId: userId,
          followingId: id,
        },
      });

      isFollowing = !!follow;
    }

    if (user.visibility === 'PRIVATE' && user.id !== userId && !isFollowing) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        bio: user.bio,
        location: user.location,
        avatarUrl: user.avatar_url,
        coverUrl: user.cover_url,
        isFollowing,
        isActive: user.is_active,
        isVerified: user.is_verified,
        createdAt: user.created_at,
      };
    }

    const [tracksCount, followersCount, followingCount, likesReceived] =
      await Promise.all([
        this.prisma.track.count({ where: { userId: id } }),
        this.prisma.follow.count({ where: { followingId: id } }),
        this.prisma.follow.count({ where: { followerId: id } }),
        this.prisma.trackLike.count({
          where: { track: { userId: id } },
        }),
      ]);

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      bio: user.bio,
      location: user.location,
      avatarUrl: user.avatar_url,
      coverUrl: user.cover_url,
      tracksCount,
      followersCount,
      followingCount,
      likesReceived,
      isFollowing,
      isActive: user.is_active,
      isVerified: user.is_verified,
      createdAt: user.created_at,
    };
  }

  async getSocialLinks(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        social_links: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.social_links;
  }
  async getTracks(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<UserTracksDto> {
    const skip = (page - 1) * limit;
    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where: {
          userId: userId,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          audioUrl: true,
          coverUrl: true,
          durationSeconds: true,
          createdAt: true,
          _count: {
            select: {
              likes: true,
              comments: true,
              reposts: true,
            },
          },
        },
      }),
      this.prisma.track.count({
        where: { userId, isDeleted: false, isHidden: false },
      }),
    ]);

    return {
      data: tracks.map((track) => ({
        id: track.id,
        title: track.title,
        description: track.description,
        audioUrl: track.audioUrl,
        coverUrl: track.coverUrl,
        duration: track.durationSeconds,
        likesCount: track._count.likes,
        commentsCount: track._count.comments,
        repostsCount: track._count.reposts,
        createdAt: track.createdAt,
      })),
      page,
      limit,
      hasMore: skip + tracks.length < total,
    };
  }

  async getReposts(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<UserRepostsDto> {
    const skip = (page - 1) * limit;
    const [reposts, total] = await Promise.all([
      this.prisma.repost.findMany({
        where: { userId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          track: {
            select: {
              id: true,
              title: true,
              description: true,
              audioUrl: true,
              coverUrl: true,
              durationSeconds: true,
              createdAt: true,
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  reposts: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.repost.count({ where: { userId } }),
    ]);
    return {
      data: reposts.map((repost) => ({
        repostId: repost.id,
        repostedAt: repost.createdAt,
        track: {
          id: repost.track.id,
          title: repost.track.title,
          description: repost.track.description,
          audioUrl: repost.track.audioUrl,
          coverUrl: repost.track.coverUrl,
          duration: repost.track.durationSeconds,
          likesCount: repost.track._count.likes,
          commentsCount: repost.track._count.comments,
          repostsCount: repost.track._count.reposts,
          createdAt: repost.track.createdAt,
        },
      })),
      page,
      limit,
      hasMore: skip + reposts.length < total,
    };
  }
  async getCollections(
    userId: string,
    type: CollectionType,
    page: number = 1,
    limit: number = 10,
  ): Promise<UserCollectionsDto> {
    const skip = (page - 1) * limit;

    const [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where: { userId, type, isDeleted: false },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          isPublic: true,
          createdAt: true,
          _count: {
            select: {
              tracks: true,
              likes: true,
            },
          },
        },
      }),
      this.prisma.collection.count({
        where: { userId, type, isDeleted: false },
      }),
    ]);

    return {
      data: collections.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        coverUrl: c.coverUrl,
        isPublic: c.isPublic,
        tracksCount: c._count.tracks,
        likesCount: c._count.likes,
        createdAt: c.createdAt,
      })),
      page,
      limit,
      hasMore: skip + collections.length < total,
    };
  }

  async getLikedTracks(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<LikedTracksDto> {
    const skip = (page - 1) * limit;
    const [likes, total] = await Promise.all([
      this.prisma.trackLike.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          track: {
            select: {
              id: true,
              title: true,
              description: true,
              audioUrl: true,
              coverUrl: true,
              durationSeconds: true,
              createdAt: true,
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  reposts: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.trackLike.count({ where: { userId } }),
    ]);

    return {
      data: likes.map((like) => ({
        likedAt: like.createdAt,
        track: {
          id: like.track.id,
          title: like.track.title,
          description: like.track.description,
          audioUrl: like.track.audioUrl,
          coverUrl: like.track.coverUrl,
          duration: like.track.durationSeconds,
          likesCount: like.track._count.likes,
          commentsCount: like.track._count.comments,
          repostsCount: like.track._count.reposts,
          createdAt: like.track.createdAt,
        },
      })),
      page,
      limit,
      hasMore: skip + likes.length < total,
    };
  }

  async getFollowList(
    userId: string,
    direction: 'followers' | 'following',
    page: number = 1,
    limit: number = 10,
  ): Promise<FollowListDto> {
    const skip = (page - 1) * limit;
    const whereClause =
      direction === 'followers'
        ? { following: { some: { followingId: userId } } }
        : { followers: { some: { followerId: userId } } };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { ...whereClause, is_deleted: false, is_active: true },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          display_name: true,
          avatar_url: true,
          _count: { select: { followers: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.user.count({
        where: { ...whereClause, is_deleted: false, is_active: true },
      }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        followersCount: u._count.followers,
      })),
      page,
      limit,
      hasMore: skip + users.length < total,
    };
  }

  async getFollowerList(userId: string, page: number, limit: number) {
    return this.getFollowList(userId, 'followers', page, limit);
  }

  async getFollowingList(userId: string, page: number, limit: number) {
    return this.getFollowList(userId, 'following', page, limit);
  }
}
