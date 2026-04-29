import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
  IsNotEmpty,
  IsUrl,
} from 'class-validator';
import { CollectionType } from '@prisma/client';


export class UpdateCollectionDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsIn(['public', 'private'])
  @IsOptional()
  privacy?: 'public' | 'private';

  @IsUrl()
  @IsOptional()
  coverUrl?: string;
  @IsIn([CollectionType.PLAYLIST, CollectionType.ALBUM])
  @IsOptional()
  type?: CollectionType;

}