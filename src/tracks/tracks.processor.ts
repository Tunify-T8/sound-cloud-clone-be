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
    job: Job<{
      trackId: string;
      userId: string;
      fileBuffer: any;
      extension: string;
      durationSeconds: number;
    }>,
  ) {
    const { trackId, userId, extension, durationSeconds } = job.data;
    const fileBuffer = Buffer.from(job.data.fileBuffer) as Buffer;

    try {
      let finalBuffer = fileBuffer;
      let finalExtension = extension;

      // 1. Check monthly upload quota
      // Note: duration was already extracted in uploadAudio and passed via job data,
      // so we skip the ffprobe call here. We still check quota here as a safety net
      // in case a job was enqueued by other means (e.g. replaceAudio).
      const subscription = await this.prisma.subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { plan: true },
      });

      let plan = subscription?.plan;
      if (!plan) {
        plan = await this.prisma.subscriptionPlan.findUnique({
          where: { name: 'free' },
        });

        if (!plan) {
          throw new Error('free subscription plan not found in database');
        }
      }

      // -1 means unlimited (artist-pro plan) — skip quota check
      if (plan.monthlyUploadMinutes !== -1) {
        const monthlyLimitSeconds = plan.monthlyUploadMinutes * 60;

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const uploadedThisMonth = await this.prisma.track.aggregate({
          where: {
            userId,
            isDeleted: false,
            transcodingStatus: 'finished',
            createdAt: { gte: monthStart },
          },
          _sum: { durationSeconds: true },
        });

        const usedSeconds = uploadedThisMonth._sum.durationSeconds ?? 0;

        if (usedSeconds + durationSeconds > monthlyLimitSeconds) {
          this.logger.warn(
            `Track ${trackId} rejected: quota exceeded. Used: ${usedSeconds}s, new: ${durationSeconds}s, limit: ${monthlyLimitSeconds}s`,
          );
          await this.prisma.track.update({
            where: { id: trackId },
            data: { transcodingStatus: 'failed' },
          });
          return;
        }
      }

      // 2. Upload original file
      const mimetypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
        aac: 'audio/aac',
        aiff: 'audio/aiff',
        webm: 'audio/webm',
      };

      const originalFile = {
        buffer: fileBuffer,
        originalname: `${trackId}.${extension}`,
        mimetype: mimetypeMap[extension] ?? 'audio/mpeg',
        size: fileBuffer.length,
      } as Express.Multer.File;

      const originalAudioUrl = await this.storage.uploadAudio(originalFile);
      await this.prisma.track.update({
        where: { id: trackId },
        data: { audioUrl: originalAudioUrl },
      });

      // 3. Transcode if not mp3
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

        // Delete original non-mp3 file
        await this.storage.deleteFile('audio', originalAudioUrl);

        await this.prisma.track.update({
          where: { id: trackId },
          data: {
            audioUrl: newAudioUrl,
            fileFormat: 'mp3',
          },
        });
      }


      
      // 4. Generate waveform
      const peaks = await this.audio.generateWaveform(
        finalBuffer,
        finalExtension,
      );
      const waveformUrl = await this.storage.uploadWaveform(peaks, trackId);

      // 5. Final update — use durationSeconds passed from job data
      await this.prisma.track.update({
        where: { id: trackId },
        data: { durationSeconds, waveformUrl, transcodingStatus: 'finished' },
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