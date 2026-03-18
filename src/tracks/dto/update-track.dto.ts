import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  IsObject,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

class AvailabilityDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];
}

class LicensingDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  allowAttribution?: boolean;

  @IsOptional()
  @IsBoolean()
  nonCommercial?: boolean;

  @IsOptional()
  @IsBoolean()
  noDerivatives?: boolean;

  @IsOptional()
  @IsBoolean()
  shareAlike?: boolean;
}

class PermissionsDto {
  @IsOptional()
  @IsBoolean()
  enableDirectDownloads?: boolean;

  @IsOptional()
  @IsBoolean()
  enableOfflineListening?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInRSS?: boolean;

  @IsOptional()
  @IsBoolean()
  displayEmbedCode?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAppPlayback?: boolean;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean()
  showCommentsPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  showInsightsPublic?: boolean;
}

export class UpdateTrackDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  privacy?: string;

  @IsOptional()
  @IsString()
  artwork?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artists?: string[];

  @IsOptional()
  @IsString()
  recordLabel?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  isrc?: string;

  @IsOptional()
  @IsString()
  pLine?: string;

  @IsOptional()
  @IsBoolean()
  contentWarning?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledReleaseDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AvailabilityDto)
  availability?: AvailabilityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LicensingDto)
  licensing?: LicensingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PermissionsDto)
  permissions?: PermissionsDto;
}
