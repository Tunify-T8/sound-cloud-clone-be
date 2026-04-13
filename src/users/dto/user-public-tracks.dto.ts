export class TrackArtistDto {
  id: string;
  username?: string;
  displayName: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

export class TrackEngagementDto {
  likeCount: number;
  repostCount: number;
  commentCount: number;
  playCount: number;
}

export class TrackInteractionDto {
  isLiked: boolean;
  isReposted: boolean;
}

export class PublicTrackItemDto {
  id: string;
  title: string;
  artist: TrackArtistDto;
  artists: TrackArtistDto[];
  coverUrl: string | null;
  durationSeconds: number;
  createdAt: Date;
  status: string;
  privacy: 'public' | 'private';
  scheduledReleaseDate: Date | null;
  genre: string | null;
  waveformUrl: string | null;
  engagement: TrackEngagementDto;
  interaction: TrackInteractionDto;
}

export class PublicTrackMetaDto {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export class PublicUserTracksDto {
  data: PublicTrackItemDto[];
  meta: PublicTrackMetaDto;
}
