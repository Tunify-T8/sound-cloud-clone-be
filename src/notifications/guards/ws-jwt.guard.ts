import { JwtService } from '@nestjs/jwt';

export class WsJwtGuard {
  // Static method so the gateway can call it without injection
  // We'll use the same JWT_SECRET your auth module uses
  static verifyToken(token: string): { sub: string; [key: string]: any } {
    const jwtService = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
    });

    return jwtService.verify(token);
  }
}