import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { CreateTrackDto } from './dto/create-track.dto';
import type { Queue } from 'bull';

@Injectable()
export class TracksService {
  constructor(
    private storage: StorageService,
    private audio: AudioService,
    private prisma: PrismaService,
    @InjectQueue('tracks') private tracksQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateTrackDto) {
    const track = await this.prisma.track.create({
      data: {
        userId: userId,
        title: dto.title,
        description: dto.description,
        genreId: dto.genre,
        isPublic: dto.privacy === 'public',
        contentWarning: dto.contentWarning ?? false,
        releaseDate: dto.scheduledReleaseDate
          ? new Date(dto.scheduledReleaseDate)
          : null,
        transcodingStatus: 'processing',
        // required fields that come from the audio upload step
        // set temporary values until audio is uploaded
        audioUrl: '',
        durationSeconds: 0,
        fileFormat: 'mp3',
        fileSizeBytes: null,
      },
    });

    return track;
  }

  async uploadAudio(trackId: string, userId: string, file: Express.Multer.File) {
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

    // 5. upload file to storage
    const audioUrl = await this.storage.uploadAudio(file);

    // 6. extract duration
    const durationSeconds = await this.audio.extractDuration(
      file.buffer,
      extension ?? '',
    );

    // 7. update track in DB
    const updatedTrack = await this.prisma.track.update({
      where: { id: trackId },
      data: {
        audioUrl,
        durationSeconds,
        fileFormat: extension === 'wav' ? 'wav' : 'mp3',
        fileSizeBytes: file.size,
      },
    });

    // 8. add job to queue — don't await, return immediately
    await this.tracksQueue.add('process-track', {
      trackId,
      fileBuffer: file.buffer,
      extension,
    });

    return updatedTrack;
  }

  async getStatus(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        transcodingStatus: true,
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
      },
    });

    if (!track)
    {
      return null;
    }

    const genre = await this.prisma.genre.findUnique({where: { id: track.genreId }});
    const subgenre = track.subGenreId ? await this.prisma.subGenre.findUnique({where: { id: track.subGenreId }}) : null;

    
    const filteredTrack = {
      trackId: track.id,
      status: track.transcodingStatus,
      title: track.title,
      description: track.description || null,
      genre: genre ? {
        category: genre.label,
        subGenre: subgenre?.name || null,
      } : null,
      tags: track.tags || [],
      artists: track.trackArtists,
      durationSeconds: track.durationSeconds,
      privacy: track.isPublic ? 'public' : 'private',
      scheduledReleaseDate: track.releaseDate?.toISOString() || null,
      availability: {
        type: 'worldwide',
        regions: track.regionRestrictions?.map(r => r.countryCode) || [],
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

//   async updateTrack(trackId: string, dto: UpdateTrackDto) {
//     const track = await this.prisma.track.findUnique({
//       where: { id: trackId },
//     });

//     if (!track) {
//       return null;
//     }
//     //request body will have those fields
//     /*trackId *
// string($uuid)
// title *
// string
// genre
// string
// Web sends genre as a flat string. Grouped by category for UI display.

// tags
// array<string>
// description
// string
// privacy
// string
// public — Searchable & visible on profile; private — Accessible only via direct link

// artwork
// string($binary)
// artists
// array<string>
// recordLabel
// string
// publisher
// string
// isrc
// string
// pLine
// string
// contentWarning
// boolean
// scheduledReleaseDate
// string($date-time)
// availability
// object
// licensing
// object
// permissions
// object*/

//     track.title = dto.title;
//     track.genreId = dto.genre;
//     track.tags = dto.tags;
//     track.description = dto.description;
//     track.isPublic = dto.privacy === 'public';
//     track.coverUrl = dto.artwork ? await this.storage.uploadImage(dto.artwork) : track.coverUrl;
//     track.trackArtists = dto.artists ? dto.artists.map(name => ({ name })) : track.trackArtists;
//     track.recordLabel = dto.recordLabel;
//     track.publisher = dto.publisher;
//     track.isrc = dto.isrc;
//     track.pLine = dto.pLine;
//     track.contentWarning = dto.contentWarning ?? false;
//     track.releaseDate = dto.scheduledReleaseDate
//       ? new Date(dto.scheduledReleaseDate)
//       : null;
//     track.reigionRestrictions = dto.availability?.regions ? dto.availability.regions.map((code) => ({ countryCode: code })) : track.regionRestrictions;
//     track.
//    }

  
}