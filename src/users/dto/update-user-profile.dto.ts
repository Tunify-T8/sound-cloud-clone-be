import { UserType, Visibility } from '@prisma/client';
import {
  Matches,
  IsEnum,
  IsString,
  IsUrl,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { AtLeastOneField } from '../at-least-one-field.validator';

@AtLeastOneField()
export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  bio?: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(30)
  displayName?: string;

  @IsEnum(UserType)
  @IsOptional()
  role?: UserType;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(Visibility)
  @IsOptional()
  visibility?: Visibility;

  @IsUrl()
  @IsOptional()
  avatarUrl?: string;

  @IsUrl()
  @IsOptional()
  coverUrl?: string;
}
