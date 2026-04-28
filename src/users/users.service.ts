import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateUserDto } from './dto/private-user.dto';
import { PublicUserDto } from './dto/public-user.dto';
import { UserDto } from './dto/user.dto';
import {
  UserTracksDto,
  LikedTracksDto,
  PopularTracks,
} from './dto/user-tracks.dto';
import { UserRepostsDto } from './dto/user-reposts.dto';
import { UserCollectionsDto } from './dto/user-collections.dto';
import { CollectionType, SocialPlatform } from '@prisma/client';
import { FollowListDto } from './dto/user-follow.dto';
import { UpdateSocialLinksDto } from './dto/update-social-links.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { StorageService } from 'src/storage/storage.service';
import { SearchIndexService } from 'src/search-index/search-index.service';
import {
  PublicTrackItemDto,
  PublicUserTracksDto,
  TrackArtistDto,
} from './dto/user-public-tracks.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async getCurrentUser(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        bio: true,
        location: true,
        avatarUrl: true,
        coverUrl: true,
        createdAt: true,
        visibility: true,
        isActive: true,
        isCertified: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const [tracksCount, followersCount, followingCount, likesReceived] =
      await Promise.all([
        this.prisma.track.count({
          where: { userId: userId, isDeleted: false },
        }),
        this.prisma.follow.count({ where: { followingId: userId } }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.trackLike.count({
          where: { track: { userId: userId } },
        }),
      ]);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      bio: user.bio,
      location: user.location,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLoginAt,
      visibility: user.visibility,
      isActive: user.isActive,
      isCertified: user.isCertified,
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
        displayName: true,
        role: true,
        bio: true,
        location: true,
        avatarUrl: true,
        coverUrl: true,
        createdAt: true,
        visibility: true,
        isActive: true,
        isCertified: true,
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
        displayName: user.displayName,
        role: user.role,
        bio: user.bio,
        location: user.location,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        isFollowing,
        isActive: user.isActive,
        isCertified: user.isCertified,
        createdAt: user.createdAt,
      };
    }

    const [tracksCount, followersCount, followingCount, likesReceived] =
      await Promise.all([
        this.prisma.track.count({ where: { userId: id, isDeleted: false } }),
        this.prisma.follow.count({ where: { followingId: id } }),
        this.prisma.follow.count({ where: { followerId: id } }),
        this.prisma.trackLike.count({
          where: { track: { userId: id } },
        }),
      ]);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      bio: user.bio,
      location: user.location,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      tracksCount,
      followersCount,
      followingCount,
      likesReceived,
      isFollowing,
      isActive: user.isActive,
      isCertified: user.isCertified,
      createdAt: user.createdAt,
    };
  }

  async getSocialLinks(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        socialLinks: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.socialLinks;
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
          isDeleted: false,
          isHidden: false,
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
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
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
        artist: {
          id: like.track.user.id,
          username: like.track.user.username,
          displayName: like.track.user.displayName,
        },
      })),
      page,
      limit,
      hasMore: skip + likes.length < total,
    };
  }

  async getPopularTracks(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PopularTracks> {
    const skip = (page - 1) * limit;

    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where: { userId, isDeleted: false, isHidden: false, isPublic: true },
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
              playHistory: true,
              likes: true,
              comments: true,
              reposts: true,
            },
          },
        },
        orderBy: { playHistory: { _count: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.track.count({
        where: { userId, isDeleted: false, isHidden: false, isPublic: true },
      }),
    ]);

    return {
      tracks: tracks.map((track) => ({
        id: track.id,
        title: track.title,
        description: track.description,
        audioUrl: track.audioUrl,
        coverUrl: track.coverUrl,
        duration: track.durationSeconds,
        playsCount: track._count.playHistory,
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
        where: { ...whereClause, isDeleted: false, isActive: true },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          location: true,
          isCertified: true,
          _count: { select: { followers: true } },
          ...(direction === 'following' && {
            notificationPreferences: {
              select: { userFollowed: true },
            },
          }),
          // for followers — check if userId follows them back
          ...(direction === 'followers' && {
            followers: {
              where: { followerId: userId },
              select: { id: true },
              take: 1,
            },
          }),
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: { ...whereClause, isDeleted: false, isActive: true },
      }),
    ]);

    return {
      [direction]: users.map((u) => {
        // notificationPreferences only exists on following results
        const prefs = (
          u as { notificationPreferences?: { userFollowed: boolean }[] }
        ).notificationPreferences;

        const isNotificationEnabled =
          direction === 'following'
            ? (prefs ?? []).some((p) => p.userFollowed === true)
            : null;
        // followers relation here is scoped to "does userId follow this person"
        const followersBack = (u as { followers?: { id: string }[] }).followers;

        const isFollowing =
          direction === 'followers' ? (followersBack ?? []).length > 0 : null;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          location: u.location,
          isCertified: u.isCertified,
          followersCount: u._count.followers,
          isNotificationEnabled,
          isFollowing,
        };
      }),
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

  async getFavoriteGenres(userId: string) {
    const playHistory = await this.prisma.playHistory.groupBy({
      by: ['trackId'],
      where: { userId },
      _count: { trackId: true },
    });

    if (!playHistory.length) return [];

    // get trackIds ordered by play count
    const trackPlayCounts = playHistory
      .sort((a, b) => b._count.trackId - a._count.trackId)
      .map((p) => p.trackId);

    // get genres for those tracks, excluding deleted/hidden
    const tracks = await this.prisma.track.findMany({
      where: {
        id: { in: trackPlayCounts },
        isDeleted: false,
        isHidden: false,
        genre: { isNot: null },
      },
      select: {
        genreId: true,
        genre: { select: { id: true, label: true } },
      },
    });

    // count plays per genre
    const genrePlayCounts = new Map<
      string,
      { id: string; label: string; count: number }
    >();

    for (const track of tracks) {
      if (!track.genre) continue;
      const plays =
        playHistory.find((p) => p.trackId === track.genreId)?._count.trackId ??
        0;
      const existing = genrePlayCounts.get(track.genreId ?? '');
      if (existing) {
        existing.count += plays;
      } else {
        genrePlayCounts.set(track.genreId ?? '', {
          id: track.genre.id,
          label: track.genre.label,
          count: plays,
        });
      }
    }

    return [...genrePlayCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ id, label }) => ({ id, label }));
  }

  async getPublicTracks(
    targetUserId: string,
    viewerUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PublicUserTracksDto> {
    const skip = (page - 1) * limit;

    // viewer is the owner — show public + private, else public only
    const isOwner = viewerUserId === targetUserId;
    const visibilityFilter = isOwner
      ? { isDeleted: false }
      : { isDeleted: false, isPublic: true };
    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where: { userId: targetUserId, ...visibilityFilter },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          coverUrl: true,
          durationSeconds: true,
          createdAt: true,
          transcodingStatus: true,
          isPublic: true,
          releaseDate: true,
          waveformUrl: true,
          genre: { select: { label: true } },
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isCertified: true,
            },
          },
          trackArtists: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          _count: {
            select: {
              likes: true,
              reposts: true,
              comments: true,
              playHistory: true,
            },
          },
        },
      }),
      this.prisma.track.count({
        where: { userId: targetUserId, ...visibilityFilter },
      }),
    ]);

    const trackIds = tracks.map((t) => t.id);

    // resolve isLiked and isReposted for viewer
    const [likedSet, repostedSet] = await Promise.all([
      this.prisma.trackLike
        .findMany({
          where: {
            userId: viewerUserId,
            trackId: { in: trackIds.length > 0 ? trackIds : ['__none__'] },
          },
          select: { trackId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.trackId))),
      this.prisma.repost
        .findMany({
          where: {
            userId: viewerUserId,
            trackId: { in: trackIds.length > 0 ? trackIds : ['__none__'] },
          },
          select: { trackId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.trackId))),
    ]);

    const data: PublicTrackItemDto[] = tracks.map((t) => {
      // owner as primary artist entry
      const ownerArtist: TrackArtistDto = {
        id: t.user.id,
        username: t.user.username,
        displayName: t.user.displayName,
        avatarUrl: t.user.avatarUrl,
        isVerified: t.user.isCertified,
      };

      const creditArtists: TrackArtistDto[] = t.trackArtists.map((ta) => ({
        id: ta.id,
        displayName: ta.name,
      }));

      return {
        id: t.id,
        title: t.title,
        artist: ownerArtist,
        artists: [ownerArtist, ...creditArtists],
        coverUrl: t.coverUrl,
        durationSeconds: t.durationSeconds,
        createdAt: t.createdAt,
        status: t.transcodingStatus,
        privacy: t.isPublic ? 'public' : 'private',
        scheduledReleaseDate: t.releaseDate,
        genre: t.genre?.label ?? null,
        waveformUrl: t.waveformUrl,
        engagement: {
          likeCount: t._count.likes,
          repostCount: t._count.reposts,
          commentCount: t._count.comments,
          playCount: t._count.playHistory,
        },
        interaction: {
          isLiked: likedSet.has(t.id),
          isReposted: repostedSet.has(t.id),
        },
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        hasMore: skip + tracks.length < total,
      },
    };
  }

  async updateSocialLinks(userId: string, dto: UpdateSocialLinksDto) {
    const upserts = dto.links.map((link) =>
      this.prisma.userSocialLink.upsert({
        where: {
          userId_platform: {
            userId: userId,
            platform: link.platform,
          },
        },
        update: { url: link.url },
        create: { userId: userId, platform: link.platform, url: link.url },
      }),
    );
    await this.prisma.$transaction(upserts);
    return this.prisma.userSocialLink.findMany({
      where: { userId: userId, deletedAt: null },
      select: { platform: true, url: true },
    });
  }

  async updateUserProfile(
    userId: string,
    dto: UpdateUserProfileDto,
    files?: { avatar?: Express.Multer.File[]; cover?: Express.Multer.File[] },
  ) {
    const data = { ...dto };

    const oldUserFiles = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarUrl: true,
        coverUrl: true,
      },
    });

    if (!oldUserFiles) {
      throw new NotFoundException('User not found');
    }

    let uploadedAvatar: string | null = null;
    let uploadedCover: string | null = null;

    if (files?.avatar?.[0]) {
      uploadedAvatar = await this.storage.uploadImage(files.avatar[0]);
      if (uploadedAvatar) data.avatarUrl = uploadedAvatar;
    }

    if (files?.cover?.[0]) {
      uploadedCover = await this.storage.uploadImage(files.cover[0]);
      if (uploadedCover) data.coverUrl = uploadedCover;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        bio: true,
        location: true,
        avatarUrl: true,
        coverUrl: true,
        visibility: true,
        role: true,
        isCertified: true,
        gender: true,
        dateOfBirth: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (uploadedAvatar && oldUserFiles?.avatarUrl) {
      const oldAvatarFile = oldUserFiles.avatarUrl.split('/').pop();
      if (oldAvatarFile) {
        this.storage.deleteFile('artwork', oldAvatarFile).catch(console.error);
      }
    }

    if (uploadedCover && oldUserFiles?.coverUrl) {
      const oldCoverFile = oldUserFiles.coverUrl.split('/').pop();
      if (oldCoverFile) {
        this.storage.deleteFile('artwork', oldCoverFile).catch(console.error);
      }
    }
    await this.searchIndexService.indexUser(userId);
    return updatedUser;
  }

  async deleteSocialLink(userId: string, platform: SocialPlatform) {
    return this.prisma.userSocialLink
      .delete({
        where: { userId_platform: { userId: userId, platform } },
      })
      .catch(() => {
        throw new NotFoundException(`No ${platform.toLowerCase()} link found`);
      });
  }

  //Get current user tier and remaining uploads. Called when entering the Upload Entry Screen.
  async getUploadStats(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        endedAt: null,
        plan: {
          is: {
            name: { in: ['free', 'artist', 'artist-pro'] },
            isActive: true,
          },
        },
      },
      include: {
        plan: true,
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const uploadMinutesLimit = subscription?.plan?.monthlyUploadMinutes ?? 100;
    const uploadMinutesUsed = subscription?.uploadedMinutes ?? 0;

    return {
      tier: subscription?.plan?.name ?? 'free',
      uploadMinutesLimit,
      uploadMinutesUsed,
      uploadMinutesRemaining: Math.max(
        uploadMinutesLimit - uploadMinutesUsed,
        0,
      ),
      adFree: subscription?.plan?.adFree ?? false,
      offlineListening: subscription?.plan?.allowOfflineListening ?? false,
      playbackAccess: subscription?.plan?.playbackAccess ?? false,
      playlistLimit: subscription?.plan?.playlistLimit === -1 ? 'unlimited' : subscription?.plan?.playlistLimit ?? 3, 
      canReplaceFiles: subscription?.plan?.allowReplace ?? false,
      canScheduleRelease: subscription?.plan?.allowScheduledRelease ?? false,
      canAccessAdvancedTab: subscription?.plan?.allowAdvancedTabAccess ?? false,
    };
  }

  // async getUploadMinutes(userId: string) {
  //   const subscription = await this.prisma.subscription.findFirst({
  //     where: {
  //       userId,
  //       status: 'ACTIVE',
  //       endedAt: null,
  //       plan: {
  //         is: {
  //           name: { in: ['FREE', 'PRO', 'GOPLUS'] },
  //           isActive: true,
  //         },
  //       },
  //     },
  //     include: {
  //       plan: true,
  //     },
  //     orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
  //   });

  //   const uploadMinutesLimit = subscription?.plan?.monthlyUploadMinutes ?? 99;
  //   const uploadMinutesUsed = subscription?.uploadedMinutes ?? 0;

  //   return {
  //     tier: subscription?.plan?.name ?? 'NO_PLAN',
  //     uploadMinutesLimit,
  //     uploadMinutesUsed,
  //     uploadMinutesRemaining: Math.max(
  //       uploadMinutesLimit - uploadMinutesUsed,
  //       0,
  //     ),
  //   };
  // }




