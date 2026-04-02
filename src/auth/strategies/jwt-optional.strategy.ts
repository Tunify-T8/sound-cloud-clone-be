import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtOptionalStrategy extends PassportStrategy(
  Strategy,
  'jwt-optional',
) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  // Same as JwtAccessStrategy but this never throws —
  // if token is missing Passport won't even call validate(),
  // and handleRequest in the guard will catch that and return null
  validate(payload: { sub: string; email: string; role: string }) {
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}