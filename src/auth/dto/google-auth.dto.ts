import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  code: string; // authorization code from Google — frontend sends this after Google redirect

  @IsBoolean()
  @IsOptional()
  isMobile?: boolean;
}

