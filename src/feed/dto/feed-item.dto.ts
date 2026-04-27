export class ActionDto {
  id!: string;
  username!: string;
  action!: 'repost' | 'post';
  date!: string;
  avatarUrl!: string | null;
}

export class FeedPostDto {
  trackId!: string;
  artistId!: string;
  artistAvatarUrl!: string;
  action!: ActionDto;
  title!: string;
  artist!: string;
  genre?: string;
  durationInSeconds!: number;

  coverUrl!: string | null;
  waveformUrl!: string | null;

  numberOfComments!: number;
  numberOfLikes!: number;
  numberOfReposts!: number;
  numberOfListens!: number;

  isLiked!: boolean;
  isReposted!: boolean;
  artistIsCertified!: boolean;
}

export class FeedListDto {
  items!: FeedPostDto[];
  page!: number;
  limit!: number;
  hasMore!: boolean;
}
