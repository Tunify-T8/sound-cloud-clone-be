import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger ,

} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SearchIndexService } from '../search-index/search-index.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddTrackDto } from './dto/add-track.dto';
import { ReorderTracksDto } from './dto/reorder-tracks.dto';    

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly searchIndex: SearchIndexService,
  ) {}

  async create(
    userId: string,
    dto: CreateCollectionDto,
    coverFile?: any,
  ) {
    // 1. If ALBUM, user must be ARTIST
    if (dto.type === 'ALBUM') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.role !== 'ARTIST') {
        throw new ForbiddenException('Only artists can create albums');
      }
    }

    // 2. Paywall check — check user's plan playlist limit
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        plan: {
          select: { playlistLimit: true },
        },
      },
    });

    const playlistLimit = subscription?.plan?.playlistLimit ?? 3; // Default to free plan limit

    if (playlistLimit !== -1) { // -1 means unlimited
      const count = await this.prisma.collection.count({
        where: { userId, isDeleted: false },
      });
      if (count >= playlistLimit) {
        throw new BadRequestException(
          `You have reached the collection limit (${playlistLimit}) for your plan`,
        );
      }
    }

    // 3. Handle cover image - file upload takes precedence over direct URL
    let coverUrl: string | null = null;
    if (coverFile) {
      coverUrl = await this.storage.uploadImage(coverFile);
    } else if (dto.coverUrl) {
      coverUrl = dto.coverUrl;
    }

    // 4. Generate secret token for private collections
    const isPublic = dto.privacy === 'public';
    const secretToken = !isPublic
      ? randomBytes(16).toString('hex')
      : null;

    // 5. Create collection
    const collection = await this.prisma.collection.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        type: dto.type as CollectionType,
        isPublic,
        secretToken,
        coverUrl,
      },
    });

   // 6. Index for search (non-blocking — OpenSearch may not be available locally)
try {
  await this.searchIndex.indexCollection(collection.id);
} catch {
  // OpenSearch unavailable — skip indexing silently
}

    // 7. Return response
    return {
      id: collection.id,
      title: collection.title,
      description: collection.description,
      type: collection.type,
      privacy: collection.isPublic ? 'public' : 'private',
      secretToken: collection.isPublic ? null : collection.secretToken,
      coverUrl: collection.coverUrl,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    };
  }


  async getMyCollections(
  userId: string,
  page: number,
  limit: number,
  type?: string,
) {
  const skip = (page - 1) * limit;

  // Fetch owned collections
  const ownedCollections = await this.prisma.collection.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(type ? { type: type as CollectionType } : {}),
    },
    include: {
      _count: {
        select: {
          tracks: true,
          likes: true,
        },
      },
    },
  });

  // Fetch liked collections (not owned by user, and must be public)
  const likedCollections = await this.prisma.collectionLike.findMany({
    where: {
      userId,
      collection: {
        isDeleted: false,
        isPublic: true, // Only public liked collections
        userId: { not: userId }, // Exclude owned
        ...(type ? { type: type as CollectionType } : {}),
      },
    },
    include: {
      collection: {
        include: {
          _count: {
            select: {
              tracks: true,
              likes: true,
            },
          },
        },
      },
    },
  });

  // Combine and deduplicate (prefer owned)
  const collectionMap = new Map();

  // Add owned first
  ownedCollections.forEach((c) => {
    collectionMap.set(c.id, { ...c, isMine: true, isLiked: false });
  });

  // Add liked (only if not already owned)
  likedCollections.forEach((like) => {
    if (!collectionMap.has(like.collection.id)) {
      collectionMap.set(like.collection.id, {
        ...like.collection,
        isMine: false,
        isLiked: true,
      });
    }
  });

  // Convert to array and sort by createdAt desc
  const allCollections = Array.from(collectionMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Paginate
  const total = allCollections.length;
  const paginatedCollections = allCollections.slice(skip, skip + limit);

  // Add repostsCount and ownerFollowerCount for each
  const collectionsWithCounts = await Promise.all(
    paginatedCollections.map(async (c) => {
      const repostsCount = await this.prisma.repost.count({
        where: {
          track: {
            collectionTracks: {
              some: { collectionId: c.id },
            },
          },
        },
      });

      const ownerFollowerCount = await this.prisma.follow.count({
        where: { followingId: c.userId },
      });

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        type: c.type,
        privacy: c.isPublic ? 'public' : 'private',
        coverUrl: c.coverUrl,
        trackCount: c._count.tracks,
        likeCount: c._count.likes,
        repostsCount,
        ownerFollowerCount,
        isMine: c.isMine,
        isLiked: c.isLiked,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    }),
  );

  return {
    data: collectionsWithCounts,
    total,
    page,
    limit,
    hasMore: skip + limit < total,
  };
}

