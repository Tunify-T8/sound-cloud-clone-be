import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export enum ReasonType {
  FOLLOW = 'FOLLOW',
  TASTE = 'TASTE',
  GENRE = 'GENRE',
  TRENDING = 'TRENDING',
}

export class GetRecommendationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class RecommendationItemDto {
  trackId: string;
  artistId: string;
  artistAvatarUrl: string | null;
  artistIsCertified: boolean;
  title: string;
  artist: string;
  genre: string | null;
  durationInSeconds: number;
  coverUrl: string | null;
  waveformUrl: string | null;
  numberOfComments: number;
  numberOfLikes: number;
  numberOfReposts: number;
  numberOfListens: number;
  isLiked: boolean;
  isReposted: boolean;
  reason: string;
  reasonType: ReasonType;
}

export class RecommendationsResponseDto {
  data: RecommendationItemDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  meta?: { code: 'NO_DATA'; message: string };
}
