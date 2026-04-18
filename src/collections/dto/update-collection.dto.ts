import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
  IsNotEmpty ,
} from 'class-validator';

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
}