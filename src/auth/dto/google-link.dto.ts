import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLinkDto {
  @IsString()
  @IsNotEmpty()
  linkingToken: string; // short-lived JWT returned when email conflict detected

  @IsString()
  @IsNotEmpty()
  password: string; // existing LOCAL account password to confirm ownership
}