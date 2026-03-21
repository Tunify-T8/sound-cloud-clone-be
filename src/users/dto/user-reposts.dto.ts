export class RepostedTrackDto {
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

export class RepostItemDto {
  repostId: string;
  repostedAt: Date;
  track: RepostedTrackDto;
}

export class UserRepostsDto {
  data: RepostItemDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
