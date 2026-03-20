import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private supabase: SupabaseClient;

  constructor(private config: ConfigService) {
    this.supabase = createClient(
      this.config.get('SUPABASE_URL') ?? '',
      this.config.get('SUPABASE_KEY') ?? '',
    );
  }
  
async uploadAudio(file: Express.Multer.File): Promise<string> {
  const filename = `${Date.now()}-${file.originalname}`;

  // normalize content type — Supabase is strict about this
  const contentTypeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    aiff: 'audio/aiff',
  };

  const extension = file.originalname.split('.').pop()?.toLowerCase() ?? 'mp3';
  const contentType = contentTypeMap[extension] ?? file.mimetype;

  console.log('Uploading:', filename, 'Content-Type:', contentType);

  const { error } = await this.supabase.storage
    .from('audio')
    .upload(filename, file.buffer, {
      contentType,
      upsert: false,
    });

  if (error) throw new Error(`Audio upload failed: ${error.message}`);

  const { data } = this.supabase.storage
    .from('audio')
    .getPublicUrl(filename);

  return data.publicUrl;
}

  async uploadWaveform(peaks: number[], trackId: string): Promise<string> {
    const filename = `${trackId}.json`;
    const body = JSON.stringify({ peaks });

    const { error } = await this.supabase.storage
      .from('waveforms')
      .upload(filename, body, {
        contentType: 'application/json',
        upsert: true, // overwrite if exists since trackId is unique
      });

    if (error) throw new Error(`Waveform upload failed: ${error.message}`);

    const { data } = this.supabase.storage
      .from('waveforms')
      .getPublicUrl(filename);

    return data.publicUrl;
  }

  async uploadImage(file: Express.Multer.File): Promise<string | null> {
    try {
      const filename = `${Date.now()}-${file.originalname}`;

      const { error } = await this.supabase.storage
        .from('artwork')
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        console.warn(`Image upload warning: ${error.message}`);
        return null; // Return null instead of throwing
      }

      const { data } = this.supabase.storage.from('artwork').getPublicUrl(filename);

      return data.publicUrl;
    } catch (error) {
      console.warn(`Image upload failed: ${error.message}`);
      return null; // Return null on error instead of throwing
    }
  }

  async deleteFile(bucket: string, filename: string): Promise<void> {
    console.log(`Deleting ${filename} from ${bucket}`);

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .remove([filename]);

    console.log('Delete result:', data, error);

    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
}
