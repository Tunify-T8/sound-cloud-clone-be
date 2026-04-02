export class ArtistDto{
id: string; 
username: string;
displayName: string | null;

isCertified: boolean;

avatarUrl: string | null;

followersCount: number;
tracksCount: number;

}


export class SuggestionListDto {
  items: ArtistDto[];
  page: number;
  limit: number;
  hasMore: boolean;
}