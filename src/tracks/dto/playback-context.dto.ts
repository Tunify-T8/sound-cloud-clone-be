import { IsEnum, IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class PlaybackContextDto {
  @IsEnum(['playlist', 'profile', 'history'])
  contextType: string;

  @IsUUID()
  contextId: string;

  @IsUUID()
  @IsOptional()
  startTrackId?: string;

  @IsBoolean()
  @IsOptional()
  shuffle?: boolean;

  @IsEnum(['none', 'one', 'all'])
  @IsOptional()
  repeat?: string;
}