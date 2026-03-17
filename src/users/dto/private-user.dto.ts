import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDate,
} from 'class-validator';

export class PrivateUserDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsNotEmpty()
  @IsBoolean()
  isFollowing: boolean;
  @IsNotEmpty()
  @IsDate()
  createdAt: Date;
}
