import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum TrendingType {
  TRACK = 'track',
  PLAYLIST = 'playlist',
  ALBUM = 'album',
}

export enum TrendingPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class GetTrendingQueryDto {
  @IsEnum(TrendingType)
  type: TrendingType;

  @IsOptional()
  @IsEnum(TrendingPeriod)
  period?: TrendingPeriod = TrendingPeriod.WEEK;

  @IsOptional()
  @IsString()
  genreId?: string;
}

export class TrendingItemDto {
  id: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  type: TrendingType;
  score: number;
}

export class TrendingListDto {
  items: TrendingItemDto[];
  type: TrendingType;
  period: TrendingPeriod;
  genreId?: string;
}
