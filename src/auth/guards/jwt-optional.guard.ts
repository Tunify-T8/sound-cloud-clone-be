import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtOptionalGuard extends AuthGuard('jwt-optional') {
  // Override handleRequest to never throw when user is not authenticated.
  // If token is missing or invalid → return null (req.user = null).
  // If token is valid → return user normally (req.user = { userId, email, role }).
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
  ): TUser | null {
    if (err) throw err; // real errors (e.g. malformed token) still bubble up
    return user || null; // missing/invalid token → null, never 401
  }
}