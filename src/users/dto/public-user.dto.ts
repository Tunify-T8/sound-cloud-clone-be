export class PublicUserDto {
  id: string;
  username: string;
  displayName: string | null;

  role: string;
  bio: string | null;
  location: string | null;

  avatarUrl: string | null;
  coverUrl: string | null;

  tracksCount: number;

  followersCount: number;

  followingCount: number;

  likesReceived: number;

  isFollowing: boolean;
  isActive: boolean;
  isCertified: boolean;

  createdAt: Date;
}
