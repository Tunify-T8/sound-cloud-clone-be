import { SocialPlatform } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsUrl,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

export class SocialLinkItemDto {
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  url: string;
  @IsNotEmpty()
  @IsEnum(SocialPlatform)
  platform: SocialPlatform;
}

export class UpdateSocialLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkItemDto)
  links: SocialLinkItemDto[];
}
