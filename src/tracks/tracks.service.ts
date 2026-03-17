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
        audioUrl: true,
        waveformUrl: true,
      },
    });

    if (!track) throw new NotFoundException('Track not found');

    return track;
  }
}