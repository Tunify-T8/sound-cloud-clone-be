import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    // create uploads folder if it doesn't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    if (!fs.existsSync(path.join(this.uploadDir, 'audio'))) {
      fs.mkdirSync(path.join(this.uploadDir, 'audio'));
    }

    if (!fs.existsSync(path.join(this.uploadDir, 'waveforms'))) {
      fs.mkdirSync(path.join(this.uploadDir, 'waveforms'));
    }
  }

  async uploadAudio(file: Express.Multer.File): Promise<string> {
    const filename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(this.uploadDir, 'audio', filename);
    fs.writeFileSync(filePath, file.buffer);

    // return a local URL your backend can serve
    return `/uploads/audio/${filename}`;
  }

  async uploadWaveform(peaks: number[], trackId: string): Promise<string> {
    const filename = `${trackId}.json`;
    const filePath = path.join(this.uploadDir, 'waveforms', filename);
    fs.writeFileSync(filePath, JSON.stringify({ peaks }));

    return `/uploads/waveforms/${filename}`;
  }
}