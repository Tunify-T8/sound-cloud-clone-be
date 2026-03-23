import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackMultipartDto } from './dto/update-track-multipart.dto';
import type { Queue } from 'bull';
import { randomBytes } from 'crypto';
import type { Prisma, FileFormat } from '@prisma/client';

@Injectable()
export class TracksService {
  constructor(
    private storage: StorageService,
    private audio: AudioService,
    private prisma: PrismaService,
    @InjectQueue('tracks') private tracksQueue: Queue,
  ) {}

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
      },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
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
      durationSeconds: track.durationSeconds,
      privacy: track.isPublic ? 'public' : 'private',
      scheduledReleaseDate: track.releaseDate?.toISOString() || null,
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
      where: { id: trackId },
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

    // Update genre if provided and exists
    if (dto.genre) {
      const genreExists = await this.prisma.genre.findUnique({
        where: { id: dto.genre },
      });
      if (genreExists) {
        updateData.genre = { connect: { id: dto.genre } };
      }
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
      where: { id: trackId },
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
      where: { id: trackId },
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
}
