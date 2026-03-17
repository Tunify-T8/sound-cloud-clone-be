export class PrivateUserDto {
  id: string;
  username: string;
  displayName: string | null;

  role: string;
  bio: string | null;
  location: string | null;

  avatarUrl: string | null;
  coverUrl: string | null;

  isFollowing: boolean;
  isActive: boolean;
  isVerified: boolean;

  createdAt: Date;
}
