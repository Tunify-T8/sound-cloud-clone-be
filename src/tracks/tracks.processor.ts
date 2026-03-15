import { Process, Processor} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AudioService } from '../audio/audio.service';

@Processor('tracks')
export class TracksProcessor {

  private readonly logger = new Logger(TracksProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audio: AudioService,
  ) {}

  @Process('process-track')
  async handleProcessTrack(
    job: Job<{ trackId: string; fileBuffer: Buffer; extension: string }>,
  ) {
    const { trackId, extension } = job.data;

    const fileBuffer = Buffer.from(job.data.fileBuffer);

    try {
      // 1. generate waveform peaks
      const peaks = await this.audio.generateWaveform(fileBuffer, extension);

      // 2. upload waveform JSON to storage
      const waveformUrl = await this.storage.uploadWaveform(peaks, trackId);

      // 3. update track as finished
      await this.prisma.track.update({
        where: { id: trackId },
        data: {
          waveformUrl,
          transcodingStatus: 'finished',
        },
      });

    } catch (error) {
      // if anything fails mark track as failed
      this.logger.error('Processing failed:', error);
      await this.prisma.track.update({
        where: { id: trackId },
        data: { transcodingStatus: 'failed' },
      });
      throw error;
    }
  }
}