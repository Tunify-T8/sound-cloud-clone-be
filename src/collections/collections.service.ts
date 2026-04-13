import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SearchIndexService } from '../search-index/search-index.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionType } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class CollectionsService {
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
}