import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class GetDiscoverQueryDto {
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

  @IsOptional()
  @IsString()
  genreId?: string;
}

export class DiscoverItemDto {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  waveformUrl: string | null;
  durationSeconds: number;
  genre: string | null;
  createdAt: Date;
}

export class DiscoverListDto {
  items: DiscoverItemDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  personalized: boolean;
}