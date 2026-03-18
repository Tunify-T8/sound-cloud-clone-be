import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateUserDto } from './dto/private-user.dto';
import { PublicUserDto } from './dto/public-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
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
}
