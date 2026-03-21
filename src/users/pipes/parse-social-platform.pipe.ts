import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';

@Injectable()
export class ParseSocialPlatformPipe implements PipeTransform {
  transform(value: string): SocialPlatform {
    const upper = value.toUpperCase();
    if (!Object.values(SocialPlatform).includes(upper as SocialPlatform)) {
      throw new BadRequestException(
        `platform must be one of: ${Object.values(SocialPlatform)
          .map((p) => p.toLowerCase())
          .join(', ')}`,
      );
    }
    return upper as SocialPlatform;
  }
}
