import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SuspendUserDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;

  @IsString()
  reason!: string;
}
