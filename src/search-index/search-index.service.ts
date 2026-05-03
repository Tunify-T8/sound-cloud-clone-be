import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OpensearchService } from 'src/opensearch/opensearch.service';
import { SEARCH_INDEXES } from 'src/search/constants/search.constants';
import {
  usersIndexMapping,
  tracksIndexMapping,
  collectionsIndexMapping,
} from 'src/search/constants/search.mappings';

@Injectable()
export class SearchIndexService {
  private readonly logger = new Logger(SearchIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openSearch: OpensearchService,
  ) {}

  // runs automatically when the module initializes
  async onModuleInit(): Promise<void> {
    try {
      await this.initIndexes();
    } catch (err) {
      this.logger.warn(
        'OpenSearch unavailable — skipping index initialization. Search features will not work.',
      );
      this.logger.debug(err);
    }
  }

  async initIndexes(): Promise<void> {
    const indexes = [
      { name: SEARCH_INDEXES.USERS, mapping: usersIndexMapping },
      { name: SEARCH_INDEXES.TRACKS, mapping: tracksIndexMapping },
      { name: SEARCH_INDEXES.COLLECTIONS, mapping: collectionsIndexMapping },
    ];

    for (const index of indexes) {
      const exists = await this.openSearch.indexExists(index.name);
      if (!exists) {
        await this.openSearch.createIndex(index.name, index.mapping);
        this.logger.log(`Created index: ${index.name}`);
      }
    }
  }

  // ── Tracks ────────────────────────────────────────────────────