async getCollectionById(collectionId: string, userId?: string) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
    include: {
      _count: {
        select: {
          tracks: true,
          likes: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          _count: {
            select: {
              followers: true,
            },
          },
        },
      },
    },
  });

  // 404 if not found
  if (!collection) throw new NotFoundException('Collection not found');

  // Private collection — only owner can see it (no secret token path here)
  if (!collection.isPublic && collection.userId !== userId) {
    throw new NotFoundException('Collection not found');
  }

  const [repostsCount, isLiked] = await Promise.all([
    this.prisma.repost.count({
      where: {
        track: {
          collectionTracks: {
            some: { collectionId: collection.id },
          },
        },
      },
    }),
    userId
      ? this.prisma.collectionLike.findFirst({
          where: { collectionId: collection.id, userId },
        }).then((like) => !!like)
      : Promise.resolve(false),
  ]);

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    type: collection.type,
    privacy: collection.isPublic ? 'public' : 'private',
    coverUrl: collection.coverUrl,
    trackCount: collection._count.tracks,
    likeCount: collection._count.likes,
    repostsCount,
    ownerFollowerCount: collection.user._count.followers,
    isLiked,
    owner: {
      ...collection.user,
      followerCount: collection.user._count.followers,
    },
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}


async getCollectionByToken(token: string) {
  const collection = await this.prisma.collection.findFirst({
    where: { secretToken: token, isDeleted: false },
    include: {
      _count: {
        select: {
          tracks: true,
          likes: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          _count: {
            select: {
              followers: true,
            },
          },
        },
      },
    },
  });

  if (!collection) throw new NotFoundException('Collection not found');

  const [repostsCount, isLiked] = await Promise.all([
    this.prisma.repost.count({
      where: {
        track: {
          collectionTracks: {
            some: { collectionId: collection.id },
          },
        },
      },
    }),
    // For token access, userId is not available, so isLiked is false
    Promise.resolve(false),
  ]);

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    type: collection.type,
    privacy: 'private',
    coverUrl: collection.coverUrl,
    trackCount: collection._count.tracks,
    likeCount: collection._count.likes,
    repostsCount,
    ownerFollowerCount: collection.user._count.followers,
    isLiked,
    owner: {
      ...collection.user,
      followerCount: collection.user._count.followers,
    },
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}


async updateCollection(
  collectionId: string,
  userId: string,
  dto: UpdateCollectionDto,
  coverFile?: any,
) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });

  if (!collection) throw new NotFoundException('Collection not found');
  if (collection.userId !== userId) throw new NotFoundException('Collection not found');

  // Handle privacy change
  let secretToken = collection.secretToken;
  if (dto.privacy !== undefined) {
    const isPublic = dto.privacy === 'public';
    if (isPublic) {
      secretToken = null;
    } else if (!collection.secretToken) {
      // Was public, now going private — generate token
      secretToken = randomBytes(16).toString('hex');
    }
  }

  // Handle cover image - file upload takes precedence over direct URL
  let coverUrl = collection.coverUrl;
  if (coverFile) {
    coverUrl = await this.storage.uploadImage(coverFile);
  } else if (dto.coverUrl !== undefined) {
    coverUrl = dto.coverUrl;
  }

  const updated = await this.prisma.collection.update({
    where: { id: collectionId },
    data: {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.privacy !== undefined && { isPublic: dto.privacy === 'public' }),
      secretToken,
      coverUrl,
    },
  });

  try {
    await this.searchIndex.indexCollection(updated.id);
  } catch {
    // OpenSearch unavailable — skip silently
  }

  return {
    id: updated.id,
    title: updated.title,
    description: updated.description,
    type: updated.type,
    privacy: updated.isPublic ? 'public' : 'private',
    secretToken: updated.isPublic ? null : updated.secretToken,
    coverUrl: updated.coverUrl,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}


