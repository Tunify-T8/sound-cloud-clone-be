import { IsString, IsBoolean, IsOptional, IsArray, IsIn, IsDateString, ValidateNested,IsNotEmpty} from 'class-validator';
import { Type } from 'class-transformer';

export class AvailabilityDto {
  @IsString()
  @IsIn(['worldwide', 'specific_regions'])
  type: string;

  @IsArray()
  @IsString({ each: true })
  regions: string[];
}

export class CreateTrackDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  genre?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(['public', 'private'])
  privacy: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  artists?: string[];

  @ValidateNested()
  @Type(() => AvailabilityDto)
  availability: AvailabilityDto;

  @IsDateString()
  @IsOptional()
  scheduledReleaseDate?: string | null;

  @IsBoolean()
  @IsOptional()
  contentWarning?: boolean;
}
