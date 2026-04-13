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

    // 2. Paywall check — free users max 10 playlists
    const maxFreeCollections = parseInt(
      process.env.MAX_FREE_COLLECTIONS ?? '10',
    );
    const isPremium = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        plan: { name: { in: ['PRO', 'GOPLUS'] } },
      },
    });

    if (!isPremium) {
      const count = await this.prisma.collection.count({
        where: { userId, isDeleted: false },
      });
      if (count >= maxFreeCollections) {
        throw new BadRequestException(
          `Free users can only create up to ${maxFreeCollections} collections`,
        );
      }
    }

    // 3. Upload cover image if provided
    let coverUrl: string | null = null;
    if (coverFile) {
      coverUrl = await this.storage.uploadImage(coverFile);
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

  const where: any = {
    userId,
    isDeleted: false,
    ...(type ? { type: type as CollectionType } : {}),
  };

  const [collections, total] = await Promise.all([
    this.prisma.collection.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
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
      type: c.type,
      privacy: c.isPublic ? 'public' : 'private',
      coverUrl: c.coverUrl,
      trackCount: c._count.tracks,
      likeCount: c._count.likes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    hasMore: skip + collections.length < total,
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

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    type: collection.type,
    privacy: collection.isPublic ? 'public' : 'private',
    coverUrl: collection.coverUrl,
    trackCount: collection._count.tracks,
    likeCount: collection._count.likes,
    owner: collection.user,
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
        },
      },
    },
  });

  if (!collection) throw new NotFoundException('Collection not found');

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    type: collection.type,
    privacy: 'private',
    coverUrl: collection.coverUrl,
    trackCount: collection._count.tracks,
    likeCount: collection._count.likes,
    owner: collection.user,
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

  // Handle cover image upload
  let coverUrl = collection.coverUrl;
  if (coverFile) {
    coverUrl = await this.storage.uploadImage(coverFile);
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


}