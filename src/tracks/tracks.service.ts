import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackMultipartDto } from './dto/update-track-multipart.dto';
import type { Queue } from 'bull';
import { randomBytes } from 'crypto';
import type { Prisma, FileFormat, TranscodingStatus } from '@prisma/client';
import { SearchIndexService } from '../search-index/search-index.service';

interface PlayabilityResult {
  status: 'playable' | 'preview' | 'blocked';
  blockedReason: string | null;
  previewStartSeconds?: number;
  previewDurationSeconds?: number;
}

export interface QueueTrack {
  trackId: string;
  title: string;
  artist: string;
  durationSeconds: number;
}

@Injectable()
export class TracksService {
  constructor(
    private storage: StorageService,
    private audio: AudioService,
    private prisma: PrismaService,
    private readonly searchIndexService: SearchIndexService,
    @InjectQueue('tracks') private tracksQueue: Queue,
  ) {}

  private async resolvePlayability(
    track: {
      transcodingStatus: TranscodingStatus;
      isDeleted: boolean;
      isHidden: boolean;
      isPublic: boolean;
      privateToken: string | null;
      requiresPremium: boolean;
      releaseDate: Date | null;
      previewEnabled: boolean;
      previewStart: number | null;
      previewDuration: number | null;
      regionRestrictions: { countryCode: string }[];
    },
    userId: string,
    privateToken?: string,
    userCountryCode?: string,
  ): Promise<PlayabilityResult> {
    // 1. Deleted
    if (track.isDeleted) {
      return { status: 'blocked', blockedReason: 'deleted' };
    }

    // 2. Hidden by admin
    if (track.isHidden) {
      return { status: 'blocked', blockedReason: 'hidden' };
    }

    // 3. Transcoding not finished
    if (track.transcodingStatus === 'processing') {
      return { status: 'blocked', blockedReason: 'processing' };
    }

    if (track.transcodingStatus === 'failed') {
      return { status: 'blocked', blockedReason: 'processing_failed' };
    }

    // 4. Private track — check token
    if (!track.isPublic) {
      if (!privateToken || privateToken !== track.privateToken) {
        return { status: 'blocked', blockedReason: 'private_no_token' };
      }
    }

    // 5. Scheduled release
    if (track.releaseDate && track.releaseDate > new Date()) {
      return { status: 'blocked', blockedReason: 'scheduled_release' };
    }

    // 6. Region restriction
    if (track.regionRestrictions.length > 0 && userCountryCode) {
      const isRestricted = track.regionRestrictions.some(
        (r) => r.countryCode === userCountryCode,
      );
      if (isRestricted) {
        return { status: 'blocked', blockedReason: 'region_restricted' };
      }
    }

    // 7. Premium required
    if (track.requiresPremium) {
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          userId,
          status: 'active',
          plan: { name: { in: ['PRO', 'GOPLUS'] } },
        },
      });
      if (!subscription) {
        return { status: 'blocked', blockedReason: 'tier_restricted' };
      }
    }

    // 8. Preview
    if (
      track.previewEnabled &&
      track.previewStart !== null &&
      track.previewDuration !== null
    ) {
      return {
        status: 'preview',
        blockedReason: null,
        previewStartSeconds: track.previewStart,
        previewDurationSeconds: track.previewDuration,
      };
    }

    // 9. Fully playable
    return { status: 'playable', blockedReason: null };
  }

  async getTrackPlaybackBundle(
    trackId: string,
    userId: string,
    privateToken?: string,
  ) {
    // 1. Fetch track with everything resolvePlayability needs
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        regionRestrictions: true,
        genre: true,
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
            likes: true,
            comments: true,
            reposts: true,
          },
        },
      },
    });

    if (!track) throw new NotFoundException('Track not found');

    // 2. Resolve playability
    const playability = await this.resolvePlayability(
      track,
      userId,
      privateToken,
    );

    // 3. Check if authenticated user has liked/reposted/saved this track
    const [userLike, userRepost, userSave] = await Promise.all([
      this.prisma.trackLike.findFirst({
        where: { userId, trackId },
      }),
      this.prisma.repost.findFirst({
        where: { userId, trackId },
      }),
      this.prisma.collectionTrack.findFirst({
        where: {
          trackId,
          collection: { userId },
        },
      }),
    ]);

    return {
      trackId: track.id,
      title: track.title,
      artist: {
        id: track.user.id,
        username: track.user.username,
        displayName: track.user.displayName,
        avatarUrl: track.user.avatarUrl,
      },
      durationSeconds: track.durationSeconds,
      waveformUrl: track.waveformUrl ?? null,
      coverUrl: track.coverUrl ?? null,
      contentWarning: track.contentWarning,
      engagement: {
        likeCount: track._count.likes,
        commentCount: track._count.comments,
        repostCount: track._count.reposts,
        isLiked: !!userLike,
        isReposted: !!userRepost,
        isSaved: !!userSave,
      },
      playability: {
        status: playability.status,
        blockedReason: playability.blockedReason ?? null,
        regionBlocked: playability.blockedReason === 'region_restricted',
        tierBlocked: playability.blockedReason === 'tier_restricted',
        requiresSubscription: playability.blockedReason === 'tier_restricted',
      },
      preview: {
        enabled: track.previewEnabled,
        previewStartSeconds: track.previewStart ?? null,
        previewDurationSeconds: track.previewDuration ?? null,
      },
      scheduledReleaseDate: track.releaseDate?.toISOString() ?? null,
    };
  }

  async create(
    userId: string,
    dto: CreateTrackDto,
    artworkFile?: Express.Multer.File,
  ) {
    const genre = dto.genre
      ? await this.prisma.genre.upsert({
          where: { label: dto.genre },
          update: {},
          create: { label: dto.genre },
        })
      : null;

    const isPublic = dto.privacy === 'public';

    let coverUrl: string | null = null;
    if (artworkFile) {
      coverUrl = await this.storage.uploadImage(artworkFile);
    }

    const track = await this.prisma.track.create({
      data: {
        userId: userId,
        title: dto.title,
        description: dto.description,
        genreId: genre?.id,
        isPublic,
        privateToken: isPublic ? null : randomBytes(16).toString('hex'),
        contentWarning: dto.contentWarning ?? false,
        releaseDate: dto.scheduledReleaseDate
          ? new Date(dto.scheduledReleaseDate)
          : null,
        transcodingStatus: 'processing',
        audioUrl: '',
        durationSeconds: 0,
        fileFormat: 'mp3',
        fileSizeBytes: null,
        coverUrl: coverUrl,
      },
    });

    // save tags if any were provided
    if (dto.tags && dto.tags.length > 0) {
      await this.prisma.trackTag.createMany({
        data: dto.tags.map((tag) => ({
          trackId: track.id,
          tag: tag.toLowerCase().trim(), // normalize tags
        })),
      });
    }

    if (dto.artists && dto.artists.length > 0) {
      await Promise.all(
        dto.artists.map((artistName) =>
          this.prisma.trackArtist.create({
            data: {
              trackId: track.id,
              name: artistName,
              role: 'featured',
            },
          }),
        ),
      );
    }

    if (
      dto.availability?.type === 'specific_regions' &&
      dto.availability.regions.length > 0
    ) {
      await this.prisma.trackRegionRestriction.createMany({
        data: dto.availability.regions.map((countryCode) => ({
          trackId: track.id,
          countryCode,
        })),
      });
    }

    const trackWithRelations = await this.prisma.track.findUnique({
      where: { id: track.id },
      include: {
        trackArtists: true,
        regionRestrictions: true,
        tags: true,
      },
    });

    if (!trackWithRelations) {
      throw new NotFoundException('Track not found after creation');
    }

    await this.searchIndexService.indexTrack(track.id);

    // Return formatted response matching getTrack() format
    return {
      id: trackWithRelations.id,
      status: trackWithRelations.transcodingStatus,
      title: trackWithRelations.title,
      description: trackWithRelations.description || null,
      tags: trackWithRelations.tags.map((t) => t.tag),
      artists: trackWithRelations.trackArtists.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
      })),
      genre: genre,
      scheduledReleaseDate:
        trackWithRelations.releaseDate?.toISOString() ?? null,
      durationSeconds: trackWithRelations.durationSeconds,
      privacy: trackWithRelations.isPublic ? 'public' : 'private',
      availability: {
        type:
          trackWithRelations.regionRestrictions.length > 0
            ? 'specific_regions'
            : 'worldwide',
        regions: trackWithRelations.regionRestrictions.map(
          (r) => r.countryCode,
        ),
      },
      audioUrl: trackWithRelations.audioUrl,
      waveformUrl: trackWithRelations.waveformUrl || null,
      artworkUrl: trackWithRelations.coverUrl || null,
      createdAt: trackWithRelations.createdAt.toISOString(),
      updatedAt: trackWithRelations.updatedAt.toISOString(),
      contentWarning: trackWithRelations.contentWarning,
    };
  }

  async getMyTracks(userId: string) {
    const tracks = await this.prisma.track.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      include: {
        tags: true,
        user: {
          select: { username: true },
        },
        genre: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
            playHistory: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.user.username,
      genre: track.genre?.label ?? null,
      tags: track.tags.map((t) => t.tag),
      status: track.transcodingStatus,
      visibility: track.isPublic ? 'public' : 'private',
      audioUrl: track.audioUrl,
      description: track.description ?? null,
      waveformUrl: track.waveformUrl ?? null,
      duration: track.durationSeconds,
      date: track.createdAt.toISOString(),
      likes: track._count.likes,
      comments: track._count.comments,
      reposts: track._count.reposts,
      plays: track._count.playHistory,
      isPrivate: !track.isPublic,
      thumbnailUrl: track.coverUrl ?? null,
    }));
  }

  async uploadAudio(
    trackId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    // 1. find track
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    // 2. check exists
    if (!track) throw new NotFoundException('Track not found');

    // 3. check ownership
    if (track.userId !== userId) throw new ForbiddenException();

    // 4. get extension
    const extension = file.originalname.split('.').pop();

    // 5. update track in DB

    await this.prisma.track.update({
      where: { id: trackId },
      data: {
        fileFormat: extension !== 'mp3' ? (extension as FileFormat) : 'mp3',
        fileSizeBytes: file.size,
        transcodingStatus: 'processing',
      },
    });

    // 8. add job to queue — don't await, return immediately
    this.tracksQueue
      .add('process-track', {
        trackId,
        fileBuffer: file.buffer,
        extension,
      })
      .then((job) => {
        console.log('Job added successfully, job id:', job.id);
      })
      .catch((error: unknown) => {
        console.error('Failed to queue track processing:', error);
      });

    return { message: 'Audio upload received, processing in background' };
  }

  async getStatus(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        transcodingStatus: true,
        durationSeconds: true,
        audioUrl: true,
        waveformUrl: true,
      },
    });

    if (!track) throw new NotFoundException('Track not found');

    return track;
  }

  async getTrack(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        trackArtists: true,
        regionRestrictions: true,
        tags: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
            playHistory: true,
          },
        },
      },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    if (track.isDeleted) {
      throw new NotFoundException('Track was deleted');
    }

    const genre = track.genreId
      ? await this.prisma.genre.findUnique({
          where: { id: track.genreId },
        })
      : null;
    const subgenre = track.subGenreId
      ? await this.prisma.subGenre.findUnique({
          where: { id: track.subGenreId },
        })
      : null;

    const trackLikes = await this.prisma.trackLike.findMany({
      where: { trackId: trackId },
    });

    const likedUsers = await this.prisma.user.findMany({
      where: { id: { in: trackLikes.map((like) => like.userId) } },
    });

    const trackReposts = await this.prisma.repost.findMany({
      where: { trackId: trackId },
    });

    const repostedUsers = await this.prisma.user.findMany({
      where: { id: { in: trackReposts.map((repost) => repost.userId) } },
    });

    const trackComments = await this.prisma.comment.findMany({
      where: { trackId: trackId },
    });

    const filteredTrack = {
      trackId: track.id,
      status: track.transcodingStatus,
      title: track.title,
      description: track.description || null,
      genre: genre
        ? {
            category: genre.label,
            subGenre: subgenre?.name || null,
          }
        : null,
      tags: track.tags.map((t) => t.tag),
      artists: track.trackArtists,
      privateToken: track.isPublic ? null : track.privateToken,
      durationSeconds: track.durationSeconds,
      privacy: track.isPublic ? 'public' : 'private',
      scheduledReleaseDate: track.releaseDate?.toISOString() || null,
      likes: {
        count: track._count.likes,
        users: likedUsers.map((user) => ({
          username: user.username,
          timestamp:
            trackLikes
              .find((like) => like.userId === user.id)
              ?.createdAt.toISOString() || null,
        })),
      },
      reposts: {
        count: track._count.reposts,
        users: repostedUsers.map((user) => ({
          username: user.username,
          timestamp:
            trackReposts
              .find((repost) => repost.userId === user.id)
              ?.createdAt.toISOString() || null,
        })),
      },
      comments: {
        count: track._count.comments,
        data: trackComments.map((comment) => ({
          id: comment.id,
          userId: comment.userId,
          text: comment.content,
          timestamp: comment.createdAt.toISOString(),
        })),
      },
      plays_count: track._count.playHistory,
      availability: {
        type: 'worldwide',
        regions: track.regionRestrictions?.map((r) => r.countryCode) || [],
      },
      licensing: {
        type: 'creative_commons',
        allowAttribution: true,
        nonCommercial: true,
        noDerivatives: false,
        shareAlike: true,
      },
      recordLabel: track.recordLabel || null,
      publisher: track.publisher || null,
      isrc: track.isrc || null,
      pLine: track.pLine || null,
      contentWarning: track.contentWarning,
      permissions: {
        enableDirectDownloads: track.allowDownloads,
        enableOfflineListening: track.allowOffline,
        includeInRSS: track.includeInRSS,
        displayEmbedCode: track.displayEmbedCode,
        enableAppPlayback: track.enableAppPlayback,
        allowComments: track.allowComments,
        showCommentsPublic: track.showCommentsPublic,
        showInsightsPublic: track.showInsightsPublic,
      },
      audioUrl: track.audioUrl,
      waveformUrl: track.waveformUrl || null,
      artworkUrl: track.coverUrl || null,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
      audioMetadata: {
        bitrateKbps: track.bitrateKbps,
        sampleRateHz: track.sampleRateHz,
        format: track.fileFormat,
        fileSizeBytes: track.fileSizeBytes || 0,
      },
    };
    return filteredTrack;
  }

  async updateTrack(
    trackId: string,
    userId: string,
    dto: UpdateTrackMultipartDto,
    artworkFile?: Express.Multer.File,
  ) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
      include: {
        trackArtists: true,
        regionRestrictions: true,
      },
    });

    // 2. Check if track exists
    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // 3. Check ownership
    if (track.userId !== userId) {
      throw new ForbiddenException('You can only update your own tracks');
    }

    // 4. Prepare update data

    const updateData: Prisma.TrackUpdateInput = {};

    // Update title if provided
    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }

    // Update genre if provided
    if (dto.genre) {
      const genreRecord = await this.prisma.genre.upsert({
        where: { label: dto.genre },
        update: {},
        create: { label: dto.genre },
      });
      updateData.genre = { connect: { id: genreRecord.id } };
    }

    // Update tags
    if (dto.tags !== undefined) {
      await this.prisma.trackTag.deleteMany({ where: { trackId } });

      if (dto.tags.length > 0) {
        await this.prisma.trackTag.createMany({
          data: dto.tags.map((tag) => ({
            trackId,
            tag: tag.toLowerCase().trim(),
          })),
        });
      }
    }

    // Update description
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    // Update privacy
    if (dto.privacy !== undefined) {
      updateData.isPublic = dto.privacy === 'public';
    }

    // Update record label
    if (dto.recordLabel !== undefined) {
      updateData.recordLabel = dto.recordLabel;
    }

    // Update publisher
    if (dto.publisher !== undefined) {
      updateData.publisher = dto.publisher;
    }

    if (dto.isrc !== undefined) {
      updateData.isrc = dto.isrc;
    }

    if (dto.pLine !== undefined) {
      updateData.pLine = dto.pLine;
    }

    // Update content warning
    if (dto.contentWarning !== undefined) {
      updateData.contentWarning = dto.contentWarning;
    }

    // Update scheduled release date
    if (dto.scheduledReleaseDate !== undefined) {
      updateData.releaseDate = new Date(dto.scheduledReleaseDate);
    }

    // Update artwork if provided
    if (artworkFile) {
      const artworkUrl = await this.storage.uploadImage(artworkFile);
      if (artworkUrl) {
        updateData.coverUrl = artworkUrl;
      }
    }

    // Update permissions fields
    if (dto.permissions) {
      if (dto.permissions.enableDirectDownloads !== undefined) {
        updateData.allowDownloads = dto.permissions.enableDirectDownloads;
      }
      if (dto.permissions.enableOfflineListening !== undefined) {
        updateData.allowOffline = dto.permissions.enableOfflineListening;
      }
      if (dto.permissions.includeInRSS !== undefined) {
        updateData.includeInRSS = dto.permissions.includeInRSS;
      }
      if (dto.permissions.displayEmbedCode !== undefined) {
        updateData.displayEmbedCode = dto.permissions.displayEmbedCode;
      }
      if (dto.permissions.enableAppPlayback !== undefined) {
        updateData.enableAppPlayback = dto.permissions.enableAppPlayback;
      }
      if (dto.permissions.allowComments !== undefined) {
        updateData.allowComments = dto.permissions.allowComments;
      }
      if (dto.permissions.showCommentsPublic !== undefined) {
        updateData.showCommentsPublic = dto.permissions.showCommentsPublic;
      }
      if (dto.permissions.showInsightsPublic !== undefined) {
        updateData.showInsightsPublic = dto.permissions.showInsightsPublic;
      }
    }

    // 5. Update the track
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _updatedTrack = await this.prisma.track.update({
      where: { id: trackId },
      data: updateData,
      include: {
        trackArtists: true,
        regionRestrictions: true,
      },
    });

    // 6. Update artists if provided
    // 6. Update artists if provided
    if (dto.artists !== undefined) {
      await this.prisma.trackArtist.deleteMany({
        where: { trackId },
      });

      if (dto.artists.length > 0) {
        await Promise.all(
          dto.artists.map((artistName) =>
            this.prisma.trackArtist.create({
              data: {
                trackId,
                name: artistName,
                role: 'featured',
              },
            }),
          ),
        );
      }
    }

    // 7. Update region restrictions if provided via availability
    if (dto.availability && dto.availability.regions) {
      // Delete existing region restrictions
      await this.prisma.trackRegionRestriction.deleteMany({
        where: { trackId },
      });

      // Create new restrictions
      if (dto.availability.regions.length > 0) {
        await Promise.all(
          dto.availability.regions.map((countryCode) =>
            this.prisma.trackRegionRestriction.create({
              data: {
                trackId,
                countryCode,
              },
            }),
          ),
        );
      }
    }

    // 8. Re-fetch the track with all relations to return updated data
    const updatedTrackFinal = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        trackArtists: true,
        regionRestrictions: true,
        tags: true,
      },
    });

    // Check if track was found after update
    if (!updatedTrackFinal) {
      throw new NotFoundException('Track not found after update');
    }

    // 9. Get genre info for response
    const genre = updatedTrackFinal.genreId
      ? await this.prisma.genre.findUnique({
          where: { id: updatedTrackFinal.genreId },
        })
      : null;

    await this.searchIndexService.indexTrack(trackId);

    // 10. Return formatted response matching create() and getTrack() format
    return {
      trackId: updatedTrackFinal.id,
      status: updatedTrackFinal.transcodingStatus,
      title: updatedTrackFinal.title,
      description: updatedTrackFinal.description || null,
      tags: updatedTrackFinal.tags.map((t) => t.tag),
      artists: updatedTrackFinal.trackArtists.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
      })),
      durationSeconds: updatedTrackFinal.durationSeconds,
      privacy: updatedTrackFinal.isPublic ? 'public' : 'private',
      availability: {
        type:
          updatedTrackFinal.regionRestrictions.length > 0
            ? 'specific_regions'
            : 'worldwide',
        regions: updatedTrackFinal.regionRestrictions.map((r) => r.countryCode),
      },
      genre: genre?.label || null,
      audioUrl: updatedTrackFinal.audioUrl,
      waveformUrl: updatedTrackFinal.waveformUrl || null,
      artworkUrl: updatedTrackFinal.coverUrl || null,
      createdAt: updatedTrackFinal.createdAt.toISOString(),
      updatedAt: updatedTrackFinal.updatedAt.toISOString(),
      contentWarning: updatedTrackFinal.contentWarning,
    };
  }

  //-------------PATCH LOGIC SHOULD BE ADDED HERE IF WE USE IT----------------//

  async deleteTrack(trackId: string, userId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    if (track.userId !== userId) {
      throw new ForbiddenException('You can only delete your own tracks');
    }

    await this.prisma.track.update({
      where: { id: trackId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    await this.searchIndexService.removeTrack(trackId);

    return { message: 'Track deleted successfully' };
  }

  async replaceAudio(
    trackId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    // 1. Check if user has PRO subscription
    const userSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
        plan: {
          name: { in: ['PRO', 'GOPLUS'] },
        },
      },
      include: {
        plan: true,
      },
    });

    if (!userSubscription) {
      throw new ForbiddenException(
        'Only PRO and GOPLUS subscribers can replace audio',
      );
    }

    // 2. Find track
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    // 3. Check track exists
    if (!track) throw new NotFoundException('Track not found');

    // 4. Check ownership
    if (track.userId !== userId)
      throw new ForbiddenException(
        'You can only replace audio on your own tracks',
      );

    // 5. Get file extension
    const extension = file.originalname.split('.').pop();

    // 6. Upload new audio file to storage
    const audioUrl = await this.storage.uploadAudio(file);

    // 7. Extract duration from new audio
    const durationSeconds = await this.audio.extractDuration(
      file.buffer,
      extension ?? '',
    );

    // 8. Update track with new audio
    const updatedTrack = await this.prisma.track.update({
      where: { id: trackId },
      data: {
        audioUrl,
        durationSeconds,
        fileFormat: extension === 'wav' ? 'wav' : 'mp3',
        fileSizeBytes: file.size,
        transcodingStatus: 'processing',
      },
    });

    // 9. Add job to queue for processing (don't await - fire and forget)
    this.tracksQueue
      .add('process-track', {
        trackId,
        fileBuffer: file.buffer,
        extension,
      })
      .catch((error: unknown) => {
        console.error('Failed to queue track processing:', error);
      });

    // 10. Return formatted response
    return {
      trackId: updatedTrack.id,
      status: updatedTrack.transcodingStatus,
      waveformUrl: updatedTrack.waveformUrl || '',
      audioUrl: updatedTrack.audioUrl,
    };
  }

  async likeTrack(trackId: string, userId: string) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Check if user already liked this track
    const existingLike = await this.prisma.trackLike.findFirst({
      where: {
        trackId,
        userId,
      },
    });

    if (existingLike) {
      throw new ForbiddenException('You already liked this track');
    }

    // Create the track like and map it to user and track
    await this.prisma.trackLike.create({
      data: {
        user: { connect: { id: userId } },
        track: { connect: { id: trackId } },
      },
    });

    const updatedTrack = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        _count: {
          select: { likes: true },
        },
      },
    });

    if (!updatedTrack) {
      throw new NotFoundException('Track not found after liking');
    }

    return {
      message: 'Track liked successfully',
      data: {
        trackId: updatedTrack?.id,
        title: updatedTrack?.title,
        likesCount: updatedTrack?._count.likes || 0,
      },
    };
  }

  async unlikeTrack(trackId: string, userId: string) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    const existingLike = await this.prisma.trackLike.findFirst({
      where: {
        trackId,
        userId,
      },
    });

    if (!existingLike) {
      throw new ForbiddenException('You have not liked this track');
    }

    // Delete the track like
    await this.prisma.trackLike.delete({
      where: { id: existingLike.id },
    });

    const updatedTrack = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        _count: {
          select: { likes: true },
        },
      },
    });

    if (!updatedTrack) {
      throw new NotFoundException('Track not found after unliking');
    }

    return {
      message: 'Track unliked successfully',
      data: {
        trackId: updatedTrack?.id,
        title: updatedTrack?.title,
        likesCount: updatedTrack?._count.likes || 0,
      },
    };
  }

  async getTrackLikes(trackId: string, page: number = 1, limit: number = 20) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 max
    const skip = (validPage - 1) * validLimit;

    // Get total count
    const totalCount = await this.prisma.trackLike.count({
      where: { trackId },
    });

    // Get paginated likes with user info
    const likes = await this.prisma.trackLike.findMany({
      where: { trackId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: validLimit,
    });

    const totalPages = Math.ceil(totalCount / validLimit);
    const hasNextPage = validPage < totalPages;
    const hasPreviousPage = validPage > 1;

    return {
      trackId: track.id,
      title: track.title,
      likes: likes.map((like) => ({
        user: {
          id: like.user.id,
          username: like.user.username,
          avatarUrl: like.user.avatarUrl,
        },
        likedAt: like.createdAt.toISOString(),
      })),
      page: validPage,
      limit: validLimit,
      total: totalCount,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  }

  async repostTrack(trackId: string, userId: string) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Check if user already reposted this track
    const existingRepost = await this.prisma.repost.findFirst({
      where: {
        trackId,
        userId,
      },
    });

    if (existingRepost) {
      throw new ForbiddenException('You already reposted this track');
    }

    // Create the repost and map it to user and track
    await this.prisma.repost.create({
      data: {
        user: { connect: { id: userId } },
        track: { connect: { id: trackId } },
      },
    });

    const updatedTrack = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        _count: {
          select: { reposts: true },
        },
      },
    });

    if (!updatedTrack) {
      throw new NotFoundException('Track not found after reposting');
    }

    return {
      message: 'Track reposted successfully',
      data: {
        trackId: updatedTrack?.id,
        title: updatedTrack?.title,
        repostsCount: updatedTrack?._count.reposts || 0,
      },
    };
  }

  async unrepostTrack(trackId: string, userId: string) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    const existingRepost = await this.prisma.repost.findFirst({
      where: {
        trackId,
        userId,
      },
    });

    if (!existingRepost) {
      throw new ForbiddenException('You have not reposted this track');
    }

    // Delete the repost
    await this.prisma.repost.delete({
      where: { id: existingRepost.id },
    });

    const updatedTrack = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: {
        _count: {
          select: { reposts: true },
        },
      },
    });

    if (!updatedTrack) {
      throw new NotFoundException('Track not found after unreposting');
    }

    return {
      message: 'Track unreposted successfully',
      data: {
        trackId: updatedTrack?.id,
        title: updatedTrack?.title,
        repostsCount: updatedTrack?._count.reposts || 0,
      },
    };
  }

  async getTrackReposts(trackId: string, page: number = 1, limit: number = 20) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(limit, 100));
    const skip = (validPage - 1) * validLimit;

    // Get total count
    const totalCount = await this.prisma.repost.count({
      where: { trackId },
    });

    // Get reposts for the current page
    const allreposts = await this.prisma.repost.findMany({
      where: { trackId },
      skip,
      take: validLimit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    const totalPages = Math.ceil(totalCount / validLimit);
    const hasNextPage = validPage < totalPages;
    const hasPreviousPage = validPage > 1;

    return {
      trackId: track.id,
      title: track.title,
      reposts: allreposts.map((repost) => ({
        user: {
          id: repost.user.id,
          username: repost.user.username,
          avatarUrl: repost.user.avatarUrl,
        },
        repostedAt: repost.createdAt.toISOString(),
      })),
      page: validPage,
      limit: validLimit,
      total: totalCount,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  }

  async addComment(trackId: string, userId: string, text: string) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Create the comment and map it to user and track
    const comment = await this.prisma.comment.create({
      data: {
        userId: userId,
        trackId: trackId,
        content: text,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    return {
      comment: {
        id: comment.id,
        userId: userId,
        username: user?.username || 'Unknown',
        avatarUrl: user?.avatarUrl || null,
        text: comment.content,
        likesCount: 0,
        repliesCount: 0,
        createdAt: comment.createdAt.toISOString(),
      },
      commentsCount: await this.prisma.comment.count({
        where: { trackId },
      }),
    };
  }

  async getTrackComments(
    trackId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    //checking if track exists
    const track = await this.prisma.track.findUnique({
      where: { id: trackId, isDeleted: false },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(limit, 100));
    const skip = (validPage - 1) * validLimit;

    // Get total count
    const totalCount = await this.prisma.comment.count({
      where: { trackId },
    });

    // Get comments for the current page
    const allcomments = await this.prisma.comment.findMany({
      where: { trackId },
      skip,
      take: validLimit,
      include: {
        _count: {
          select: {
            replies: true,
            likes: true,
          },
        },

        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      comments: allcomments.map((comment) => ({
        commentId: comment.id,
        user: {
          id: comment.user.id,
          username: comment.user.username,
          avatarUrl: comment.user.avatarUrl,
        },
        text: comment.content,
        likesCount: comment._count.likes,
        repliesCount: comment._count.replies,
        createdAt: comment.createdAt.toISOString(),
      })),
      page: validPage,
      limit: validLimit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / validLimit),
      hasNextPage: skip + allcomments.length < totalCount,
      hasPreviousPage: skip > 0,
    };
  }

  async getStreamUrl(trackId: string, userId: string, privateToken?: string) {
    // 1. Fetch track
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: { regionRestrictions: true },
    });

    if (!track) throw new NotFoundException('Track not found');

    // 2. Resolve playability
    const playability = await this.resolvePlayability(
      track,
      userId,
      privateToken,
    );

    if (playability.status === 'blocked') {
      throw new ForbiddenException(playability.blockedReason);
    }

    // 3. Record play event with 30s dedup
    const recentPlay = await this.prisma.playHistory.findFirst({
      where: {
        userId,
        trackId,
        playedAt: { gte: new Date(Date.now() - 30_000) },
      },
    });

    if (!recentPlay) {
      await this.prisma.playHistory.create({
        data: { userId, trackId, completed: false },
      });
    }

    // 4. Generate signed URL
    const signedUrl = await this.storage.getSignedUrl(track.audioUrl, 600);

    // 5. Return signed URL
    return {
      trackId: track.id,
      stream: {
        url: signedUrl,
        expiresInSeconds: 600,
        format: track.fileFormat,
      },
      preview:
        playability.status === 'preview'
          ? {
              previewStartSeconds: playability.previewStartSeconds,
              previewDurationSeconds: playability.previewDurationSeconds,
            }
          : null,
    };
  }

  async markTrackPlayed(trackId: string, userId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track) throw new NotFoundException('Track not found');

    // Find the most recent play record for this user+track
    const recentPlay = await this.prisma.playHistory.findFirst({
      where: { userId, trackId },
      orderBy: { playedAt: 'desc' },
    });

    // Silently ignore if no play record exists
    if (!recentPlay) return { message: 'Play recorded' };

    await this.prisma.playHistory.update({
      where: { id: recentPlay.id },
      data: { completed: true },
    });

    return { message: 'Play recorded' };
  }

  async buildPlaybackContext(
    contextType: string,
    contextId: string,
    startTrackId?: string,
    shuffle?: boolean,
    repeat?: string,
  ) {
    let queueTracks: QueueTrack[] = [];

    switch (contextType) {
      case 'playlist': {
        const tracks = await this.prisma.collectionTrack.findMany({
          where: { collectionId: contextId },
          orderBy: { position: 'asc' },
          include: {
            track: {
              include: {
                user: {
                  select: { displayName: true, username: true },
                },
              },
            },
          },
        });
        queueTracks = tracks.map((t) => ({
          trackId: t.trackId,
          title: t.track.title,
          artist: t.track.user.displayName ?? t.track.user.username,
          durationSeconds: t.track.durationSeconds,
        }));
        break;
      }

      case 'profile': {
        const tracks = await this.prisma.track.findMany({
          where: {
            userId: contextId,
            isPublic: true,
            isDeleted: false,
            isHidden: false,
          },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { displayName: true, username: true },
            },
          },
        });
        queueTracks = tracks.map((t) => ({
          trackId: t.id,
          title: t.title,
          artist: t.user.displayName ?? t.user.username,
          durationSeconds: t.durationSeconds,
        }));
        break;
      }

      case 'history': {
        const tracks = await this.prisma.playHistory.findMany({
          where: { userId: contextId },
          orderBy: { playedAt: 'desc' },
          include: {
            track: {
              include: {
                user: {
                  select: { displayName: true, username: true },
                },
              },
            },
          },
        });
        // deduplicate since same track can appear multiple times in history
        const seen = new Set<string>();
        queueTracks = tracks
          .filter((t) => !seen.has(t.trackId) && seen.add(t.trackId))
          .map((t) => ({
            trackId: t.trackId,
            title: t.track.title,
            artist: t.track.user.displayName ?? t.track.user.username,
            durationSeconds: t.track.durationSeconds,
          }));
        break;
      }

      default:
        throw new BadRequestException('Invalid context type');
    }

    if (queueTracks.length === 0) {
      return {
        queue: [],
        currentIndex: 0,
        shuffle: shuffle ?? false,
        repeat: repeat ?? 'none',
        totalCount: 0,
      };
    }

    // Apply shuffle if requested
    if (shuffle) {
      queueTracks = queueTracks.sort(() => Math.random() - 0.5);
    }

    // Find starting index
    const currentIndex = startTrackId
      ? Math.max(
          queueTracks.findIndex((t) => t.trackId === startTrackId),
          0,
        )
      : 0;

    return {
      queue: queueTracks,
      currentIndex,
      shuffle: shuffle ?? false,
      repeat: repeat ?? 'none',
      totalCount: queueTracks.length,
    };
  }

  async getListeningHistory(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.playHistory.findMany({
        where: { userId, isHidden: false },
        orderBy: { playedAt: 'desc' },
        skip,
        take: limit,
        distinct: ['trackId'], // show each track once, most recent play
        include: {
          track: {
            include: {
              genre: true,
              user: {
                select: {
                  displayName: true,
                  username: true,
                },
              },
              _count: {
                select: {
                  likes: true,
                  comments: true,
                  reposts: true,
                  playHistory: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.playHistory.findMany({
        where: { userId, isHidden: false },
        distinct: ['trackId'],
        select: { trackId: true },
      }),
    ]);

    return {
      data: history.map((entry) => ({
        trackId: entry.track.id,
        title: entry.track.title,
        artist: entry.track.user.displayName ?? entry.track.user.username,
        coverUrl: entry.track.coverUrl ?? null,
        genre: entry.track.genre?.label ?? null,
        releaseDate: entry.track.releaseDate?.toISOString() ?? null,
        playedAt: entry.playedAt.toISOString(),
        durationSeconds: entry.track.durationSeconds,
        engagement: {
          likeCount: entry.track._count.likes,
          repostCount: entry.track._count.reposts,
          commentCount: entry.track._count.comments,
          playCount: entry.track._count.playHistory,
        },
      })),
      meta: {
        page,
        limit,
        total: total.length,
      },
    };
  }
  async clearListeningHistory(userId: string) {
    await this.prisma.playHistory.updateMany({
      where: { userId, isHidden: false },
      data: { isHidden: true },
    });

    return { message: 'Listening history cleared' };
  }
}
