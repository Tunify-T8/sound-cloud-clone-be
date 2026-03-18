import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateUserDto } from './dto/private-user.dto';
import { PublicUserDto } from './dto/public-user.dto';
import { UserDto } from './dto/user.dto';

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

}
