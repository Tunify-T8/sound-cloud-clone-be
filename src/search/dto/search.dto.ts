import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum TimeAdded {
  PAST_HOUR = 'past_hour',
  PAST_DAY = 'past_day',
  PAST_WEEK = 'past_week',
  PAST_MONTH = 'past_month',
  PAST_YEAR = 'past_year',
  ALL_TIME = 'all_time',
}

export enum DurationFilter {
  LT_2 = 'lt_2',
  TWO_TEN = '2_10',
  TEN_THIRTY = '10_30',
  GT_30 = 'gt_30',
  ANY = 'any_length',
}

export enum PeopleSort {
  RELEVANCE = 'relevance',
  FOLLOWERS = 'followers',
}

export enum CollectionTypeFilter {
  ALBUM = 'album',
  PLAYLIST = 'playlist',
}

class BaseSearchDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class GlobalSearchDto extends BaseSearchDto {}

export class SearchTracksDto extends BaseSearchDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsEnum(TimeAdded)
  timeAdded?: TimeAdded;

  @IsOptional()
  @IsEnum(DurationFilter)
  duration?: DurationFilter;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  allowDownloads?: boolean;
}

export class SearchCollectionsDto extends BaseSearchDto {
  @IsOptional()
  @IsEnum(CollectionTypeFilter)
  type?: CollectionTypeFilter;

  @IsOptional()
  @IsString()
  tag?: string;
}

export class SearchPeopleDto extends BaseSearchDto {
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minFollowers?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @IsEnum(PeopleSort)
  sort?: PeopleSort = PeopleSort.RELEVANCE;
}

// track preview inside a collection result
export class CollectionTrackPreviewDto {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
}

export class TrackSearchResultDto {
  id: string;
  type: 'track';
  title: string;
  artist: string;
  genre: string | null;
  durationSeconds: number;
  coverUrl: string | null;
  likesCount: number;
  playsCount: number;
  repostsCount: number;
  allowDownloads: boolean;
  createdAt: string;
  score: number;
}

export class CollectionSearchResultDto {
  id: string;
  type: 'album' | 'playlist';
  title: string;
  artist: string;
  description: string | null;
  coverUrl: string | null;
  trackCount: number;
  trackPreview: CollectionTrackPreviewDto[]; // first 4 tracks
  createdAt: string;
  score: number;
}

export class UserSearchResultDto {
  id: string;
  type: 'user';
  username: string;
  displayName: string | null;
  location: string | null;
  isCertified: boolean;
  followersCount: number;
  isFollowing: boolean | null; // null when logged out
  score: number;
}

export class PaginatedSearchResultDto {
  data: (
    | TrackSearchResultDto
    | CollectionSearchResultDto
    | UserSearchResultDto
  )[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class PaginatedTrackSearchDto {
  data: TrackSearchResultDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class PaginatedCollectionSearchDto {
  data: CollectionSearchResultDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class PaginatedUserSearchDto {
  data: UserSearchResultDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class AutocompleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  q!: string;
}

export class AutocompleteResultDto {
  tracks!: { id: string; title: string; artist: string }[];
  users!: { id: string; username: string; displayName: string | null }[];
  collections!: { id: string; title: string; artist: string }[];
}