async deleteCollection(collectionId: string, userId: string) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });

  if (!collection) throw new NotFoundException('Collection not found');
  if (collection.userId !== userId) throw new NotFoundException('Collection not found');

  // Hard delete — order matters: likes → tracks → collection
  await this.prisma.collectionLike.deleteMany({
    where: { collectionId },
  });

  await this.prisma.collectionTrack.deleteMany({
    where: { collectionId },
  });

  await this.prisma.collection.delete({
    where: { id: collectionId },
  });

  try {
    await this.searchIndex.removeCollection(collectionId);
  } catch {
    // OpenSearch unavailable — skip silently
  }

  return { message: 'Collection deleted successfully' };
}


async getCollectionTracks(
  collectionId: string,
  userId: string | undefined,
  page: number,
  limit: number,
) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });

  if (!collection) throw new NotFoundException('Collection not found');

  if (!collection.isPublic && collection.userId !== userId) {
    throw new NotFoundException('Collection not found');
  }

  const skip = (page - 1) * limit;

  const [collectionTracks, total] = await Promise.all([
    this.prisma.collectionTrack.findMany({
      where: { collectionId },
      skip,
      take: limit,
      orderBy: { position: 'asc' },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            durationSeconds: true,
            coverUrl: true,
            genreId: true,
            isPublic: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            _count: {
              select: {
                playHistory: true,
              },
            },
          },
        },
      },
    }),
    this.prisma.collectionTrack.count({ where: { collectionId } }),
  ]);

  return {
    data: collectionTracks.map((ct) => ({
      position: ct.position,
      addedAt: ct.addedAt.toISOString(),
      track: {
        ...ct.track,
        playCount: ct.track._count.playHistory,
      },
    })),
    total,
    page,
    limit,
    hasMore: skip + collectionTracks.length < total,
  };
}


async addTrack(collectionId: string, userId: string, dto: AddTrackDto) {
  // 1. Verify collection exists and user is owner
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, userId, isDeleted: false },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  // 2. Verify track exists and is not deleted
  const track = await this.prisma.track.findFirst({
    where: { id: dto.trackId, isDeleted: false },
  });
  if (!track) throw new NotFoundException('Track not found');

  // 3. Album rule: track must belong to the owner
  if (collection.type === 'ALBUM' && track.userId !== userId) {
    throw new BadRequestException('Album can only contain your own tracks');
  }

  // 4. Check duplicate
  const existing = await this.prisma.collectionTrack.findFirst({
    where: { collectionId, trackId: dto.trackId },
  });
  if (existing) throw new BadRequestException('Track already in collection');

  // 5. Calculate next position
  const maxPos = await this.prisma.collectionTrack.aggregate({
    where: { collectionId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? 0) + 1;

  // 6. Create
  const collectionTrack = await this.prisma.collectionTrack.create({
    data: { collectionId, trackId: dto.trackId, position },
  });

  // 7. Re-index
  try {
    await this.searchIndex.indexCollection(collectionId);
  } catch { /* OpenSearch unavailable */ }

  return collectionTrack;
}



async removeTrack(collectionId: string, userId: string, dto: AddTrackDto) {
  // 1. Verify collection exists and user is owner
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, userId, isDeleted: false },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  // 2. Verify track is in collection
  const collectionTrack = await this.prisma.collectionTrack.findFirst({
    where: { collectionId, trackId: dto.trackId },
  });
  if (!collectionTrack) throw new NotFoundException('Track not in collection');

  // 3. Delete it
  await this.prisma.collectionTrack.delete({
    where: { id: collectionTrack.id },
  });

  // 4. Re-normalize positions
  const remaining = await this.prisma.collectionTrack.findMany({
    where: { collectionId },
    orderBy: { position: 'asc' },
  });

  await this.prisma.$transaction(
    remaining.map((ct, index) =>
      this.prisma.collectionTrack.update({
        where: { id: ct.id },
        data: { position: index + 1 },
      }),
    ),
  );

  // 5. Re-index
  try {
    await this.searchIndex.indexCollection(collectionId);
  } catch { /* OpenSearch unavailable */ }

  return { message: 'Track removed successfully' };
}


