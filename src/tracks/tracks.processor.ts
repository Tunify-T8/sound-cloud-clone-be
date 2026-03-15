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
    job: Job<{ trackId: string; fileBuffer: Buffer; extension: string }>,
  ) {
    const { trackId, extension } = job.data;

    const fileBuffer = Buffer.from(job.data.fileBuffer);

    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { audioUrl: true },
    });

    if (!track) throw new Error(`Track ${trackId} not found`);

    try {
      let finalBuffer = fileBuffer;
      let finalExtension = extension;

      // transcode WAV to MP3
      if (extension === 'wav') {
        finalBuffer = await this.audio.transcodeToMp3(fileBuffer);
        finalExtension = 'mp3';

        // re-upload as MP3 replacing the WAV
        const mp3File = {
          buffer: finalBuffer,
          originalname: `${trackId}.mp3`,
          mimetype: 'audio/mpeg',
          size: finalBuffer.length,
        } as Express.Multer.File;

        const newAudioUrl = await this.storage.uploadAudio(mp3File);

        // delete the original WAV from Supabase
        const wavFilename = track.audioUrl.split('/').pop(); // extract filename from URL
        console.log('Attempting to delete:', wavFilename);
        await this.storage.deleteFile('audio', wavFilename ?? '');

        // update audioUrl and fileFormat in DB
        await this.prisma.track.update({
          where: { id: trackId },
          data: {
            audioUrl: newAudioUrl,
            fileFormat: 'mp3',
          },
        });
      }

      // generate waveform from final buffer
      const peaks = await this.audio.generateWaveform(
        finalBuffer,
        finalExtension,
      );
      const waveformUrl = await this.storage.uploadWaveform(peaks, trackId);

      await this.prisma.track.update({
        where: { id: trackId },
        data: {
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
