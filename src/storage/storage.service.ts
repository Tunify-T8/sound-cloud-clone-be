import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private supabase: SupabaseClient<any, 'public', 'public'>;

  constructor(private config: ConfigService) {
    this.supabase = createClient(
      this.config.get('SUPABASE_URL') ?? '',
      this.config.get('SUPABASE_KEY') ?? '',
    ) as unknown as SupabaseClient<any, 'public', 'public'>;
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
      webm: 'audio/webm',
    };

    const extension =
      file.originalname.split('.').pop()?.toLowerCase() ?? 'mp3';
    const contentType = contentTypeMap[extension] ?? file.mimetype;

    console.log('Uploading:', filename, 'Content-Type:', contentType);

    const { error } = await this.supabase.storage
      .from('audio')
      .upload(filename, file.buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Audio upload failed: ${errorMessage}`);
    }

    const { data } = this.supabase.storage.from('audio').getPublicUrl(filename);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.warn(`Image upload warning: ${(error as any).message}`);
        return null; // Return null instead of throwing
      }

      const { data } = this.supabase.storage
        .from('artwork')
        .getPublicUrl(filename);

      return data.publicUrl;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

  async getSignedUrl(filePath: string, expiresIn: number): Promise<string> {
    // extract just the filename from the full public URL if needed
    const filename = filePath.split('/').pop() ?? filePath;

    const { data, error } = await this.supabase.storage
      .from('audio')
      .createSignedUrl(filename, expiresIn);

    if (error || !data) {
      throw new Error(`Failed to generate signed URL: ${error?.message}`);
    }

    return data.signedUrl;
  }

  async getSignedDownloadUrl(
    filePath: string,
    expiresIn: number,
    trackTitle: string,
  ): Promise<string> {
    const filename = filePath.split('/').pop() ?? filePath;

    const { data, error } = await this.supabase.storage
      .from('audio')
      .createSignedUrl(filename, expiresIn, {
        download: `${trackTitle}.mp3`,
      });

    if (error || !data) {
      throw new Error(`Failed to generate download URL: ${error?.message}`);
    }

    return data.signedUrl;
  }
}