async reorderTracks(collectionId: string, userId: string, dto: ReorderTracksDto) {
  // 1. Verify collection exists and user is owner
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, userId, isDeleted: false },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  // 2. Get current tracks
  const currentTracks = await this.prisma.collectionTrack.findMany({
    where: { collectionId },
  });

  // 3. Verify same set of tracks
  const currentIds = currentTracks.map((ct) => ct.trackId).sort();
  const incomingIds = [...dto.trackIds].sort();
  const same =
    currentIds.length === incomingIds.length &&
    currentIds.every((id, i) => id === incomingIds[i]);

  if (!same) {
    throw new BadRequestException(
      'trackIds must contain exactly the current tracks in the collection',
    );
  }

  // 4. Build a map: trackId -> collectionTrack.id
  const trackMap = new Map(currentTracks.map((ct) => [ct.trackId, ct.id]));

  // 5. Update positions in a transaction
  await this.prisma.$transaction(
    dto.trackIds.map((trackId, index) =>
      this.prisma.collectionTrack.update({
        where: { id: trackMap.get(trackId) },
        data: { position: index + 1 },
      }),
    ),
  );

  // 6. Re-index
  try {
    await this.searchIndex.indexCollection(collectionId);
  } catch { /* OpenSearch unavailable */ }

  return { message: 'Tracks reordered successfully' };
}




async likeCollection(collectionId: string, userId: string) {
  // 1. Verify collection exists
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  // 2. Check duplicate like
  const existing = await this.prisma.collectionLike.findFirst({
    where: { collectionId, userId },
  });
  if (existing) throw new BadRequestException('Already liked');

  // 3. Create like
  await this.prisma.collectionLike.create({
    data: { collectionId, userId },
  });

  return { message: 'Collection liked' };
}



async unlikeCollection(collectionId: string, userId: string) {
  // 1. Verify collection exists
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  // 2. Verify like exists
  const like = await this.prisma.collectionLike.findFirst({
    where: { collectionId, userId },
  });
  if (!like) throw new NotFoundException('Like not found');

  // 3. Delete like
  await this.prisma.collectionLike.delete({
    where: { id: like.id },
  });

  return { message: 'Collection unliked' };
}





async getEmbed(collectionId: string) {
  // 1. Verify collection exists and is public
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false, isPublic: true },
  });
  if (!collection) throw new NotFoundException('Collection not found');

  return {
    embedCode: `<iframe src="https://tunify.duckdns.org/embed/collections/${collectionId}" width="100%" height="166" frameborder="0"></iframe>`,
  };
}




async getShareUrl(collectionId: string, userId: string) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });

  if (!collection) throw new NotFoundException('Collection not found');
  if (collection.userId !== userId) throw new ForbiddenException('Access denied');

  const frontendUrl = process.env.FRONTEND_URL || 'https://tunify.duckdns.org';
  let shareUrl: string;
  const appUrl = `tunify://collections/${collectionId}`;

  if (collection.isPublic) {
    shareUrl = `${frontendUrl}/collections/${collectionId}`;
  } else {
    // Ensure token exists for private collections
    let token = collection.secretToken;
    if (!token) {
      token = randomBytes(16).toString('hex');
      await this.prisma.collection.update({
        where: { id: collectionId },
        data: { secretToken: token },
      });
    }
    shareUrl = `${frontendUrl}/collections/${collectionId}?token=${token}`;
  }


  return { shareUrl, appUrl };
}

async resetShareToken(collectionId: string, userId: string) {
  const collection = await this.prisma.collection.findFirst({
    where: { id: collectionId, isDeleted: false },
  });

  if (!collection) throw new NotFoundException('Collection not found');
  if (collection.userId !== userId) throw new ForbiddenException('Access denied');

  const newToken = randomBytes(16).toString('hex');
  const frontendUrl = process.env.FRONTEND_URL || 'https://tunify.duckdns.org';

  await this.prisma.collection.update({
    where: { id: collectionId },
    data: { secretToken: newToken, isPublic: false },
  });

  const shareUrl = `${frontendUrl}/collections/${collectionId}?token=${newToken}`;
  const appUrl = `tunify://collections/${collectionId}`;

  return { shareUrl, appUrl };
}

}