import { Process, Processor } from '@nestjs/bull';
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
    job: Job<{ trackId: string; fileBuffer: any; extension: string }>,
  ) {
    console.log('Processor received job:', job.id, 'for track:', job.data.trackId);
    const { trackId, extension } = job.data;
    const fileBuffer = Buffer.from(job.data.fileBuffer) as Buffer;

    try {
      let finalBuffer = fileBuffer;
      let finalExtension = extension;

      // 1. upload original file to Supabase first
      const originalFile = {
        buffer: fileBuffer,
        originalname: `${trackId}.${extension}`,
        mimetype: extension === 'mp3' ? 'audio/mpeg' : `audio/${extension}`,
        size: fileBuffer.length,
      } as Express.Multer.File;

      const originalAudioUrl = await this.storage.uploadAudio(originalFile);

      // save original URL immediately so track has an audioUrl
      await this.prisma.track.update({
        where: { id: trackId },
        data: { audioUrl: originalAudioUrl },
      });

      // 2. transcode if not mp3
      if (extension !== 'mp3') {
        const transcoded = await this.audio.transcodeToMp3(fileBuffer);
        finalBuffer = transcoded as Buffer;
        finalExtension = 'mp3';

        const mp3File = {
          buffer: finalBuffer,
          originalname: `${trackId}.mp3`,
          mimetype: 'audio/mpeg',
          size: finalBuffer.length,
        } as Express.Multer.File;

        const newAudioUrl = await this.storage.uploadAudio(mp3File);

        // delete original non-mp3 file
        await this.storage.deleteFile('audio', originalAudioUrl);

        await this.prisma.track.update({
          where: { id: trackId },
          data: {
            audioUrl: newAudioUrl,
            fileFormat: 'mp3',
          },
        });
      }

      // 3. extract duration
      const durationSeconds = await this.audio.extractDuration(
        finalBuffer,
        finalExtension,
      );

      // 4. generate waveform
      const peaks = await this.audio.generateWaveform(
        finalBuffer,
        finalExtension,
      );
      const waveformUrl = await this.storage.uploadWaveform(peaks, trackId);

      // 5. final update
      await this.prisma.track.update({
        where: { id: trackId },
        data: {
          durationSeconds,
          waveformUrl,
          transcodingStatus: 'finished',
        },
      });
    } catch (error) {
      this.logger.error('Processing failed:', error);
      await this.prisma.track.update({
        where: { id: trackId },
        data: { transcodingStatus: 'failed' },
      });
      throw error;
    }
  }
}
