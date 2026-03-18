export class TrackItemDto {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string;
  coverUrl: string | null;
  duration: number;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  createdAt: Date;
}

export class UserTracksDto {
  data: TrackItemDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
