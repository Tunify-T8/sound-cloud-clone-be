export class FollowUserDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followersCount: number;
}

export class FollowListDto {
  followers?: FollowUserDto[];
  following?: FollowUserDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