  async indexTrack(trackId: string): Promise<void> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        title: true,
        description: true,
        coverUrl: true,
        durationSeconds: true,
        allowDownloads: true,
        createdAt: true,
        isDeleted: true,
        isHidden: true,
        isPublic: true,
        tags: { select: { tag: true } },
        genre: { select: { label: true } },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            isCertified: true,
          },
        },
        _count: { select: { likes: true, playHistory: true, reposts: true } },
      },
    });

    if (!track || track.isDeleted || track.isHidden || !track.isPublic) return;

    await this.openSearch.indexDocument(SEARCH_INDEXES.TRACKS, track.id, {
      id: track.id,
      title: track.title,
      description: track.description ?? null,
      coverUrl: track.coverUrl ?? null,
      tags: track.tags.map((t) => t.tag),
      genre: track.genre?.label ?? null,
      durationSeconds: track.durationSeconds,
      allowDownloads: track.allowDownloads,
      createdAt: track.createdAt.toISOString(),
      likesCount: track._count.likes,
      playsCount: track._count.playHistory,
      repostsCount: track._count.reposts,
      artistId: track.user.id,
      artistUsername: track.user.username,
      artistDisplayName: track.user.displayName ?? null,
      artistIsCertified: track.user.isCertified,
    });
  }

  async removeTrack(trackId: string): Promise<void> {
    await this.openSearch.deleteDocument(SEARCH_INDEXES.TRACKS, trackId);
  }

  async reindexAllTracks(): Promise<void> {
    const tracks = await this.prisma.track.findMany({
      where: { isDeleted: false, isHidden: false, isPublic: true },
      select: { id: true },
    });

    const operations = await Promise.all(
      tracks.map(async (t) => {
        const track = await this.prisma.track.findUnique({
          where: { id: t.id },
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            durationSeconds: true,
            allowDownloads: true,
            createdAt: true,
            tags: { select: { tag: true } },
            genre: { select: { label: true } },
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                isCertified: true,
              },
            },
            _count: { select: { likes: true, playHistory: true } },
          },
        });
        if (!track) return null;
        return [
          { index: { _index: SEARCH_INDEXES.TRACKS, _id: track.id } },
          {
            id: track.id,
            title: track.title,
            description: track.description ?? null,
            coverUrl: track.coverUrl ?? null,
            tags: track.tags.map((tg) => tg.tag),
            genre: track.genre?.label ?? null,
            durationSeconds: track.durationSeconds,
            allowDownloads: track.allowDownloads,
            createdAt: track.createdAt.toISOString(),
            likesCount: track._count.likes,
            playsCount: track._count.playHistory,
            artistId: track.user.id,
            artistUsername: track.user.username,
            artistDisplayName: track.user.displayName ?? null,
            artistIsCertified: track.user.isCertified,
          },
        ];
      }),
    );

    const flat = operations.filter(Boolean).flat();
    if (flat.length > 0) await this.openSearch.bulkIndex(flat);
    this.logger.log(`Reindexed ${tracks.length} tracks`);
  }

  // ── Users ─────────────────────────────────────────────────────

  async indexUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        location: true,
        isCertified: true,
        isSuspended: true,
        suspendedUntil: true,
        role: true,
        createdAt: true,
        _count: { select: { followers: true } },
        avatarUrl: true,
      },
    });

    if (!user) return;

    await this.openSearch.indexDocument(SEARCH_INDEXES.USERS, user.id, {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      location: user.location ?? null,
      isCertified: user.isCertified,
      isSuspended: user.isSuspended,
      suspendedUntil: user.suspendedUntil ?? null,
      role: user.role,
      followersCount: user._count.followers,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.avatarUrl ?? null,
    });
  }

  async removeUser(userId: string): Promise<void> {
    await this.openSearch.deleteDocument(SEARCH_INDEXES.USERS, userId);
  }

  async reindexAllUsers(): Promise<void> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        location: true,
        isCertified: true,
        isSuspended: true,
        suspendedUntil: true,
        role: true,
        createdAt: true,
        _count: { select: { followers: true } },
        avatarUrl: true,
      },
    });

    const operations = users.flatMap((u) => [
      { index: { _index: SEARCH_INDEXES.USERS, _id: u.id } },
      {
        id: u.id,
        username: u.username,
        displayName: u.displayName ?? null,
        bio: u.bio ?? null,
        location: u.location ?? null,
        isCertified: u.isCertified,
        isSuspended: u.isSuspended,
        suspendedUntil: u.suspendedUntil ?? null,
        role: u.role,
        followersCount: u._count.followers,
        createdAt: u.createdAt.toISOString(),
        avatarUrl: u.avatarUrl ?? null,
      },
    ]);

    if (operations.length > 0) await this.openSearch.bulkIndex(operations);
    this.logger.log(`Reindexed ${users.length} users`);
  }

  // ── Collections ───────────────────────────────────────────────

  async indexCollection(collectionId: string): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        coverUrl: true,
        createdAt: true,
        isDeleted: true,
        isPublic: true,
        user: { select: { id: true, username: true, displayName: true } },
        _count: { select: { tracks: true } },
      },
    });

    if (!collection || collection.isDeleted || !collection.isPublic) return;

    await this.openSearch.indexDocument(
      SEARCH_INDEXES.COLLECTIONS,
      collection.id,
      {
        id: collection.id,
        title: collection.title,
        description: collection.description ?? null,
        type: collection.type,
        coverUrl: collection.coverUrl ?? null,
        trackCount: collection._count.tracks,
        createdAt: collection.createdAt.toISOString(),
        artistId: collection.user.id,
        artistUsername: collection.user.username,
        artistDisplayName: collection.user.displayName ?? null,
      },
    );
  }
  async removeCollection(collectionId: string): Promise<void> {
    await this.openSearch.deleteDocument(
      SEARCH_INDEXES.COLLECTIONS,
      collectionId,
    );
  }

  async reindexAllCollections(): Promise<void> {
    const collections = await this.prisma.collection.findMany({
      where: { isDeleted: false, isPublic: true },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        coverUrl: true,
        createdAt: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });

    const operations = collections.flatMap((c) => [
      { index: { _index: SEARCH_INDEXES.COLLECTIONS, _id: c.id } },
      {
        id: c.id,
        title: c.title,
        description: c.description ?? null,
        type: c.type,
        coverUrl: c.coverUrl ?? null,
        createdAt: c.createdAt.toISOString(),
        artistId: c.user.id,
        artistUsername: c.user.username,
        artistDisplayName: c.user.displayName ?? null,
      },
    ]);

    if (operations.length > 0) await this.openSearch.bulkIndex(operations);
    this.logger.log(`Reindexed ${collections.length} collections`);
  }

  //----delete all

  async deleteIndex(indexName: string): Promise<void> {
    const exists = await this.openSearch.indexExists(indexName);
    if (exists) {
      await this.openSearch.deleteIndex(indexName);
      this.logger.log(`Deleted index: ${indexName}`);
    }
  }
}
