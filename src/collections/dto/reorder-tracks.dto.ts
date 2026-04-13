import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class ReorderTracksDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  trackIds: string[];
}