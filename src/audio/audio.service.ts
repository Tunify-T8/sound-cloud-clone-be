import { Injectable } from '@nestjs/common';
import ffmpeg, { ffprobe } from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type FFStaticModule = { path?: string } | string;

@Injectable()
export class AudioService {
  constructor() {
    // Set the paths to ffmpeg and ffprobe binaries
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      const ffmpegStatic: FFStaticModule = require('ffmpeg-static');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      const ffprobeStatic: FFStaticModule = require('ffprobe-static');

      // These packages export objects with a .path property
      const ffmpegBinaryPath: string | undefined =
        (ffmpegStatic as FFStaticModule & { path?: string }).path ||
        (typeof ffmpegStatic === 'string' ? ffmpegStatic : undefined);
      const ffprobeBinaryPath: string | undefined =
        (ffprobeStatic as FFStaticModule & { path?: string }).path ||
        (typeof ffprobeStatic === 'string' ? ffprobeStatic : undefined);

      if (typeof ffmpegBinaryPath === 'string') {
        ffmpeg.setFfmpegPath(ffmpegBinaryPath);
      }
      if (typeof ffprobeBinaryPath === 'string') {
        ffmpeg.setFfprobePath(ffprobeBinaryPath);
      }
    } catch (error) {
      // If ffmpeg-static is not available, the system ffmpeg will be used
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        'ffmpeg-static or ffprobe-static not properly configured:',
        errorMessage,
      );
    }
  }

  private writeTempFile(buffer: Buffer, extension: string): string {
    const tempPath = path.join(os.tmpdir(), `audio-${Date.now()}.${extension}`);
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  }

  extractDuration(buffer: Buffer, extension: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tempPath = this.writeTempFile(buffer, extension);

      ffprobe(tempPath, (err, metadata) => {
        fs.unlinkSync(tempPath);
        if (err) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return reject(err);
        }
        resolve(Math.floor(metadata.format.duration ?? 0));
      });
    });
  }

  transcodeToMp3(buffer: Buffer): Promise<Buffer<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
      const tempInput = this.writeTempFile(buffer, 'wav');
      const tempOutput = path.join(os.tmpdir(), `transcoded-${Date.now()}.mp3`);

      ffmpeg(tempInput)
        .audioCodec('libmp3lame')
        .audioBitrate(320)
        .format('mp3')
        .output(tempOutput)
        .on('end', () => {
          const mp3Buffer = fs.readFileSync(tempOutput);
          fs.unlinkSync(tempInput);
          fs.unlinkSync(tempOutput);
          resolve(mp3Buffer);
        })
        .on('error', (err) => {
          fs.unlinkSync(tempInput);
          reject(err);
        })
        .run();
    });
  }

  generateWaveform(buffer: Buffer, extension: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const tempInput = this.writeTempFile(buffer, extension);
      const tempOutput = path.join(os.tmpdir(), `peaks-${Date.now()}.raw`);

      ffmpeg(tempInput)
        .audioChannels(1)
        .audioFrequency(8000)
        .format('s16le')
        .output(tempOutput)
        .on('end', () => {
          const raw = fs.readFileSync(tempOutput);
          const samples = new Int16Array(raw.buffer);

          const peaks: number[] = [];
          const blockSize = Math.floor(samples.length / 200);

          for (let i = 0; i < 200; i++) {
            let max = 0;
            for (let j = 0; j < blockSize; j++) {
              const val = Math.abs(samples[i * blockSize + j]);
              if (val > max) max = val;
            }
            peaks.push(parseFloat((max / 32768).toFixed(3)));
          }

          fs.unlinkSync(tempInput);
          fs.unlinkSync(tempOutput);
          resolve(peaks);
        })
        .on('error', (err) => {
          fs.unlinkSync(tempInput);
          reject(err);
        })
        .run();
    });
  }
}
