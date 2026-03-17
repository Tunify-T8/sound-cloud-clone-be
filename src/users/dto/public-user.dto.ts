import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDate,
  IsInt,
} from 'class-validator';

export class PublicUserDto {
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
  @IsInt()
  tracksCount: number;

  @IsNotEmpty()
  @IsInt()
  followersCount: number;

  @IsNotEmpty()
  @IsInt()
  followingCount: number;

  @IsNotEmpty()
  @IsInt()
  likesReceived: number;

  @IsNotEmpty()
  @IsBoolean()
  isFollowing: boolean;

  @IsNotEmpty()
  @IsDate()
  createdAt: Date;
}
