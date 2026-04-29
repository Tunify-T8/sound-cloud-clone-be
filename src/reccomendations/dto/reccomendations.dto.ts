import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DiscoverItemDto } from 'src/feed/dto/discover.dto';

export enum ReasonType {
  FOLLOW = 'FOLLOW',
  TASTE = 'TASTE',
  TAG = 'TAG',
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

export class RecommendationItemDto extends DiscoverItemDto {
  audioUrl: string;
  likesCount: number;
  playsCount: number;
  tags: string[];
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
