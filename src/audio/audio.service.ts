import { Injectable } from '@nestjs/common';
import ffmpeg, { ffprobe } from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AudioService {

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
        if (err) return reject(err);
        resolve(Math.floor(metadata.format.duration ?? 0));
      });
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