export class FollowUserDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  location: string | null;
  isCertified: boolean;
  isNotificationEnabled: boolean | null;
  followersCount: number;
}

export class FollowListDto {
  followers?: FollowUserDto[];
  following?: FollowUserDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