async getUserCollections(
  username: string,
  requesterId: string | undefined,
  page: number = 1,
  limit: number = 10,
  type?: CollectionType,
) {
    // 1. Find user by username
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) throw new NotFoundException('User not found');

    const isOwner = requesterId === user.id;
    const skip = (page - 1) * limit;

    // 2. Build where clause
    const where = {
      userId: user.id,
      isDeleted: false,
      ...(type ? { type } : {}),
      ...(!isOwner ? { isPublic: true } : {}),
    };

    const [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          isPublic: true,
          type: true,
          createdAt: true,
          _count: {
            select: {
              tracks: true,
              likes: true,
            },
          },
        },
      }),
      this.prisma.collection.count({ where }),
    ]);

    return {
      data: collections.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        coverUrl: c.coverUrl,
        isPublic: c.isPublic,
        type: c.type,
        tracksCount: c._count.tracks,
        likesCount: c._count.likes,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
      hasMore: skip + collections.length < total,
    };
  }

  async getMyConversations(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(limit, 100));
    const skip = (validPage - 1) * validLimit;

    // Get list of users who have blocked this user
    const blockedByUsers = (
      await this.prisma.userBlock.findMany({
        where: { blockedId: userId },
        select: { blockerId: true },
      })
    ).map((b) => b.blockerId);

    // Get conversations with related messages and users
    const conversations = await this.prisma.conversation.findMany({
      where: {
        status: 'ACTIVE',
        AND: [
          {
            OR: [{ user1Id: userId }, { user2Id: userId }],
          },
          {
            AND: [
              { user1Id: { notIn: blockedByUsers } },
              { user2Id: { notIn: blockedByUsers } },
            ],
          },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        user2: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            read: true,
            senderId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: validLimit,
    });

      // total is the 
      const total = conversations.length
    

    // Format response
    const items = conversations.map((conv) => {
      const otherUser = conv.user1Id === userId ? conv.user2 : conv.user1;
      const lastMessage = conv.messages[0];

      // Count unread messages from the other user
      const unreadCount = conv.messages.filter(
        (msg) => !msg.read && msg.senderId !== userId,
      ).length;

      return {
        conversationId: conv.id,
        otherUser: {
          id: otherUser.id,
          displayName: otherUser.displayName || 'Unknown User',
          avatarUrl: otherUser.avatarUrl,
        },
        lastMessagePreview: lastMessage?.content || null,
        lastMessageAt: lastMessage?.createdAt || null,
        unreadCount,
      };
    });

    return {
      items,
      page: validPage,
      limit: validLimit,
      total,
      totalPages: Math.ceil(total / validLimit),
      hasNextPage: skip + conversations.length < total,
      hasPreviousPage: skip > 0,
    };
  }

  async createConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    // Check if conversation already exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: otherUserId },
          { user1Id: otherUserId, user2Id: userId },
        ],
      },
    });

    if (existing) {
      return {
        conversationId: existing.id,
      };
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        user1Id: userId,
        user2Id: otherUserId,
      },
    });

    return {
      conversationId: conversation.id,
    };
  }

  async getUnreadMessagesCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        read: false,
        senderId: { not: userId },
        conversation: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
      },
    });

    return { unreadCount: count };
  }
}
