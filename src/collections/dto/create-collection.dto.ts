import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsIn(['PLAYLIST', 'ALBUM'])
  type: 'PLAYLIST' | 'ALBUM';

  @IsIn(['public', 'private'])
  privacy: 'public' | 'private';
}