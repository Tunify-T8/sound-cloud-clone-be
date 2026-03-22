export class UserDto {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  role: string;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date | null;
  visibility: string;
  isActive: boolean;
  isCertified: boolean;
  followersCount: number;
  followingCount: number;
  tracksCount: number;
  likesReceived: number;
}
