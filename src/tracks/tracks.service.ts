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
import { UpdateTrackDto } from './dto/update-track.dto';
import { UpdateTrackMultipartDto } from './dto/update-track-multipart.dto';
import type { Queue } from 'bull';
import { randomBytes } from 'crypto';

@Injectable()
export class TracksService {
  constructor(
    private storage: StorageService,
    private audio: AudioService,
    private prisma: PrismaService,
    @InjectQueue('tracks') private tracksQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateTrackDto) {
    const genre = dto.genre
      ? await this.prisma.genre.findUnique({
          where: { label: dto.genre },
        })
      : null;

    const isPublic = dto.privacy === 'public';

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
        dto.artists.map((artistUserId) =>
          this.prisma.trackArtist.create({
            data: {
              trackId: track.id,
              userId: artistUserId,
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

    return trackWithRelations;
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
        fileFormat: extension !== 'mp3' ? (extension as any) : 'mp3',
        fileSizeBytes: file.size,
        transcodingStatus: 'processing',
      },
    });

    // 7. add job to queue — don't await, return immediately
    await this.tracksQueue.add('process-track', {
      trackId,
      fileBuffer: file.buffer,
      extension,
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
    userId: string,
    dto: UpdateTrackMultipartDto,
    artworkFile?: Express.Multer.File,
  ) {
    const trackId = dto.trackId;
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
    const updateData: any = {};

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
        updateData.genreId = dto.genre;
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
    const updatedTrack = await this.prisma.track.update({
      where: { id: trackId },
      data: updateData,
      include: {
        trackArtists: true,
        regionRestrictions: true,
      },
    });

    // 6. Update artists if provided
    if (dto.artists && dto.artists.length > 0) {
      // Delete existing artists for this track
      await this.prisma.trackArtist.deleteMany({
        where: { trackId },
      });

      // Validate artists exist before creating relationships
      const validArtists = await Promise.all(
        dto.artists.map(async (userId) => {
          const userExists = await this.prisma.user.findUnique({
            where: { id: userId },
          });
          return userExists ? userId : null;
        }),
      );

      // Create new artist relationships only for valid users
      const validArtistIds = validArtists.filter((id) => id !== null);
      if (validArtistIds.length > 0) {
        await Promise.all(
          validArtistIds.map((userId) =>
            this.prisma.trackArtist.create({
              data: {
                trackId,
                userId,
                role: 'featured', // Default role; adjust as needed
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

    // 10. Return simplified response format
    return {
      trackId: updatedTrackFinal.id,
      status: updatedTrackFinal.transcodingStatus,
      audioUrl: updatedTrackFinal.audioUrl,
      waveformUrl: updatedTrackFinal.waveformUrl || null,
      title: updatedTrackFinal.title,
      genre: genre?.label || null,
      tags: updatedTrackFinal.tags.map((t) => t.tag),
      description: updatedTrackFinal.description || null,
      scheduledReleaseDate:
        updatedTrackFinal.releaseDate?.toISOString() || null,
      privacy: updatedTrackFinal.isPublic ? 'public' : 'private',
      artworkUrl: updatedTrackFinal.coverUrl || null,
    };
  }
}
