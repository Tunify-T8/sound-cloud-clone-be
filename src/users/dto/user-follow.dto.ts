export class FollowUserDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followersCount: number;
}

export class FollowListDto {
  data: FollowUserDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
