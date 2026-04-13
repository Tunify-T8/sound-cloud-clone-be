import { IsUUID, IsNotEmpty } from 'class-validator';

export class AddTrackDto {
  @IsUUID()
  @IsNotEmpty()
  trackId: string;
}