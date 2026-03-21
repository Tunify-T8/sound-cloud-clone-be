export class CollectionItemDto {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  tracksCount: number;
  likesCount: number;
  createdAt: Date;
}

export class UserCollectionsDto {
  data: CollectionItemDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}
